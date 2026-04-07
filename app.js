(function () {
  'use strict';

  // --- Supabase config (replace with your project values) ---
  const SUPABASE_URL = 'https://dubcsyrgrtlzvefxuhni.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR1YmNzeXJncnRsenZlZnh1aG5pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNjQ3MTYsImV4cCI6MjA4ODY0MDcxNn0.rldtsMn7LCqtLtfDFPWTM96Ly0EQEm50LhkbTFey0R4';

  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  let citiesData = [];
  let map = null;
  let winningMarker = null;

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
    ticketClose: null,
    startOverlay: null,
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
    elements.ticketClose = document.getElementById('ticket-close');
    elements.startOverlay = document.getElementById('start-overlay');
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

  async function fetchCities() {
    elements.resultBox.textContent = 'Települések betöltése…';
    try {
      const { data, error } = await supabase
        .from('telepulesek')
        .select('id, nev, lat, lng, erdo_szint, kultura_szint');

      if (error) {
        console.error('Supabase error:', error);
        elements.resultBox.textContent = 'Hiba: ' + (error.message || 'Nem sikerült betölteni az adatokat.');
        return;
      }

      citiesData = Array.isArray(data) ? data : [];

      if (citiesData.length === 0) {
        elements.resultBox.textContent =
          'Nincs település az adatbázisban. Ellenőrizd a \'telepulesek\' táblát és az RLS (Row Level Security) szabályokat a Supabase dashboardon.';
      } else {
        elements.resultBox.textContent = citiesData.length + ' település betöltve. Állítsd a csúszkákat és kattints a keresésre.';
      }
    } catch (err) {
      console.error('Fetch error:', err);
      citiesData = [];
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

    winningMarker = new maplibregl.Marker({ color: '#4c6ef5' })
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

  /** Megmutatja a sorszám overlayt (mobilon CSS-en át látható, desktopon rejtve). */
  function showTicketOverlay(ticketId) {
    if (!elements.ticketOverlay || !elements.ticketNumber) return;
    elements.ticketNumber.textContent = ticketId != null ? String(ticketId) : '–';
    elements.ticketOverlay.removeAttribute('hidden');
    elements.ticketOverlay.setAttribute('aria-hidden', 'false');
  }

  /** Elrejti a sorszám overlayt, törli a markert és a result-box szövegét. */
  function hideTicketOverlay() {
    if (!elements.ticketOverlay) return;
    elements.ticketOverlay.setAttribute('hidden', '');
    elements.ticketOverlay.setAttribute('aria-hidden', 'true');
    if (elements.resultBox) elements.resultBox.textContent = '';
    removeWinningMarker();
  }

  /** Fullscreen kérés (csak mobilon hívódik, user gesture-ből). */
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

  /** Indítóképernyő elrejtése – koppintásra fullscreen + fade out. */
  function dismissStartOverlay() {
    if (!elements.startOverlay) return;
    requestFullscreen();
    elements.startOverlay.classList.add('start-overlay--hidden');
    elements.startOverlay.addEventListener('transitionend', function () {
      elements.startOverlay.remove();
    }, { once: true });
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
      elements.resultBox.textContent = 'Nincs találat. Töltsd be az adatokat, vagy ellenőrizd a kapcsolatot.';
      removeWinningMarker();
    }
  }

  async function init() {
    initElements();
    initMap();
    bindSliderDisplay(elements.erdoSlider, elements.erdoValue);
    bindSliderDisplay(elements.kulturaSlider, elements.kulturaValue);

    elements.searchBtn.addEventListener('click', onSearchClick);

    if (elements.ticketClose) {
      elements.ticketClose.addEventListener('click', hideTicketOverlay);
    }
    if (elements.ticketOverlay) {
      elements.ticketOverlay.addEventListener('click', function (e) {
        if (e.target === elements.ticketOverlay) hideTicketOverlay();
      });
    }

    if (elements.startOverlay) {
      elements.startOverlay.addEventListener('click', dismissStartOverlay);
    }

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
