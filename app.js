(function () {
  'use strict';

  /**
   * Település-határok: `fetch()` a file:// protokollnál (dupla kattintásos index.html) böngészőben
   * blokkolva van — ezért a JSON egy .js bundle-ben töltődik (window.__…), ami file:// alatt is működik.
   * HTTP(S) és GitHub Pages alatt is ugyanez a fájl (new URL relatív az oldalhoz).
   */
  const BUNDLE_SCRIPT_SRC = new URL(
    'data/magyarorszag_telepulesek_kozigazgatasi_hatarai_egyszerusitett.bundle.js',
    window.location.href
  ).href;

  // --- Supabase config (replace with your project values) ---
  const SUPABASE_URL = 'https://dubcsyrgrtlzvefxuhni.supabase.co';
  const SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR1YmNzeXJncnRsenZlZnh1aG5pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNjQ3MTYsImV4cCI6MjA4ODY0MDcxNn0.rldtsMn7LCqtLtfDFPWTM96Ly0EQEm50LhkbTFey0R4';

  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  let citiesData = [];
  /** @type {Map<string, object>} */
  let cityByNormName = new Map();
  let geoIndexed = null;
  let geoLoadPromise = null;

  let map = null;
  let winningMarker = null;
  const refMarkers = { erdo: null, kultura: null };

  let pickMode = null;
  /** @type {((e: maplibregl.MapMouseEvent) => void) | null} */
  let mapClickHandler = null;

  const MAP_STYLE = 'https://tiles.openfreemap.org/styles/positron';
  const HUNGARY_CENTER = [19.5, 47.1];
  const INITIAL_ZOOM = 7;
  const RESULT_ZOOM = 12;

  const elements = {
    mapContainer: null,
    erdoSlider: null,
    kulturaSlider: null,
    erdoValue: null,
    kulturaValue: null,
    searchBtn: null,
    resultBox: null,
    ticketOverlay: null,
    ticketNumber: null,
    startOverlay: null,
    pickErdoBtn: null,
    pickKulturaBtn: null,
    erdoRefLine: null,
    kulturaRefLine: null,
    mapPickingBanner: null,
    mapPickingBannerText: null,
    mapPickingCancel: null,
  };

  function initElements() {
    elements.mapContainer = document.getElementById('map-container');
    elements.erdoSlider = document.getElementById('erdo_szint');
    elements.kulturaSlider = document.getElementById('kultura_szint');
    elements.erdoValue = document.getElementById('erdo_szint-value');
    elements.kulturaValue = document.getElementById('kultura_szint-value');
    elements.searchBtn = document.getElementById('search-btn');
    elements.resultBox = document.getElementById('result-box');
    elements.ticketOverlay = document.getElementById('ticket-overlay');
    elements.ticketNumber = document.getElementById('ticket-number');
    elements.startOverlay = document.getElementById('start-overlay');
    elements.pickErdoBtn = document.getElementById('pick-erdo-btn');
    elements.pickKulturaBtn = document.getElementById('pick-kultura-btn');
    elements.erdoRefLine = document.getElementById('erdo-ref-line');
    elements.kulturaRefLine = document.getElementById('kultura-ref-line');
    elements.mapPickingBanner = document.getElementById('map-picking-banner');
    elements.mapPickingBannerText = document.getElementById('map-picking-banner-text');
    elements.mapPickingCancel = document.getElementById('map-picking-cancel');
  }

  function initMap() {
    map = new maplibregl.Map({
      container: elements.mapContainer,
      style: MAP_STYLE,
      center: HUNGARY_CENTER,
      zoom: INITIAL_ZOOM,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');
  }

  function bindSliderDisplay(slider, valueEl) {
    if (!slider || !valueEl) return;
    function update() {
      valueEl.textContent = slider.value;
    }
    slider.addEventListener('input', update);
    update();
  }

  function normalizeSettlementName(s) {
    if (!s || typeof s !== 'string') return '';
    return s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function rebuildCityIndex() {
    cityByNormName.clear();
    for (let i = 0; i < citiesData.length; i++) {
      const c = citiesData[i];
      if (!c || !c.nev) continue;
      cityByNormName.set(normalizeSettlementName(String(c.nev)), c);
    }
  }

  function ringBBox(ring) {
    if (!ring || ring.length === 0) return [0, 0, 0, 0];
    let minLng = ring[0][0];
    let minLat = ring[0][1];
    let maxLng = ring[0][0];
    let maxLat = ring[0][1];
    for (let i = 1; i < ring.length; i++) {
      const lng = ring[i][0];
      const lat = ring[i][1];
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
    }
    return [minLng, minLat, maxLng, maxLat];
  }

  function geometryBBox(geometry) {
    if (!geometry || !geometry.coordinates) return [0, 0, 0, 0];
    const t = geometry.type;
    const c = geometry.coordinates;
    if (t === 'Polygon') {
      let bb = null;
      for (let p = 0; p < c.length; p++) {
        const rb = ringBBox(c[p]);
        if (!bb) bb = rb.slice();
        else {
          bb[0] = Math.min(bb[0], rb[0]);
          bb[1] = Math.min(bb[1], rb[1]);
          bb[2] = Math.max(bb[2], rb[2]);
          bb[3] = Math.max(bb[3], rb[3]);
        }
      }
      return bb || [0, 0, 0, 0];
    }
    if (t === 'MultiPolygon') {
      let bb = null;
      for (let pi = 0; pi < c.length; pi++) {
        const poly = c[pi];
        for (let r = 0; r < poly.length; r++) {
          const rb = ringBBox(poly[r]);
          if (!bb) bb = rb.slice();
          else {
            bb[0] = Math.min(bb[0], rb[0]);
            bb[1] = Math.min(bb[1], rb[1]);
            bb[2] = Math.max(bb[2], rb[2]);
            bb[3] = Math.max(bb[3], rb[3]);
          }
        }
      }
      return bb || [0, 0, 0, 0];
    }
    return [0, 0, 0, 0];
  }

  /**
   * Ray casting, [lng, lat] sorrend (GeoJSON).
   */
  function pointInRing(p, ring) {
    const x = p[0];
    const y = p[1];
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0];
      const yi = ring[i][1];
      const xj = ring[j][0];
      const yj = ring[j][1];
      const denom = yj - yi;
      if (Math.abs(denom) < 1e-14) continue;
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / denom + xi) {
        inside = !inside;
      }
    }
    return inside;
  }

  function pointInPolygonRings(coords, p) {
    if (!coords || coords.length === 0 || !coords[0]) return false;
    if (!pointInRing(p, coords[0])) return false;
    for (let h = 1; h < coords.length; h++) {
      if (pointInRing(p, coords[h])) return false;
    }
    return true;
  }

  function pointInGeometry(geometry, p) {
    if (!geometry) return false;
    if (geometry.type === 'Polygon') {
      return pointInPolygonRings(geometry.coordinates, p);
    }
    if (geometry.type === 'MultiPolygon') {
      const polys = geometry.coordinates;
      for (let i = 0; i < polys.length; i++) {
        if (pointInPolygonRings(polys[i], p)) return true;
      }
    }
    return false;
  }

  function findSettlementNameAt(lng, lat) {
    if (!geoIndexed || geoIndexed.length === 0) return null;
    const p = [lng, lat];
    for (let i = 0; i < geoIndexed.length; i++) {
      const item = geoIndexed[i];
      const bbox = item.bbox;
      if (lng < bbox[0] || lng > bbox[2] || lat < bbox[1] || lat > bbox[3]) continue;
      if (pointInGeometry(item.geometry, p)) return item.name;
    }
    return null;
  }

  function loadSettlementBoundariesScript() {
    return new Promise(function (resolve, reject) {
      if (window.__HSE_SETTLEMENT_BOUNDARIES) {
        var pre = window.__HSE_SETTLEMENT_BOUNDARIES;
        delete window.__HSE_SETTLEMENT_BOUNDARIES;
        resolve(pre);
        return;
      }
      var scriptId = 'hse-settlement-boundaries-bundle';
      if (document.getElementById(scriptId)) {
        reject(new Error('Település-határ script már töltődik.'));
        return;
      }
      var s = document.createElement('script');
      s.id = scriptId;
      s.async = true;
      s.src = BUNDLE_SCRIPT_SRC;
      s.onload = function () {
        var gj = window.__HSE_SETTLEMENT_BOUNDARIES;
        delete window.__HSE_SETTLEMENT_BOUNDARIES;
        if (!gj || gj.type !== 'FeatureCollection') {
          var bad = document.getElementById(scriptId);
          if (bad) bad.remove();
          reject(new Error('Érvénytelen határadat a bundle-ben.'));
          return;
        }
        resolve(gj);
      };
      s.onerror = function () {
        var failed = document.getElementById(scriptId);
        if (failed) failed.remove();
        reject(new Error('Nem sikerült betölteni: ' + BUNDLE_SCRIPT_SRC));
      };
      document.head.appendChild(s);
    });
  }

  async function ensureGeoIndexed() {
    if (geoIndexed) return;
    if (geoLoadPromise) {
      try {
        await geoLoadPromise;
      } catch (_) {
        geoLoadPromise = null;
      }
      if (geoIndexed) return;
    }
    geoLoadPromise = (async function () {
      var gj = await loadSettlementBoundariesScript();
      var feats = gj.features || [];
      var list = [];
      for (var i = 0; i < feats.length; i++) {
        var f = feats[i];
        var geom = f.geometry;
        var props = f.properties || {};
        var name = props['name:hu'] || props.name;
        if (!name || typeof name !== 'string' || !geom) continue;
        list.push({
          name: name,
          geometry: geom,
          bbox: geometryBBox(geom),
        });
      }
      geoIndexed = list;
    })();
    try {
      await geoLoadPromise;
    } catch (e) {
      geoLoadPromise = null;
      throw e;
    }
  }

  function removeRefMarker(which) {
    const m = refMarkers[which];
    if (m) {
      try {
        m.remove();
      } catch (e) {
        console.warn('Ref marker remove:', e);
      }
      refMarkers[which] = null;
    }
  }

  function setRefMarker(which, lng, lat) {
    removeRefMarker(which);
    if (!map || !Number.isFinite(lng) || !Number.isFinite(lat)) return;
    refMarkers[which] = new maplibregl.Marker({ color: '#0a0a0a' })
      .setLngLat([lng, lat])
      .addTo(map);
  }

  function updatePickButtonActive() {
    const eActive = pickMode === 'erdo';
    const kActive = pickMode === 'kultura';
    if (elements.pickErdoBtn) {
      elements.pickErdoBtn.classList.toggle('is-active', eActive);
      elements.pickErdoBtn.setAttribute('aria-pressed', eActive ? 'true' : 'false');
    }
    if (elements.pickKulturaBtn) {
      elements.pickKulturaBtn.classList.toggle('is-active', kActive);
      elements.pickKulturaBtn.setAttribute('aria-pressed', kActive ? 'true' : 'false');
    }
  }

  function endPick() {
    if (map && mapClickHandler) {
      map.off('click', mapClickHandler);
      mapClickHandler = null;
    }
    pickMode = null;
    document.documentElement.classList.remove('map-picking');
    if (elements.mapContainer) elements.mapContainer.classList.remove('map-picking-cursor');
    if (elements.mapPickingBanner) elements.mapPickingBanner.hidden = true;
    updatePickButtonActive();
    if (map) map.resize();
  }

  function onMapPickClick(e) {
    if (!pickMode || !map) return;
    const lng = e.lngLat.lng;
    const lat = e.lngLat.lat;
    const settlementName = findSettlementNameAt(lng, lat);
    const param = pickMode;

    function lineEl() {
      return param === 'erdo' ? elements.erdoRefLine : elements.kulturaRefLine;
    }

    if (!settlementName) {
      const line = lineEl();
      if (line) {
        line.hidden = false;
        line.classList.add('ref-line--warn');
        line.textContent =
          'Nem sikerült beazonosítani a települést. Kattints egy magyar település közigazgatási határán belülre.';
      }
      return;
    }

    const city = cityByNormName.get(normalizeSettlementName(settlementName));
    if (!city) {
      const line = lineEl();
      if (line) {
        line.hidden = false;
        line.classList.add('ref-line--warn');
        line.textContent =
          'A térképen: ' + settlementName + ' — ez a település nincs az adatbázisban.';
      }
      return;
    }

    const erdoVal = Math.max(0, Math.min(100, Math.round(Number(city.erdo_szint) || 0)));
    const kultVal = Math.max(0, Math.min(100, Math.round(Number(city.kultura_szint) || 0)));
    const displayName = city.nev || settlementName;

    if (param === 'erdo') {
      if (elements.erdoSlider) {
        elements.erdoSlider.value = String(erdoVal);
        elements.erdoSlider.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (elements.erdoRefLine) {
        elements.erdoRefLine.hidden = false;
        elements.erdoRefLine.classList.remove('ref-line--warn');
        elements.erdoRefLine.textContent =
          'Referencia: ' +
          displayName +
          ' — erdei magány (táblázat): ' +
          erdoVal +
          '. Finomítás a csúszkával.';
      }
      setRefMarker('erdo', lng, lat);
    } else {
      if (elements.kulturaSlider) {
        elements.kulturaSlider.value = String(kultVal);
        elements.kulturaSlider.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (elements.kulturaRefLine) {
        elements.kulturaRefLine.hidden = false;
        elements.kulturaRefLine.classList.remove('ref-line--warn');
        elements.kulturaRefLine.textContent =
          'Referencia: ' +
          displayName +
          ' — kulturális pezsgés (táblázat): ' +
          kultVal +
          '. Finomítás a csúszkával.';
      }
      setRefMarker('kultura', lng, lat);
    }

    map.flyTo({
      center: [lng, lat],
      zoom: Math.max(map.getZoom(), 10),
      duration: 900,
      essential: true,
    });

    endPick();
  }

  async function startPick(param) {
    if (pickMode === param) {
      endPick();
      return;
    }
    if (pickMode) endPick();

    if (elements.mapPickingBanner) {
      elements.mapPickingBanner.hidden = false;
      if (elements.mapPickingBannerText)
        elements.mapPickingBannerText.textContent = 'Település-határok betöltése…';
    }
    document.documentElement.classList.add('map-picking');
    if (elements.mapContainer) elements.mapContainer.classList.add('map-picking-cursor');
    if (map) setTimeout(function () { map.resize(); }, 60);

    try {
      await ensureGeoIndexed();
    } catch (err) {
      console.error(err);
      endPick();
      const line = param === 'erdo' ? elements.erdoRefLine : elements.kulturaRefLine;
      if (line) {
        line.hidden = false;
        line.classList.add('ref-line--warn');
        line.textContent =
          'A település-határok fájlja nem töltődött be (data/…bundle.js). Frissíts, vagy nyisd meg lokális szerverről (pl. python3 -m http.server).';
      }
      return;
    }

    if (citiesData.length === 0) {
      endPick();
      if (elements.resultBox)
        elements.resultBox.textContent = 'Előbb töltsd be a település-adatbázist.';
      return;
    }

    pickMode = param;
    if (elements.mapPickingBanner && elements.mapPickingBannerText) {
      elements.mapPickingBanner.hidden = false;
      elements.mapPickingBannerText.textContent =
        param === 'erdo'
          ? 'Erdei magány: koppints a térképre a referencia település határán belül.'
          : 'Kulturális pezsgés: koppints a térképre a referencia település határán belül.';
    }
    updatePickButtonActive();

    mapClickHandler = function (ev) {
      onMapPickClick(ev);
    };
    map.on('click', mapClickHandler);
    if (map) map.resize();
  }

  async function fetchCities() {
    elements.resultBox.textContent = 'Települések betöltése…';
    try {
      const { data, error } = await supabase
        .from('telepulesek')
        .select('id, nev, lat, lng, erdo_szint, kultura_szint');

      if (error) {
        console.error('Supabase error:', error);
        elements.resultBox.textContent =
          'Hiba: ' + (error.message || 'Nem sikerült betölteni az adatokat.');
        return;
      }

      citiesData = Array.isArray(data) ? data : [];
      rebuildCityIndex();

      if (citiesData.length === 0) {
        elements.resultBox.textContent =
          'Nincs település az adatbázisban. Ellenőrizd a \'telepulesek\' táblát és az RLS (Row Level Security) szabályokat a Supabase dashboardon.';
      } else {
        elements.resultBox.textContent =
          citiesData.length +
          ' település betöltve. Állítsd a csúszkákat, kérhetsz referenciát a 📍 gombbal, majd keresés.';
      }
    } catch (err) {
      console.error('Fetch error:', err);
      citiesData = [];
      rebuildCityIndex();
      elements.resultBox.textContent = 'Hiba: nem sikerült csatlakozni az adatbázishoz.';
    }
  }

  /**
   * Find best matching city. Returns { city, finalScore } or null.
   * finalScore = erdo_diff + kultura_diff (max 200).
   */
  function findBestMatch(sliderErdo, sliderKultura) {
    if (!citiesData.length) return null;

    let best = null;
    let minDiff = Infinity;

    for (let i = 0; i < citiesData.length; i++) {
      const city = citiesData[i];
      const erdo = Number(city.erdo_szint) || 0;
      const kultura = Number(city.kultura_szint) || 0;
      const diff = Math.abs(sliderErdo - erdo) + Math.abs(sliderKultura - kultura);

      if (diff < minDiff) {
        minDiff = diff;
        best = city;
      }
    }

    if (!best) return null;
    return { city: best, finalScore: minDiff };
  }

  /** Convert difference (0 = perfect, max 200) to match percentage 0–100 (100 = perfect). */
  function diffToMatchPercent(finalScore) {
    const MAX_DIFF = 200;
    const percent = 100 - (finalScore / MAX_DIFF) * 100;
    return Math.round(Math.max(0, Math.min(100, percent)));
  }

  function removeWinningMarker() {
    if (winningMarker) {
      try {
        winningMarker.remove();
      } catch (e) {
        console.warn('Marker remove:', e);
      }
      winningMarker = null;
    }
  }

  function showResult(winningCity, matchPercent, ticketId) {
    const name = winningCity.nev || '–';
    const percentText = matchPercent != null ? ` – ${matchPercent}% egyezés` : '';
    const ticketText = ticketId != null ? ` (#${ticketId})` : '';
    elements.resultBox.textContent = name + percentText + ticketText;

    const lng = Number(winningCity.lng);
    const lat = Number(winningCity.lat);

    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;

    removeWinningMarker();

    map.flyTo({
      center: [lng, lat],
      zoom: RESULT_ZOOM,
      duration: 1500,
      essential: true,
    });

    winningMarker = new maplibregl.Marker({ color: '#0a0a0a' })
      .setLngLat([lng, lat])
      .addTo(map);
  }

  /**
   * Save the current search result to the 'talalatok' table in Supabase.
   * egyezes_pontszam = match percentage 0–100 (100 = perfect match).
   * Returns the inserted row id (ticket number), or null on failure.
   */
  async function saveSearchResult(winningCity, erdoErtek, kulturaErtek, egyezesPontszam) {
    try {
      const row = {
        telepules_nev: winningCity.nev ?? null,
        lat: winningCity.lat ?? null,
        lng: winningCity.lng ?? null,
        erdo_ertek: erdoErtek,
        kultura_ertek: kulturaErtek,
        egyezes_pontszam: egyezesPontszam != null ? Number(egyezesPontszam) : null,
      };
      const { data, error } = await supabase
        .from('talalatok')
        .insert(row)
        .select('id')
        .single();

      if (error) {
        console.error('Találat mentése sikertelen:', error.message, error);
        return null;
      }
      console.log('Találat sikeresen mentve a "talalatok" táblába:', row, '→ id:', data?.id);
      return data?.id ?? null;
    } catch (err) {
      console.error('Találat mentése közben hiba:', err);
      return null;
    }
  }

  function showTicketOverlay(ticketId) {
    if (!elements.ticketOverlay || !elements.ticketNumber) return;
    elements.ticketNumber.textContent = ticketId != null ? String(ticketId) : '–';
    elements.ticketOverlay.removeAttribute('hidden');
    elements.ticketOverlay.setAttribute('aria-hidden', 'false');
  }

  function hideTicketOverlay() {
    if (!elements.ticketOverlay) return;
    elements.ticketOverlay.setAttribute('hidden', '');
    elements.ticketOverlay.setAttribute('aria-hidden', 'true');
    if (elements.resultBox) elements.resultBox.textContent = '';
    removeWinningMarker();
  }

  function requestFullscreen() {
    const el = document.documentElement;
    try {
      if (el.requestFullscreen) {
        el.requestFullscreen().catch(function () {});
      } else if (el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen();
      }
    } catch (_) {}
  }

  function dismissStartOverlay() {
    if (!elements.startOverlay) return;

    requestFullscreen();

    document.documentElement.classList.add('app-started');

    elements.startOverlay.classList.add('start-overlay--hidden');

    setTimeout(function () {
      if (elements.startOverlay) {
        elements.startOverlay.style.display = 'none';
      }
      if (map) {
        map.resize();
      }
    }, 500);
  }

  async function onSearchClick() {
    const sliderErdo = parseInt(elements.erdoSlider?.value ?? 50, 10) || 0;
    const sliderKultura = parseInt(elements.kulturaSlider?.value ?? 50, 10) || 0;

    const result = findBestMatch(sliderErdo, sliderKultura);

    if (result) {
      const matchPercent = diffToMatchPercent(result.finalScore);
      const ticketId = await saveSearchResult(result.city, sliderErdo, sliderKultura, matchPercent);
      showResult(result.city, matchPercent, ticketId);
      showTicketOverlay(ticketId);
    } else {
      elements.resultBox.textContent =
        'Nincs találat. Töltsd be az adatokat, vagy ellenőrizd a kapcsolatot.';
      removeWinningMarker();
    }
  }

  async function init() {
    initElements();
    initMap();
    bindSliderDisplay(elements.erdoSlider, elements.erdoValue);
    bindSliderDisplay(elements.kulturaSlider, elements.kulturaValue);

    elements.searchBtn.addEventListener('click', onSearchClick);

    if (elements.pickErdoBtn) {
      elements.pickErdoBtn.addEventListener('click', function () {
        startPick('erdo');
      });
    }
    if (elements.pickKulturaBtn) {
      elements.pickKulturaBtn.addEventListener('click', function () {
        startPick('kultura');
      });
    }
    if (elements.mapPickingCancel) {
      elements.mapPickingCancel.addEventListener('click', function () {
        endPick();
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && pickMode) {
        e.preventDefault();
        endPick();
      }
    });

    if (elements.ticketOverlay) {
      elements.ticketOverlay.addEventListener('click', function (e) {
        if (e.target === elements.ticketOverlay) hideTicketOverlay();
      });
    }

    if (elements.startOverlay) {
      elements.startOverlay.addEventListener('click', dismissStartOverlay);
    }

    document.addEventListener('fullscreenchange', function () {
      if (map) setTimeout(function () { map.resize(); }, 100);
    });
    document.addEventListener('webkitfullscreenchange', function () {
      if (map) setTimeout(function () { map.resize(); }, 100);
    });
    window.addEventListener('resize', function () {
      if (map) map.resize();
    });

    await fetchCities();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      init();
    });
  } else {
    init();
  }
})();
