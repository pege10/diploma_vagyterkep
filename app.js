(function () {
  'use strict';

  /**
   * Település-határok: `fetch()` a file:// protokollnál (dupla kattintásos index.html) böngészőben
   * blokkolva van — ezért a JSON egy .js bundle-ben töltődik (window.__…), ami file:// alatt is működik.
   * HTTP(S) és GitHub Pages alatt is ugyanez a fájl (new URL relatív az oldalhoz).
   */
  const BUNDLE_SCRIPT_SRC = new URL(
    'data/magyarorszag_telepulesek_kozigazgatasi_hatarai_egyszerusitett.bundle.js?v=2',
    window.location.href
  ).href;

  /** Fontos hely (földrajzi kör középpont) jelölő szövege a térképen */
  const MAP_MARK_IMPORTANT = 'Fontos hely';

  /**
   * Supabase: projekt URL (REST: .../rest/v1/<table> — a kliens kezeli).
   * Tábla: public.all_parameters — pl.
   * https://dubcsyrgrtlzvefxuhni.supabase.co/rest/v1/all_parameters
   */
  const SUPABASE_URL = 'https://dubcsyrgrtlzvefxuhni.supabase.co';
  const SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR1YmNzeXJncnRsenZlZnh1aG5pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNjQ3MTYsImV4cCI6MjA4ODY0MDcxNn0.rldtsMn7LCqtLtfDFPWTM96Ly0EQEm50LhkbTFey0R4';

  const SUPABASE_TABLE = 'all_parameters';
  const PARAMETER_INFO_TABLE = 'parameter_info';

  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  let citiesData = [];
  /** Oszlopnevek, amelyek kisbetűs „_index” végződéssel rendelkeznek (pl. …_forest_index) */
  let indexParamKeys = [];
  /** @type {Record<string, { min: number, max: number }>} */
  let sliderRanges = {};

  /** Első találat csak a „Tökéletes hely keresése” gombbal; utána a csúszkák változására is fut a keresés. */
  let sliderAutoSearchActive = false;
  let sliderSearchDebounceTimer = null;
  const SLIDER_SEARCH_DEBOUNCE_MS = 280;
  /**
   * Ha a csúszka után debounced performSearch újrarendezi a feedback panelt, a fejléc ehhez
   * igazítva maradjon (kétlépéses rAF a preserveSidebarScrollAnchor után is).
   * @type {HTMLElement | null}
   */
  let sidebarLayoutAnchorEl = null;

  /** Első „Tökéletes hely keresése” kattintás: kikapcsolt mutatóknál modál (oldal újratöltésig egyszer); bezárás = nincs keresés. */
  let firstMainSearchClickWithPrompt = true;

  /** Egyedi id a kategória panel <-> aria-controls összekötéséhez. */
  let paramCategoryUid = 0;

  /**
   * Mutatók sorrendje és feliratai — rögzítve az alkalmazásban (`param` sor: adatmező-prefix az `id` alapján).
   * @type {Array<{ type: 'section', title: string } | { type: 'param', id: string, megnevezes: string }>}
   */
  const PARAMETER_UI_ENTRIES = [
    { type: 'section', title: '1. Természeti környezet' },
    { type: 'param', id: 'forest_index', megnevezes: 'Erdőlefedettség index (3 km)' },
    { type: 'param', id: 'water_index', megnevezes: 'Vízfelület lefedettség index (3 km)' },
    { type: 'param', id: 'terrain_index', megnevezes: 'Hegyvidéki karakter (3 km)' },
    { type: 'param', id: 'airpollution_index', megnevezes: 'Légszennyezettségi index (3 km)' },
    { type: 'section', title: '2. Elérhetőség és közlekedés' },
    { type: 'param', id: 'budapest_car_train_index', megnevezes: 'Budapest elérhetőség - autó + vonat' },
    { type: 'param', id: 'internet_index', megnevezes: 'Internet sebesség index' },
    { type: 'param', id: 'urban_mobility_index', megnevezes: 'Városi mobilitási index' },
    {
      type: 'param',
      id: 'transport_frequency_index',
      megnevezes: 'Tömegközlekedési járatsűrűség-index (járási székhely)',
    },
    { type: 'param', id: 'district_seat_access_index', megnevezes: 'Járásszékhely autós elérhetőségi indexe' },
    { type: 'param', id: 'budapest_access_index', megnevezes: 'Budapest autós elérhetőségi indexe' },
    { type: 'section', title: '3. Helyi szolgáltatások' },
    { type: 'param', id: 'cultural_index', megnevezes: 'Kulturális élet index' },
    { type: 'param', id: 'groceries_index', megnevezes: 'Kiskereskedelmi ellátottsági index' },
    { type: 'param', id: 'sport_index', megnevezes: 'Sport és rekreáció index' },
    { type: 'param', id: 'gastro_index', megnevezes: 'Gasztro és vendéglátás jelenlét index' },
    { type: 'section', title: '4. Társadalom és demográfia' },
    { type: 'param', id: 'senior_index', megnevezes: '65 év feletti lakosság aránya (Senior Index)' },
    { type: 'param', id: 'diploma_index', megnevezes: 'Diplomások normalizált indexe' },
    { type: 'param', id: 'primary_school_proximity_index', megnevezes: 'Általános iskola elérhetősége' },
    { type: 'param', id: 'high_school_proximity_index', megnevezes: 'Gimnázium elérhetősége' },
    { type: 'section', title: '5. Gazdaság és munkaerőpiac' },
    { type: 'param', id: 'real_estate_price_grow_5yrs_index', megnevezes: 'Ingatlanár-emelkedési index (5 év)' },
    { type: 'param', id: 'real_estate_price_avg5mth_index', megnevezes: 'Aktuális ingatlanár-szint (2025-2026)' },
    { type: 'param', id: 'sleeping_city_index', megnevezes: 'Alvóváros index' },
    { type: 'param', id: 'jobs_index', megnevezes: 'Helyi munkalehetőség index' },
    { type: 'param', id: 'turism_index', megnevezes: 'Turizmus index' },
    {
      type: 'param',
      id: 'telepules_nev_egysegesites',
      megnevezes: 'Településnév – Budapest kerületek (közös tábla)',
    },
    { type: 'section', title: '6. Szubjektív paraméterek' },
  ];

  /** @type {Map<string, object>} */
  /** Ékezet-megőrző kulcs → település (pl. „kömlő” ≠ „komló”). */
  let cityByNormName = new Map();
  /** Ékezet nélküli kulcs → több lehetséges település (homonimák). */
  let cityHomonymsByAscii = new Map();
  /** Kerületi sorok (Budapest) — kiszűrve a citiesData-ból, cache */
  let budapestDistrictRowsCache = null;
  let geoIndexed = null;
  let geoLoadPromise = null;

  /** parameter_info.parameter_key (logikai azonosító, pl. forest_index) → tooltip szöveg */
  let parameterInfoByKey = {};
  /** Fontos hely kártyacímek — parameter_info geo_important_a / b megnevezes, ha van */
  let geoImportantPlaceTitle = { a: '', b: '' };

  let map = null;
  let winningMarker = null;

  /** Fekete pin + „Fontos hely” címke a két geo slotra */
  let geoMarkerBySlot = { a: null, b: null };

  /** @type {'geoA' | 'geoB' | null} */
  let pickMode = null;

  /** Fontos hely — kör középpont (Alkalmaz / térkép után). */
  let geoSlotState = {
    a: { city: null, lat: NaN, lng: NaN },
    b: { city: null, lat: NaN, lng: NaN },
  };
  /** @type {((e: maplibregl.MapMouseEvent) => void) | null} */
  let mapClickHandler = null;

  /** Vezetett kitöltés: 2. fontos hely → mutatók a DOM sorrendjében */
  let guidedParamKeys = [];
  let guidedFlowUnlocked = false;
  let guidedFlowParamIndex = 0;
  let guidedFlowIgnoreInputs = false;
  /** Vezetett lépés következő kártyához: görg csak change + ~0,5 s után */
  let guidedScrollTimer = null;

  function clearGuidedScrollTimer() {
    if (guidedScrollTimer != null) {
      clearTimeout(guidedScrollTimer);
      guidedScrollTimer = null;
    }
  }

  const MAP_STYLE = 'https://tiles.openfreemap.org/styles/positron';
  const HUNGARY_CENTER = [19.5, 47.1];
  const INITIAL_ZOOM = 7;
  const RESULT_ZOOM = 12;

  const BUDAPEST_ROMAN_DISTRICT_NUMERALS = [
    'I',
    'II',
    'III',
    'IV',
    'V',
    'VI',
    'VII',
    'VIII',
    'IX',
    'X',
    'XI',
    'XII',
    'XIII',
    'XIV',
    'XV',
    'XVI',
    'XVII',
    'XVIII',
    'XIX',
    'XX',
    'XXI',
    'XXII',
    'XXIII',
  ];

  const elements = {
    mapContainer: null,
    searchBtn: null,
    resultBox: null,
    ticketOverlay: null,
    ticketNumber: null,
    startOverlay: null,
    mapPickingBanner: null,
    mapPickingBannerText: null,
    mapPickingCancel: null,
    geoActiveA: null,
    geoActiveB: null,
    geoCityInputA: null,
    geoCityInputB: null,
    pickGeoABtn: null,
    pickGeoBBtn: null,
    geoRadiusA: null,
    geoRadiusB: null,
    geoRadiusAVal: null,
    geoRadiusBVal: null,
    geoWarnLine: null,
    paramCategoriesHost: null,
    paramRandomAllBtn: null,
    paramRestoreBaselineBtn: null,
    feedbackPanel: null,
    feedbackPanelInner: null,
    firstSearchHintOverlay: null,
    firstSearchHintCloseBtn: null,
  };

  function initElements() {
    elements.mapContainer = document.getElementById('map-container');
    elements.searchBtn = document.getElementById('search-btn');
    elements.resultBox = document.getElementById('result-box');
    elements.ticketOverlay = document.getElementById('ticket-overlay');
    elements.ticketNumber = document.getElementById('ticket-number');
    elements.startOverlay = document.getElementById('start-overlay');
    elements.mapPickingBanner = document.getElementById('map-picking-banner');
    elements.mapPickingBannerText = document.getElementById('map-picking-banner-text');
    elements.mapPickingCancel = document.getElementById('map-picking-cancel');
    elements.paramCategoriesHost = document.getElementById('param-categories-host');
    elements.paramRandomAllBtn = document.getElementById('param-random-all-btn');
    elements.paramRestoreBaselineBtn = document.getElementById('param-restore-baseline-btn');
    elements.feedbackPanel = document.getElementById('feedback-panel');
    elements.feedbackPanelInner = elements.feedbackPanel
      ? elements.feedbackPanel.querySelector('.feedback-panel__inner')
      : null;
    elements.firstSearchHintOverlay = document.getElementById('first-search-hint-overlay');
    elements.firstSearchHintCloseBtn = document.getElementById('first-search-hint-close');
  }

  function initImportantPlaceElements() {
    elements.geoActiveA = document.getElementById('geo-active-a');
    elements.geoActiveB = document.getElementById('geo-active-b');
    elements.geoCityInputA = document.getElementById('geo-city-input-a');
    elements.geoCityInputB = document.getElementById('geo-city-input-b');
    elements.pickGeoABtn = document.getElementById('pick-geo-a-btn');
    elements.pickGeoBBtn = document.getElementById('pick-geo-b-btn');
    elements.geoRadiusA = document.getElementById('geo-radius-a');
    elements.geoRadiusB = document.getElementById('geo-radius-b');
    elements.geoRadiusAVal = document.getElementById('geo-radius-a-val');
    elements.geoRadiusBVal = document.getElementById('geo-radius-b-val');
    elements.geoWarnLine = document.getElementById('geo-warn-line');
  }

  function getSidebarScrollEl() {
    return document.querySelector('.sidebar-scroll');
  }

  /**
   * Kártya kinyitás/zárás után megtartja a fejlécsor pozícióját a viewportban — ellensúlyozza
   * a böngésző fókusz / scroll anchoring miatti görgető ugrást (első kinyitáskor is).
   * @param {Element | null | undefined} anchorEl pl. .param-item__head-row
   * @param {() => void} fn
   */
  function preserveSidebarScrollAnchor(anchorEl, fn) {
    const scroller = getSidebarScrollEl();
    if (!scroller || !anchorEl) {
      fn();
      return;
    }
    const y = anchorEl.getBoundingClientRect().top;
    fn();
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        const y2 = anchorEl.getBoundingClientRect().top;
        const dy = y2 - y;
        if (Number.isFinite(dy) && Math.abs(dy) > 0.5) {
          scroller.scrollTop += dy;
        }
      });
    });
  }

  /**
   * A horgony elem viewport Y pozíciója a DOM-változás előtt (getBoundingClientRect().top).
   * @param {HTMLElement} anchorEl
   * @param {HTMLElement} scroller
   * @param {number} yBeforeViewport
   */
  function applySidebarScrollAnchorAfterLayout(anchorEl, scroller, yBeforeViewport) {
    if (!anchorEl || !scroller || !Number.isFinite(yBeforeViewport)) return;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        const y2 = anchorEl.getBoundingClientRect().top;
        const dy = y2 - yBeforeViewport;
        if (Number.isFinite(dy) && Math.abs(dy) > 0.5) {
          scroller.scrollTop += dy;
        }
      });
    });
  }

  /**
   * Frame-enként visszaállítja a fejléc viewport-beli topját egy rögzített értékre.
   * Első kapcsolós kinyitáskor kell: a range/buborék/RO csak utána reflow-ol (ugrottatás).
   * @param {HTMLElement} anchorEl
   * @param {HTMLElement} scroller
   * @param {number} durationMs
   * @param {number} [viewportTopTarget] Ha megadod, ehhez igazít (pl. a preserve 2× rAF után mért top).
   */
  function maintainSidebarHeadRowViewportTop(anchorEl, scroller, durationMs, viewportTopTarget) {
    if (!anchorEl || !scroller) return;
    const ms = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 550;
    const targetTop = Number.isFinite(viewportTopTarget)
      ? viewportTopTarget
      : anchorEl.getBoundingClientRect().top;
    const t0 =
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();
    function frame() {
      const cur = anchorEl.getBoundingClientRect().top;
      const dy = cur - targetTop;
      if (Math.abs(dy) > 0.5) {
        scroller.scrollTop += dy;
      }
      const t =
        typeof performance !== 'undefined' && typeof performance.now === 'function'
          ? performance.now()
          : Date.now();
      if (t - t0 < ms) {
        requestAnimationFrame(frame);
      }
    }
    requestAnimationFrame(frame);
  }

  /**
   * Első kapcsolós kinyitás: a törzs (csúszka/buborék) ResizeObserverrel később is nőhet —
   * minden méretváltásnál a fejléc viewport-topját visszaállítjuk, + rövid időtartamig rAF-pótló.
   * @param {HTMLElement} wrap .param-item
   * @param {HTMLElement} headRow .param-item__head-row
   */
  function startParamExpandScrollStabilize(wrap, headRow) {
    const sc = getSidebarScrollEl();
    const bodyEl = wrap && wrap.querySelector('.param-item__body');
    if (!sc || !headRow || !bodyEl) {
      return;
    }
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        const targetTop = headRow.getBoundingClientRect().top;
        function applyHeadRowAnchor() {
          const cur = headRow.getBoundingClientRect().top;
          const dy = cur - targetTop;
          if (Math.abs(dy) > 0.5) {
            sc.scrollTop += dy;
          }
        }
        applyHeadRowAnchor();
        let ro = null;
        if (typeof ResizeObserver !== 'undefined') {
          try {
            ro = new ResizeObserver(function () {
              applyHeadRowAnchor();
            });
            ro.observe(bodyEl);
          } catch (e) {
            ro = null;
          }
        }
        maintainSidebarHeadRowViewportTop(headRow, sc, 950, targetTop);
        window.setTimeout(function () {
          applyHeadRowAnchor();
          if (ro) {
            try {
              ro.disconnect();
            } catch (e2) {
              /* ignore */
            }
            ro = null;
          }
          requestAnimationFrame(function () {
            applyHeadRowAnchor();
          });
        }, 1000);
      });
    });
  }

  function getParamInfoTooltipLayer() {
    let el = document.getElementById('param-info-tooltip-layer');
    if (!el) {
      el = document.createElement('div');
      el.id = 'param-info-tooltip-layer';
      el.className = 'param-info-tooltip-layer';
      el.setAttribute('aria-hidden', 'true');
      document.body.appendChild(el);
    }
    return el;
  }

  function getParamInfoTipForWrap(wrap) {
    if (!wrap) return null;
    const id = wrap.getAttribute('data-param-info-tip-id');
    if (id) {
      const t = document.getElementById(id);
      if (t) return t;
    }
    return wrap.querySelector('.param-info-tooltip');
  }

  function showParamTooltipForWrap(wrap) {
    const btn = wrap.querySelector('.param-info-btn');
    const tip = getParamInfoTipForWrap(wrap);
    if (!btn || !tip) return;
    getParamInfoTooltipLayer().appendChild(tip);
    tip.classList.add('param-info-tooltip--visible');
    bindParamInfoTipBridgeEvents(wrap, tip);
    placeParamTooltip(wrap);
  }

  function hideParamTooltipForWrap(wrap) {
    const tip = getParamInfoTipForWrap(wrap);
    if (!tip) return;
    tip.classList.remove('param-info-tooltip--visible');
    wrap.appendChild(tip);
  }

  function isParamInfoTooltipPinned(wrap) {
    return wrap && wrap.getAttribute('data-param-info-pinned') === '1';
  }

  function setParamInfoTooltipPinned(wrap, pinned) {
    if (!wrap) return;
    const btn = wrap.querySelector('.param-info-btn');
    if (pinned) wrap.setAttribute('data-param-info-pinned', '1');
    else wrap.removeAttribute('data-param-info-pinned');
    if (btn) btn.setAttribute('aria-expanded', pinned ? 'true' : 'false');
  }

  function bindParamInfoTipBridgeEvents(wrap, tip) {
    if (!tip || tip.getAttribute('data-param-info-bridge') === '1') return;
    tip.setAttribute('data-param-info-bridge', '1');
    tip.addEventListener('mouseleave', function (e) {
      if (isParamInfoTooltipPinned(wrap)) return;
      const rel = e.relatedTarget;
      if (rel && (wrap === rel || wrap.contains(rel))) return;
      hideParamTooltipForWrap(wrap);
    });
  }

  function dismissPinnedParamInfoTooltipsIfOutside(target) {
    if (!target || typeof target.closest !== 'function') return;
    if (target.closest('.param-info-tooltip')) return;
    if (target.closest('.param-info-wrap')) return;
    document.querySelectorAll('.param-info-wrap[data-param-info-pinned="1"]').forEach(function (w) {
      setParamInfoTooltipPinned(w, false);
      hideParamTooltipForWrap(w);
    });
  }

  function getInactiveParamCategoryLabels() {
    const host = elements.paramCategoriesHost;
    if (!host) return [];
    const items = host.querySelectorAll('.param-item:not(.param-item--geo-place)');
    const names = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].getAttribute('data-param-active') !== '1') {
        const titleEl = items[i].querySelector('.param-item__title');
        const t = titleEl && titleEl.textContent ? titleEl.textContent.trim() : '';
        if (t) names.push(t);
      }
    }
    return names;
  }

  function openFirstSearchHintModal(inactiveLabels) {
    const ov = elements.firstSearchHintOverlay;
    const titleEl = document.getElementById('first-search-hint-title');
    const listEl = document.getElementById('first-search-hint-list');
    if (!ov || !titleEl || !listEl || inactiveLabels.length === 0) return;
    const n = inactiveLabels.length;
    titleEl.textContent =
      'Még egy kérdés: nem akarod kitölteni a maradék ' + n + ' mutatót?';
    listEl.innerHTML = '';
    for (let j = 0; j < inactiveLabels.length; j++) {
      const li = document.createElement('li');
      li.textContent = inactiveLabels[j];
      listEl.appendChild(li);
    }
    ov.removeAttribute('hidden');
    ov.setAttribute('aria-hidden', 'false');
    if (elements.firstSearchHintCloseBtn) {
      try {
        elements.firstSearchHintCloseBtn.focus();
      } catch (e) {
        /* ignore */
      }
    }
  }

  function closeFirstSearchHintModal() {
    const ov = elements.firstSearchHintOverlay;
    if (ov) {
      ov.setAttribute('hidden', '');
      ov.setAttribute('aria-hidden', 'true');
    }
    firstMainSearchClickWithPrompt = false;
  }

  function initFirstSearchHintModal() {
    const ov = elements.firstSearchHintOverlay;
    const btn = elements.firstSearchHintCloseBtn;
    if (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        closeFirstSearchHintModal();
      });
    }
    if (ov) {
      ov.addEventListener('click', function (e) {
        if (e.target === ov) closeFirstSearchHintModal();
      });
    }
  }

  function initMap() {
    map = new maplibregl.Map({
      container: elements.mapContainer,
      style: MAP_STYLE,
      center: HUNGARY_CENTER,
      zoom: INITIAL_ZOOM,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.on('load', function () {
      ensureImportantPlaceLayers();
      updateImportantPlaceCircles();
    });

    map.on('click', onCityInfoMapClick);
  }

  /** Mutatócsúszkák felirataihoz (min / max / élő érték), a lépéssel összhangban. */
  function formatParamSliderNumber(value, step) {
    const v = typeof value === 'number' ? value : parseFloat(value);
    if (!Number.isFinite(v)) return String(value);
    const st = step != null ? parseFloat(step) : NaN;
    if (Number.isFinite(st) && st > 0 && st < 1) {
      const dec = st >= 0.1 ? 1 : 2;
      return String(dec === 1 ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100);
    }
    return String(Math.round(v));
  }

  /** Fontosság csúszska: 0…10 egész, a számításban w/10 (0–1) normalizált súlyként. */
  var PARAM_WEIGHT_SLIDER_MAX = 10;

  /** Egyezzen a CSS ::-webkit-slider-thumb szélességével / magasságával. */
  var PARAM_RANGE_THUMB_SIZE_PX = 18;

  /**
   * Hüvelykujj középpontja → buborék `left` px a .slider-wrap-hoz képest (nem %-ban, így nincs kerekítési eltérés).
   * A viewport-sk közötti eltéréssel a wrap és a range elcsúszása is figyelembe kerül.
   */
  function rangeInputThumbBubbleLeftPx(slider, wrap) {
    if (!slider || slider.nodeName !== 'INPUT' || slider.type !== 'range' || !wrap) return NaN;
    const min = parseFloat(slider.min);
    const max = parseFloat(slider.max);
    const v = parseFloat(slider.value);
    const sRect = slider.getBoundingClientRect();
    const wRect = wrap.getBoundingClientRect();
    const thumb = PARAM_RANGE_THUMB_SIZE_PX;
    if (wRect.width <= 0 || sRect.width <= 0) return NaN;
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min || !Number.isFinite(v)) return NaN;
    let centerVx;
    if (sRect.width <= thumb) {
      const t = (v - min) / (max - min);
      centerVx = sRect.left + Math.max(0, Math.min(1, t)) * sRect.width;
    } else {
      const t = (v - min) / (max - min);
      const clampedT = Math.max(0, Math.min(1, t));
      centerVx = sRect.left + thumb / 2 + clampedT * (sRect.width - thumb);
    }
    return centerVx - wRect.left;
  }

  /**
   * Buborék a hüvelykujj középpontja fölött. `wrap` = .slider-wrap szülő (position:relative).
   * @param {(sl: HTMLInputElement) => string} getBubbleText
   */
  function bindSliderThumbBubble(slider, bubble, wrap, getBubbleText) {
    if (!slider || !bubble || !wrap || !getBubbleText) return;
    function applyBubblePosition() {
      const x = rangeInputThumbBubbleLeftPx(slider, wrap);
      if (Number.isFinite(x)) {
        bubble.style.left = Math.max(0, x) + 'px';
      }
      bubble.style.transform = 'translateX(-50%)';
    }
    function place() {
      window.requestAnimationFrame(function () {
        applyBubblePosition();
        const text = getBubbleText(slider);
        bubble.textContent = text;
        if (slider) slider.setAttribute('aria-valuetext', text);
      });
    }
    function onScrollOrResize() {
      applyBubblePosition();
    }
    slider.addEventListener('input', place);
    slider.addEventListener('change', place);
    window.addEventListener('scroll', onScrollOrResize, true);
    const sidebarEl =
      document.querySelector('.sidebar-scroll') || document.querySelector('.sidebar');
    if (sidebarEl) sidebarEl.addEventListener('scroll', onScrollOrResize, { passive: true });
    const slidersScrollEl = wrap.closest('.param-sliders-host');
    if (slidersScrollEl) slidersScrollEl.addEventListener('scroll', onScrollOrResize, { passive: true });
    if (typeof ResizeObserver !== 'undefined') {
      try {
        const ro = new ResizeObserver(place);
        ro.observe(slider);
        ro.observe(wrap);
      } catch (e) {
        window.addEventListener('resize', place);
      }
    } else {
      window.addEventListener('resize', place);
    }
    place();
  }

  function forestCompanionRatioColumnKey(indexKey) {
    if (typeof indexKey !== 'string' || !/_forest_index$/i.test(indexKey)) return null;
    return indexKey.replace(/_forest_index$/i, '_forest_ratio');
  }

  function waterCompanionRatioColumnKey(indexKey) {
    if (typeof indexKey !== 'string' || !/_water_index$/i.test(indexKey)) return null;
    return indexKey.replace(/_water_index$/i, '_water_ratio');
  }

  function terrainCompanionSlopeColumnKey(indexKey) {
    if (typeof indexKey !== 'string' || !/_terrain_index$/i.test(indexKey)) return null;
    return indexKey.replace(/_terrain_index$/i, '_slope_mean');
  }

  function budapestCarTrainCompanionTotalMinKey(indexKey) {
    if (typeof indexKey !== 'string' || !/_budapest_car_train_index$/i.test(indexKey)) return null;
    return indexKey.replace(/_budapest_car_train_index$/i, '_total_min');
  }

  function internetCompanionMbpsKey(indexKey) {
    if (typeof indexKey !== 'string' || !/_internet_index$/i.test(indexKey)) return null;
    return indexKey.replace(/_internet_index$/i, '_avg_d_mbps');
  }

  function transportFrequencyCompanionNapiJaratokKey(indexKey) {
    if (typeof indexKey !== 'string' || !/_transport_frequency_index$/i.test(indexKey)) return null;
    return indexKey.replace(/_transport_frequency_index$/i, '_napi_jaratok');
  }

  function districtSeatCompanionPercKey(indexKey) {
    if (typeof indexKey !== 'string' || !/_jarasszekhely_auto_index$/i.test(indexKey)) return null;
    return indexKey.replace(/_jarasszekhely_auto_index$/i, '_jarasszekhely_perc');
  }

  function budapestAccessCompanionPercKey(indexKey) {
    if (typeof indexKey !== 'string' || !/_budapest_auto_index$/i.test(indexKey)) return null;
    return indexKey.replace(/_budapest_auto_index$/i, '_budapest_perc');
  }

  function groceriesCompanionKmKey(indexKey) {
    if (typeof indexKey !== 'string' || !/_kisker_index$/i.test(indexKey)) return null;
    return indexKey.replace(/_kisker_index$/i, '_legkozelebbi_uzlet_km');
  }

  function groceriesCompanionBrandsKey(indexKey) {
    if (typeof indexKey !== 'string' || !/_kisker_index$/i.test(indexKey)) return null;
    return indexKey.replace(/_kisker_index$/i, '_unique_brandek_5km');
  }

  function sportCompanionSportagDbKey(indexKey) {
    if (typeof indexKey !== 'string' || !/_sport_index$/i.test(indexKey)) return null;
    return indexKey.replace(/_sport_index$/i, '_sportag_db');
  }

  function sportCompanionLetesitmenyDbKey(indexKey) {
    if (typeof indexKey !== 'string' || !/_sport_index$/i.test(indexKey)) return null;
    return indexKey.replace(/_sport_index$/i, '_letesitmeny_db');
  }

  function gastroCompanionGasztroDbKey(indexKey) {
    if (typeof indexKey !== 'string' || !/_gasztro_index$/i.test(indexKey)) return null;
    return indexKey.replace(/_gasztro_index$/i, '_gasztro_db');
  }

  function seniorCompanionArany65Key(indexKey) {
    if (typeof indexKey !== 'string' || !/_senior_index$/i.test(indexKey)) return null;
    return indexKey.replace(/_senior_index$/i, '_arany_65_felett');
  }

  function diplomaCompanionAranyaKey(indexKey) {
    if (typeof indexKey !== 'string' || !/_diploma_index$/i.test(indexKey)) return null;
    return indexKey.replace(/_diploma_index$/i, '_diplomasok_aranya');
  }

  /** Nem-törő szóköz: a szám és az egysége közé kerül, így a buborék/felirat nem tördel be
   *  „pont az egységjel előtt" (pl. hegyvidéki ° nem ugrik új sorba). */
  var NBSP = '\u00A0';

  function formatForestRatioForUi(ratio) {
    if (ratio == null || !Number.isFinite(ratio)) return '–';
    const pct = Math.round(ratio * 1000) / 10;
    const s = String(pct);
    const t = s.indexOf('.') !== -1 ? s.replace('.', ',') : s;
    return t + NBSP + '%';
  }

  function formatSlopeDegreesForUi(deg) {
    if (deg == null || !Number.isFinite(deg)) return '–';
    const x = Math.round(deg * 10) / 10;
    const s = String(x);
    const t = s.indexOf('.') !== -1 ? s.replace('.', ',') : s;
    return t + NBSP + '°';
  }

  function formatMinutesForUi(minutes) {
    if (minutes == null || !Number.isFinite(minutes)) return '–';
    const x = Math.round(minutes * 10) / 10;
    const s = String(x);
    const t = s.indexOf('.') !== -1 ? s.replace('.', ',') : s;
    return t + NBSP + 'perc';
  }

  function formatMbpsForUi(mbps) {
    if (mbps == null || !Number.isFinite(mbps)) return '–';
    const x = Math.round(mbps * 100) / 100;
    const s = String(x);
    const t = s.indexOf('.') !== -1 ? s.replace('.', ',') : s;
    return t + NBSP + 'Mbps';
  }

  function formatNapiJaratokForUi(n) {
    if (n == null || !Number.isFinite(n)) return '–';
    return String(Math.round(n)) + NBSP + 'járat/nap';
  }

  function formatGroceriesPairForUi(km, shops) {
    if (km == null || !Number.isFinite(km) || shops == null || !Number.isFinite(shops)) return '–';
    const x = Math.round(km * 100) / 100;
    const s = String(x);
    const kmStr = s.indexOf('.') !== -1 ? s.replace('.', ',') : s;
    return kmStr + NBSP + 'km\n' + String(Math.round(shops)) + NBSP + 'üzlet';
  }

  function formatSportPairForUi(sportag, letes) {
    if (sportag == null || !Number.isFinite(sportag) || letes == null || !Number.isFinite(letes)) {
      return '–';
    }
    return String(Math.round(sportag)) + NBSP + 'sportág\n' + String(Math.round(letes)) + NBSP + 'létesítmény';
  }

  function formatKmForUi(km) {
    if (km == null || !Number.isFinite(km)) return '–';
    const x = Math.round(km * 10) / 10;
    const s = String(x);
    const t = s.indexOf('.') !== -1 ? s.replace('.', ',') : s;
    return t + NBSP + 'km';
  }

  function formatVendeglatohelyForUi(n) {
    if (n == null || !Number.isFinite(n)) return '–';
    return String(Math.round(n)) + NBSP + 'vendéglátóhely';
  }

  /** Ingatlan emelkedés % — az adat már százalékban van (nem 0–1 arány). */
  function formatIngatlanPctForUi(pct) {
    if (pct == null || !Number.isFinite(pct)) return '–';
    const x = Math.round(pct * 10) / 10;
    const s = String(x);
    const t = s.indexOf('.') !== -1 ? s.replace('.', ',') : s;
    return t + NBSP + '%';
  }

  function parseHufAmount(val) {
    if (val == null || val === '') return null;
    const digits = String(val).replace(/[^\d]/g, '');
    if (!digits) return null;
    const n = Number(digits);
    return Number.isFinite(n) ? n : null;
  }

  function formatHufForUi(amount) {
    if (amount == null || !Number.isFinite(amount)) return '–';
    const n = Math.round(amount);
    const s = String(n);
    const grouped = s.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
    return grouped + NBSP + 'Ft';
  }

  var INGATLAN_GROW_VARIANTS = [
    { id: 'haz', label: 'Ház', indexMatch: /house_price_grow_5yrs_index$/i, companionSuffix: 'haz_emelkedes_pct' },
    { id: 'lakas', label: 'Lakás', indexMatch: /flat_price_grow_5yrs_index$/i, companionSuffix: 'lakas_emelkedes_pct' },
    { id: 'telek', label: 'Telek', indexMatch: /site_price_grow_5yrs_index$/i, companionSuffix: 'telek_emelkedes_pct' },
  ];

  var INGATLAN_AVG_VARIANTS = [
    { id: 'haz', label: 'Ház', indexMatch: /house_avg_index$/i, companionSuffix: 'haz_atlag' },
    { id: 'lakas', label: 'Lakás', indexMatch: /flat_avg_index$/i, companionSuffix: 'lakas_atlag' },
    { id: 'telek', label: 'Telek', indexMatch: /site_avg_index$/i, companionSuffix: 'telek_atlag' },
  ];

  /** Ingatlan típusváltó: bal → jobb (telek, lakás, ház) */
  var INGATLAN_SEGMENT_ORDER = ['telek', 'lakas', 'haz'];
  var INGATLAN_SEGMENT_INDEX = { telek: 0, lakas: 1, haz: 2 };

  /** Iskola: állami | alternatív — normalizált index a csúszkán/keresésben, legközelebbi km a buborékban */
  var SCHOOL_SEGMENT_ORDER = ['allami', 'alternativ'];
  var SCHOOL_SEGMENT_INDEX = { allami: 0, alternativ: 1 };

  var SCHOOL_PRIMARY_VARIANTS = [
    {
      id: 'allami',
      label: 'Állami iskola',
      indexKey: 'SCHOOL_PROXIMITY_INDEX_alt_sima_index',
      companionKey: 'SCHOOL_PROXIMITY_INDEX_alt_sima_legkozelebbi_km',
    },
    {
      id: 'alternativ',
      label: 'Alternatív iskola',
      indexKey: 'SCHOOL_PROXIMITY_INDEX_alt_alt_index',
      companionKey: 'SCHOOL_PROXIMITY_INDEX_alt_alt_legkozelebbi_km',
    },
  ];

  var SCHOOL_GYMNASIUM_VARIANTS = [
    {
      id: 'allami',
      label: 'Állami középiskola',
      indexKey: 'SCHOOL_PROXIMITY_INDEX_gim_sima_index',
      companionKey: 'SCHOOL_PROXIMITY_INDEX_gim_sima_legkozelebbi_km',
    },
    {
      id: 'alternativ',
      label: 'Alternatív középiskola',
      indexKey: 'SCHOOL_PROXIMITY_INDEX_gim_alt_index',
      companionKey: 'SCHOOL_PROXIMITY_INDEX_gim_alt_legkozelebbi_km',
    },
  ];

  function schoolVariantDefsForUiParam(uiParamId) {
    if (uiParamId === 'primary_school_proximity_index') return SCHOOL_PRIMARY_VARIANTS;
    if (uiParamId === 'high_school_proximity_index') return SCHOOL_GYMNASIUM_VARIANTS;
    return [];
  }

  function schoolIndexKeyPresent(indexKey, sampleRow) {
    if (!indexKey) return false;
    const row = sampleRow || (citiesData.length ? citiesData[0] : null);
    return !!(row && Object.prototype.hasOwnProperty.call(row, indexKey));
  }

  function schoolResolvedIndexKeysForUiParam(uiParamId) {
    const row = citiesData.length ? citiesData[0] : null;
    const defs = schoolVariantDefsForUiParam(uiParamId);
    const out = [];
    for (let i = 0; i < defs.length; i++) {
      const k = defs[i].indexKey;
      if (schoolIndexKeyPresent(k, row) && out.indexOf(k) === -1) out.push(k);
    }
    return out;
  }

  function augmentIndexParamKeysWithSchool(keys) {
    if (!citiesData.length || !citiesData[0]) return keys;
    const set = new Set(keys);
    const defs = SCHOOL_PRIMARY_VARIANTS.concat(SCHOOL_GYMNASIUM_VARIANTS);
    for (let i = 0; i < defs.length; i++) {
      const k = defs[i].indexKey;
      if (schoolIndexKeyPresent(k, citiesData[0])) set.add(k);
    }
    return Array.from(set);
  }

  function schoolKeysMatchingUiParam(uiParamId, keys) {
    const resolved = schoolResolvedIndexKeysForUiParam(uiParamId);
    const keySet = new Set(keys);
    return resolved.filter(function (k) {
      return keySet.has(k);
    });
  }

  function buildSchoolVariantMap(uiParamId) {
    const variantMap = {};
    const row = citiesData.length ? citiesData[0] : null;
    const defs = schoolVariantDefsForUiParam(uiParamId);
    for (let i = 0; i < defs.length; i++) {
      const vd = defs[i];
      if (!schoolIndexKeyPresent(vd.indexKey, row)) continue;
      const indexKey = vd.indexKey;
      if (!sliderRanges[indexKey] && citiesData.length) {
        sliderRanges[indexKey] = columnMinMax(indexKey, citiesData);
      }
      if (!sliderRanges[indexKey]) continue;
      variantMap[vd.id] = { indexKey: indexKey, companionKey: vd.companionKey };
    }
    return variantMap;
  }

  function ingatlanCompanionColumnKey(indexKey, companionSuffix) {
    if (!indexKey || !companionSuffix) return null;
    const m = String(indexKey).match(/^(INGATLANPIAC_)/i);
    if (!m) return null;
    return m[1] + companionSuffix;
  }

  function findIngatlanIndexKeyForVariant(allKeys, indexMatch) {
    for (let i = 0; i < allKeys.length; i++) {
      if (indexMatch.test(allKeys[i])) return allKeys[i];
    }
    return null;
  }

  /**
   * Indexcsúszka értékéhez: azonos (kerekített) indexű településeken a companion oszlop átlaga;
   * hiány esetén a rendezett indexkulcsok közötti lineáris interpoláció.
   * A csúszka továbbra is indexet tárol; a keresés/súlyozás index alapú marad.
   * @param {string} indexKey
   * @param {string} companionKey pl. …_forest_ratio, …_water_ratio, …_slope_mean
   */
  function createIndexCompanionAverageModel(indexKey, companionKey, step, parseCompanionValue) {
    const rng = sliderRanges[indexKey];
    if (!companionKey || !rng || !citiesData.length) return null;
    const parseC =
      typeof parseCompanionValue === 'function' ? parseCompanionValue : parseNumeric;

    const idxMin = rng.min;
    const idxMax = rng.max;
    /** @type {Map<number, { sum: number, n: number }>} */
    const byIndex = new Map();
    for (let i = 0; i < citiesData.length; i++) {
      const row = citiesData[i];
      const ix = parseNumeric(row[indexKey]);
      const r = parseC(row[companionKey]);
      if (ix == null || r == null) continue;
      const k = Math.round(ix);
      const acc = byIndex.get(k);
      if (!acc) byIndex.set(k, { sum: r, n: 1 });
      else {
        acc.sum += r;
        acc.n += 1;
      }
    }

    const sortedKeys = Array.from(byIndex.keys()).sort(function (a, b) {
      return a - b;
    });
    if (sortedKeys.length === 0) return null;

    function avgForKey(k) {
      const a = byIndex.get(k);
      if (!a) return null;
      return a.sum / a.n;
    }

    function valueAtSliderValue(sliderVal) {
      const v = snapToStep(parseFloat(sliderVal), idxMin, idxMax, step);
      if (!Number.isFinite(v)) return null;
      const rk = Math.round(v);
      const direct = avgForKey(rk);
      if (direct != null) return direct;

      let i0 = -1;
      let i1 = -1;
      for (let i = 0; i < sortedKeys.length; i++) {
        if (sortedKeys[i] <= rk) i0 = i;
        if (sortedKeys[i] >= rk) {
          i1 = i;
          break;
        }
      }
      if (i0 < 0 && i1 < 0) return null;
      if (i0 < 0) return avgForKey(sortedKeys[i1]);
      if (i1 < 0) return avgForKey(sortedKeys[i0]);
      if (i0 === i1) return avgForKey(sortedKeys[i0]);
      const k0 = sortedKeys[i0];
      const k1 = sortedKeys[i1];
      const r0 = avgForKey(k0);
      const r1 = avgForKey(k1);
      if (r0 == null) return r1;
      if (r1 == null) return r0;
      if (k1 === k0) return r0;
      const t = (rk - k0) / (k1 - k0);
      return r0 + t * (r1 - r0);
    }

    return { valueAtSliderValue: valueAtSliderValue };
  }

  /**
   * Indexcsúszka: szélső feliratok és buborék = companion metrika (%, °), érték indexből számolt átlag.
   */
  function buildIndexCompanionSliderStack(input, step, minIndex, maxIndex, model, formatValue) {
    const stack = document.createElement('div');
    stack.className = 'param-slider-stack param-slider-stack--index-companion';

    const row = document.createElement('div');
    row.className = 'param-range-row';

    const minEl = document.createElement('span');
    minEl.className = 'param-range-end param-range-end--min';
    minEl.textContent = formatValue(model.valueAtSliderValue(minIndex));

    const maxEl = document.createElement('span');
    maxEl.className = 'param-range-end param-range-end--max';
    maxEl.textContent = formatValue(model.valueAtSliderValue(maxIndex));

    const wrap = document.createElement('div');
    wrap.className = 'slider-wrap param-range-thumb-wrap';

    const bubble = document.createElement('div');
    bubble.className = 'slider-bubble param-range-value-bubble';
    bubble.setAttribute('aria-hidden', 'true');

    wrap.appendChild(bubble);
    wrap.appendChild(input);

    row.appendChild(minEl);
    row.appendChild(wrap);
    row.appendChild(maxEl);

    stack.appendChild(row);

    bindSliderThumbBubble(input, bubble, wrap, function (sl) {
      return formatValue(model.valueAtSliderValue(parseFloat(sl.value)));
    });

    return stack;
  }

  /**
   * Két companion metrika ugyanarra az indexre (pl. km + üzletszám, sportág + létesítmény).
   * @param {function(number|null, number|null): string} formatPair
   */
  function buildTwoCompanionSliderStack(input, step, minIndex, maxIndex, modelA, modelB, formatPair) {
    const stack = document.createElement('div');
    stack.className = 'param-slider-stack param-slider-stack--index-companion';

    const row = document.createElement('div');
    row.className = 'param-range-row';

    const minEl = document.createElement('span');
    minEl.className = 'param-range-end param-range-end--min';
    minEl.textContent = formatPair(
      modelA.valueAtSliderValue(minIndex),
      modelB.valueAtSliderValue(minIndex)
    );

    const maxEl = document.createElement('span');
    maxEl.className = 'param-range-end param-range-end--max';
    maxEl.textContent = formatPair(
      modelA.valueAtSliderValue(maxIndex),
      modelB.valueAtSliderValue(maxIndex)
    );

    const wrap = document.createElement('div');
    wrap.className = 'slider-wrap param-range-thumb-wrap';

    const bubble = document.createElement('div');
    bubble.className = 'slider-bubble param-range-value-bubble';
    bubble.setAttribute('aria-hidden', 'true');

    wrap.appendChild(bubble);
    wrap.appendChild(input);

    row.appendChild(minEl);
    row.appendChild(wrap);
    row.appendChild(maxEl);

    stack.appendChild(row);

    bindSliderThumbBubble(input, bubble, wrap, function (sl) {
      const v = parseFloat(sl.value);
      return formatPair(modelA.valueAtSliderValue(v), modelB.valueAtSliderValue(v));
    });

    return stack;
  }

  /**
   * [min] | buborék + range | [max]; élő érték a hüvelykujj buborékban.
   */
  function buildParamRangeRowWithExtrema(input, step, minVal, maxVal, formatValue) {
    function fmtVal(v) {
      if (formatValue) return formatValue(v);
      return formatParamSliderNumber(v, step);
    }

    const stack = document.createElement('div');
    stack.className = 'param-slider-stack';

    const row = document.createElement('div');
    row.className = 'param-range-row';

    const minEl = document.createElement('span');
    minEl.className = 'param-range-end param-range-end--min';
    minEl.textContent = fmtVal(minVal);

    const maxEl = document.createElement('span');
    maxEl.className = 'param-range-end param-range-end--max';
    maxEl.textContent = fmtVal(maxVal);

    const wrap = document.createElement('div');
    wrap.className = 'slider-wrap param-range-thumb-wrap';

    const bubble = document.createElement('div');
    bubble.className = 'slider-bubble param-range-value-bubble';
    bubble.setAttribute('aria-hidden', 'true');

    wrap.appendChild(bubble);
    wrap.appendChild(input);

    row.appendChild(minEl);
    row.appendChild(wrap);
    row.appendChild(maxEl);

    stack.appendChild(row);

    bindSliderThumbBubble(input, bubble, wrap, function (sl) {
      const v = parseFloat(sl.value);
      if (!Number.isFinite(v)) return String(sl.value);
      return fmtVal(v);
    });

    return stack;
  }

  /** A sáv bármely pontjára kattintva ugorjon oda az érték (a hüvelykujj közelében nem avatkozunk be). */
  function bindParamRangeTrackSeek(el) {
    if (!el || el.nodeName !== 'INPUT' || el.type !== 'range') return;
    el.addEventListener('click', function (e) {
      const rect = el.getBoundingClientRect();
      const width = rect.width;
      if (width <= 0) return;
      const min = parseFloat(el.min);
      const max = parseFloat(el.max);
      const stepRaw = parseFloat(el.step);
      const step = Number.isFinite(stepRaw) && stepRaw > 0 ? stepRaw : 1;
      if (!Number.isFinite(min) || !Number.isFinite(max)) return;
      const span = max - min;
      if (span <= 0) return;

      const thumb = PARAM_RANGE_THUMB_SIZE_PX;

      const cur = parseFloat(el.value);
      if (Number.isFinite(cur)) {
        let thumbCenterLocal;
        if (width <= thumb) {
          thumbCenterLocal = ((cur - min) / span) * width;
        } else {
          const tCur = (cur - min) / span;
          thumbCenterLocal = thumb / 2 + Math.max(0, Math.min(1, tCur)) * (width - thumb);
        }
        const thumbCx = rect.left + thumbCenterLocal;
        const CLICK_NEAR_THUMB_PX = 14;
        if (Math.abs(e.clientX - thumbCx) <= CLICK_NEAR_THUMB_PX) return;
      }

      let tClick;
      if (width <= thumb) {
        tClick = (e.clientX - rect.left) / width;
      } else {
        tClick = (e.clientX - rect.left - thumb / 2) / (width - thumb);
      }
      const clamped = Math.max(0, Math.min(1, tClick));
      const raw = min + clamped * span;
      const v = snapToStep(raw, min, max, step);
      const prev = parseFloat(el.value);
      if (Number.isFinite(prev) && Math.abs(v - prev) < 1e-9) return;
      el.value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  function buildImportantPlaceLabelEl(settlementName) {
    const wrap = document.createElement('div');
    wrap.className = 'map-geo-important';
    const city = document.createElement('span');
    city.className = 'map-geo-important__city';
    const raw = settlementName != null ? String(settlementName).trim() : '';
    city.textContent = raw.length ? raw : '–';
    const tag = document.createElement('span');
    tag.className = 'map-geo-important__tag';
    tag.textContent = MAP_MARK_IMPORTANT;
    wrap.appendChild(city);
    wrap.appendChild(tag);
    return wrap;
  }

  function buildWinningCardEl(cityName) {
    const wrap = document.createElement('div');
    wrap.className = 'map-win-marker';
    wrap.setAttribute('role', 'img');
    wrap.setAttribute('aria-label', 'Tökéletes hely: ' + (cityName || ''));
    const stack = document.createElement('div');
    stack.className = 'map-win-marker__stack';
    const title = document.createElement('span');
    title.className = 'map-win-marker__title';
    title.textContent = 'Tökéletes hely';
    const city = document.createElement('span');
    city.className = 'map-win-marker__city';
    city.textContent = cityName || '–';
    stack.appendChild(title);
    stack.appendChild(city);
    wrap.appendChild(stack);
    return wrap;
  }

  /** Ékezet nélküli, kisbetűs kulcs — homonimák összevetéséhez (Kömlő ≈ Komló → „komlo”). */
  function normalizeSettlementName(s) {
    if (!s || typeof s !== 'string') return '';
    return s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  /** Ékezet megőrzése — egyértelmű névegyezéshez (kömlő ≠ komló). */
  function normalizeSettlementNameStrict(s) {
    if (!s || typeof s !== 'string') return '';
    return s.normalize('NFC').toLowerCase().trim();
  }

  /** Choropleth poligon feature id (promoteId) — ékezetes, ne keveredjen Komló / Kömlő. */
  function geoPolygonFeatureId(label) {
    return normalizeSettlementNameStrict(String(label || ''));
  }

  function registerAsciiHomonym(asciiKey, city) {
    if (!asciiKey || !city) return;
    let arr = cityHomonymsByAscii.get(asciiKey);
    if (!arr) {
      arr = [];
      cityHomonymsByAscii.set(asciiKey, arr);
    }
    if (arr.indexOf(city) === -1) arr.push(city);
  }

  function formatCityWithCounty(c) {
    const nm = cityName(c);
    const co = countyOfCity(c);
    return co ? nm + ' (' + co + ')' : nm;
  }

  /** Homonimák közül: először ékezet szerinti egyezés, majd legközelebbi koordináta. */
  function resolveCityHomonym(candidates, rawLabel, lng, lat) {
    if (!candidates || candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];
    const processed = preprocessSettlementQuery(String(rawLabel || ''));
    const strictQ = normalizeSettlementNameStrict(processed);
    if (strictQ) {
      for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i];
        if (normalizeSettlementNameStrict(cityName(c)) === strictQ) return c;
      }
    }
    if (Number.isFinite(lng) && Number.isFinite(lat)) {
      let best = null;
      let bestKm = Infinity;
      for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i];
        const clat = cityLat(c);
        const clng = cityLng(c);
        if (!Number.isFinite(clat) || !Number.isFinite(clng)) continue;
        const d = haversineKm(lat, lng, clat, clng);
        if (d < bestKm) {
          bestKm = d;
          best = c;
        }
      }
      if (best) return best;
    }
    return null;
  }

  /** „első kerület” → 1, stb.; a kereső és a javaslatok előtt fut. */
  function preprocessSettlementQuery(raw) {
    var s = String(raw || '');
    s = s.replace(/\belső\b/gi, '1');
    s = s.replace(/\belso\b/gi, '1');
    s = s.replace(/\bmásodik\b/gi, '2');
    s = s.replace(/\bmasodik\b/gi, '2');
    s = s.replace(/\bharmadik\b/gi, '3');
    s = s.replace(/\bnegyedik\b/gi, '4');
    s = s.replace(/\bötödik\b/gi, '5');
    s = s.replace(/\botodik\b/gi, '5');
    s = s.replace(/\bhatodik\b/gi, '6');
    s = s.replace(/\bhetedik\b/gi, '7');
    s = s.replace(/\bnyolcadik\b/gi, '8');
    s = s.replace(/\bkilencedik\b/gi, '9');
    s = s.replace(/\btizedik\b/gi, '10');
    return s;
  }

  function cityName(c) {
    if (!c) return '–';
    return c.settlement_name || c.nev || '–';
  }

  /**
   * Érvényes magyarországi WGS84 pár (nem (0,0), nem placeholder a CITYDATA-ban).
   * Páronként próbáljuk: CITYDATA → lat/lng → GROCERIES (kerületeknél ez a megbízható).
   */
  function isUsableHuLatLng(lat, lng) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    if (lat === 0 && lng === 0) return false;
    if (lat < 45.6 || lat > 49.6 || lng < 16.0 || lng > 23.0) return false;
    return true;
  }

  function cityLatLngPair(c) {
    if (!c) return { lat: NaN, lng: NaN };
    const pairs = [
      [c.CITYDATA_Latitude, c.CITYDATA_Longitude],
      [c.citydata_latitude, c.citydata_longitude],
      [c.lat, c.lng],
      [c.GROCERIES_INDEX_lat, c.GROCERIES_INDEX_lon],
      [c.groceries_index_lat, c.groceries_index_lon],
    ];
    for (let i = 0; i < pairs.length; i++) {
      const lat = Number(pairs[i][0]);
      const lng = Number(pairs[i][1]);
      if (isUsableHuLatLng(lat, lng)) return { lat: lat, lng: lng };
    }
    return { lat: NaN, lng: NaN };
  }

  function cityLat(c) {
    return cityLatLngPair(c).lat;
  }

  function cityLng(c) {
    return cityLatLngPair(c).lng;
  }

  function countyOfCity(c) {
    if (!c || typeof c !== 'object') return '';
    return String(c.CITYDATA_County ?? c.citydata_county ?? '').trim();
  }

  /** Római számjegy sor (I–XXIII), pl. kerületjelölés. */
  function romanToInt(str) {
    const u = String(str || '')
      .toUpperCase()
      .replace(/\./g, '')
      .trim();
    if (!u || !/^[IVXLCDM]+$/.test(u)) return NaN;
    const sym = { I: 1, V: 5, X: 10, L: 50, C: 100 };
    let n = 0;
    for (let i = 0; i < u.length; i++) {
      const v = sym[u[i]];
      const w = sym[u[i + 1]];
      if (w != null && v < w) n -= v;
      else n += v;
    }
    return n;
  }

  function districtNumberFromSettlementName(name) {
    const m = String(name || '').match(/([IVXLCDM]+)\s*\.\s*kerület/i);
    if (!m) return NaN;
    const k = romanToInt(m[1]);
    return Number.isFinite(k) ? k : NaN;
  }

  function isBudapestDistrictRow(c) {
    const name = String(cityName(c) || '');
    if (!/kerület/i.test(name)) return false;
    if (/budapest/i.test(name)) return true;
    if (/^\s*([IVXLCDM]+)\s*\.\s*kerület/i.test(name)) return true;
    if (/budapest/i.test(countyOfCity(c))) return true;
    return false;
  }

  function listBudapestDistrictRows() {
    if (budapestDistrictRowsCache) return budapestDistrictRowsCache;
    const out = [];
    for (let i = 0; i < citiesData.length; i++) {
      if (isBudapestDistrictRow(citiesData[i])) out.push(citiesData[i]);
    }
    out.sort(function (a, b) {
      const na = districtNumberFromSettlementName(cityName(a));
      const nb = districtNumberFromSettlementName(cityName(b));
      if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
      return String(cityName(a)).localeCompare(String(cityName(b)), 'hu');
    });
    budapestDistrictRowsCache = out;
    return out;
  }

  /** További normalizált kulcsok (pl. „Budapest II…” vs „II…”, arab szám). */
  function extraAliasKeysForCity(c) {
    const out = [];
    const name = String(cityName(c) || '');
    const m = name.match(/([IVXLCDM]+)\s*\.\s*kerület/i);
    if (m) {
      const ri = romanToInt(m[1]);
      if (ri >= 1 && ri <= 23) {
        const rom = m[1].toUpperCase();
        out.push(normalizeSettlementName('Budapest ' + rom + '. kerület'));
        out.push(normalizeSettlementName('Budapest, ' + rom + '. kerület'));
        out.push(normalizeSettlementName(ri + '. kerület'));
        out.push(normalizeSettlementName(ri + ' kerület'));
      }
    }
    const stripped = name.replace(/^\s*Budapest\s*,?\s*/i, '').trim();
    if (stripped && stripped !== name) {
      out.push(normalizeSettlementName(stripped));
    }
    return out;
  }

  function registerCityLookupKeys(c) {
    const nm = cityName(c);
    if (!nm || nm === '–') return;
    const primaryStrict = normalizeSettlementNameStrict(String(nm));
    const primaryAscii = normalizeSettlementName(String(nm));
    if (primaryStrict) cityByNormName.set(primaryStrict, c);
    if (primaryAscii) registerAsciiHomonym(primaryAscii, c);
    const extras = extraAliasKeysForCity(c);
    for (let i = 0; i < extras.length; i++) {
      const k = extras[i];
      if (!k) continue;
      const kStrict = normalizeSettlementNameStrict(k);
      const kAscii = normalizeSettlementName(k);
      if (kStrict && kStrict !== primaryStrict && !cityByNormName.has(kStrict)) {
        cityByNormName.set(kStrict, c);
      }
      if (kAscii) registerAsciiHomonym(kAscii, c);
    }
  }

  /**
   * OSM / határadat név → all_parameters sor (Budapest kerületeknél gyakran eltér a szöveg).
   * @param {number} [lng] térképes kattintás / poligon középpont (homonimák feloldásához)
   * @param {number} [lat]
   */
  function lookupCityRowFromGeoPickLabel(rawLabel, lng, lat) {
    if (!rawLabel || !citiesData.length) return null;
    const raw = String(rawLabel).trim();
    if (!raw) return null;
    const processed = preprocessSettlementQuery(raw);
    const triedStrict = [];
    const triedAscii = [];

    function pushStrict(s) {
      const n = normalizeSettlementNameStrict(String(s || '').trim());
      if (n && triedStrict.indexOf(n) === -1) triedStrict.push(n);
    }
    function pushAscii(s) {
      const n = normalizeSettlementName(String(s || '').trim());
      if (n && triedAscii.indexOf(n) === -1) triedAscii.push(n);
    }

    pushStrict(processed);
    pushStrict(raw);
    pushAscii(processed);
    pushAscii(raw);
    const noComma = raw.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
    if (noComma !== raw) {
      pushStrict(noComma);
      pushAscii(noComma);
    }

    const noBp = processed.replace(/^\s*budapest\s*,?\s*/i, '').trim();
    if (noBp && noBp !== processed) {
      pushStrict(noBp);
      pushStrict('Budapest ' + noBp);
      pushStrict('Budapest, ' + noBp);
      pushAscii(noBp);
      pushAscii('Budapest ' + noBp);
      pushAscii('Budapest, ' + noBp);
    }

    const arabK = processed.match(/\b(\d{1,2})\s*\.\s*kerület\b/i);
    if (arabK) {
      const num = parseInt(arabK[1], 10);
      if (num >= 1 && num <= 23) {
        const rom = BUDAPEST_ROMAN_DISTRICT_NUMERALS[num - 1];
        pushStrict(num + '. kerület');
        pushStrict(rom + '. kerület');
        pushStrict('Budapest ' + rom + '. kerület');
        pushStrict('Budapest, ' + rom + '. kerület');
        pushAscii(num + '. kerület');
        pushAscii(rom + '. kerület');
        pushAscii('Budapest ' + rom + '. kerület');
        pushAscii('Budapest, ' + rom + '. kerület');
      }
    }

    for (let i = 0; i < triedStrict.length; i++) {
      const hit = cityByNormName.get(triedStrict[i]);
      if (hit) return hit;
    }
    for (let i = 0; i < triedAscii.length; i++) {
      const hom = cityHomonymsByAscii.get(triedAscii[i]);
      if (!hom || hom.length === 0) continue;
      const resolved = resolveCityHomonym(hom, raw, lng, lat);
      if (resolved) return resolved;
    }

    const pn = normalizeSettlementName(processed);
    const dn = districtNumberFromSettlementName(processed);
    if (Number.isFinite(dn) && dn >= 1 && dn <= 23) {
      const districts = listBudapestDistrictRows();
      for (let i = 0; i < districts.length; i++) {
        const c = districts[i];
        const dCity = districtNumberFromSettlementName(cityName(c));
        if (dCity === dn) return c;
      }
    }

    if (pn.indexOf('kerulet') !== -1) {
      const districts = listBudapestDistrictRows();
      let best = null;
      let bestLen = 0;
      for (let i = 0; i < districts.length; i++) {
        const c = districts[i];
        const cn = normalizeSettlementName(cityName(c));
        if (!cn) continue;
        if (pn === cn) return c;
        if (pn.indexOf(cn) !== -1 || cn.indexOf(pn) !== -1) {
          const score = Math.min(pn.length, cn.length);
          if (score > bestLen) {
            bestLen = score;
            best = c;
          }
        }
      }
      if (best && bestLen >= 6) return best;
    }
    return null;
  }

  function isInsideRoughBudapestUrban(lng, lat) {
    return lat >= 47.35 && lat <= 47.65 && lng >= 18.95 && lng <= 19.35;
  }

  function nearestBudapestDistrictByLatLng(lng, lat, maxKm) {
    const districts = listBudapestDistrictRows();
    if (!districts.length) return null;
    const cap = maxKm == null ? 12 : maxKm;
    let best = null;
    let bestKm = Infinity;
    for (let i = 0; i < districts.length; i++) {
      const c = districts[i];
      const clat = cityLat(c);
      const clng = cityLng(c);
      if (!Number.isFinite(clat) || !Number.isFinite(clng)) continue;
      const d = haversineKm(lat, lng, clat, clng);
      if (d < bestKm) {
        bestKm = d;
        best = c;
      }
    }
    if (best && bestKm <= cap) return best;
    return null;
  }

  function resolveCityFromMapPick(settlementName, lng, lat) {
    const byName = lookupCityRowFromGeoPickLabel(settlementName, lng, lat);
    if (byName) return byName;
    if (
      Number.isFinite(lng) &&
      Number.isFinite(lat) &&
      isInsideRoughBudapestUrban(lng, lat)
    ) {
      return nearestBudapestDistrictByLatLng(lng, lat, 15);
    }
    return null;
  }

  function cityMatchesDistrictRestToken(c, restNorm) {
    if (!restNorm.length) return true;
    const dn = districtNumberFromSettlementName(cityName(c));
    if (!Number.isFinite(dn)) return false;
    if (/^\d+$/.test(restNorm)) {
      return dn === parseInt(restNorm, 10);
    }
    const rOnly = restNorm.replace(/\./g, '');
    const ri = romanToInt(rOnly);
    if (Number.isFinite(ri) && ri >= 1 && ri <= 23) {
      return ri === dn;
    }
    const n = normalizeSettlementName(String(cityName(c) || ''));
    return n.indexOf(restNorm) !== -1;
  }

  /** Két WGS84 pont közötti távolság km-ben (földgömb). */
  function haversineKm(lat1, lng1, lat2, lng2) {
    if (
      !Number.isFinite(lat1) ||
      !Number.isFinite(lng1) ||
      !Number.isFinite(lat2) ||
      !Number.isFinite(lng2)
    ) {
      return NaN;
    }
    const R = 6371;
    const toR = Math.PI / 180;
    const dLat = (lat2 - lat1) * toR;
    const dLng = (lng2 - lng1) * toR;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
    return R * c;
  }

  function destinationLngLat(lng0, lat0, distanceKm, bearingRad) {
    const R = 6371;
    const δ = distanceKm / R;
    const φ1 = (lat0 * Math.PI) / 180;
    const λ1 = (lng0 * Math.PI) / 180;
    const φ2 = Math.asin(
      Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(bearingRad)
    );
    const λ2 =
      λ1 +
      Math.atan2(
        Math.sin(bearingRad) * Math.sin(δ) * Math.cos(φ1),
        Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2)
      );
    let lng = (λ2 * 180) / Math.PI;
    lng = ((lng + 540) % 360) - 180;
    const lat = (φ2 * 180) / Math.PI;
    return [lng, lat];
  }

  function geoCirclePolygonGeojson(lng, lat, radiusKm, steps) {
    const n = Math.max(12, Math.min(128, steps || 64));
    const ring = [];
    for (let i = 0; i <= n; i++) {
      const br = (i / n) * 2 * Math.PI;
      ring.push(destinationLngLat(lng, lat, radiusKm, br));
    }
    return {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [ring] },
      properties: {},
    };
  }

  function ensureImportantPlaceLayers() {
    if (!map || !map.isStyleLoaded()) return;
    ['a', 'b'].forEach(function (slot) {
      const sid = 'important-place-' + slot;
      if (map.getSource(sid)) return;
      map.addSource(sid, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: sid + '-fill',
        type: 'fill',
        source: sid,
        paint: {
          'fill-color': '#0a0a0a',
          'fill-opacity': 0.065,
        },
      });
      map.addLayer({
        id: sid + '-line',
        type: 'line',
        source: sid,
        paint: {
          'line-color': '#0a0a0a',
          'line-opacity': 0.22,
          'line-width': 1,
        },
      });
    });
  }

  function geoSlotDisplayName(slot) {
    const st = geoSlotState[slot];
    if (!st || !st.city) return 'Fontos hely';
    const nm = cityName(st.city);
    return nm && nm !== '–' ? nm : 'Fontos hely';
  }

  /** Pin + felirat: csak ha a slot kapcsolója BE van és van beállított hely. */
  function syncGeoMarkersFromState() {
    if (!map) return;
    ['a', 'b'].forEach(function (slot) {
      if (geoSlotReady(slot)) {
        const st = geoSlotState[slot];
        if (!geoMarkerBySlot[slot]) {
          setGeoSlotMarker(slot, st.lng, st.lat, geoSlotDisplayName(slot));
        }
      } else {
        removeGeoSlotMarker(slot);
      }
    });
  }

  /**
   * Fontos helyek a térképen: kör + jelölő.
   * Csak akkor látszanak, ha a slot iOS kapcsolója BE van, van település és sugár > 0.
   * Kikapcsoláskor a beállítás megmarad a panelben, de a térképről eltűnik.
   */
  function updateImportantPlaceCircles() {
    if (!map) return;
    ensureImportantPlaceLayers();
    if (!map.getSource('important-place-a')) return;
    ['a', 'b'].forEach(function (slot) {
      const sid = 'important-place-' + slot;
      const fillId = sid + '-fill';
      const lineId = sid + '-line';
      const src = map.getSource(sid);
      if (!src || typeof src.setData !== 'function') return;
      const st = geoSlotState[slot];
      const rInput = slot === 'a' ? elements.geoRadiusA : elements.geoRadiusB;
      const rKm = parseFloat(rInput && rInput.value);
      const rk = Number.isFinite(rKm) ? Math.max(0, rKm) : 0;
      const show = geoSlotReady(slot) && rk > 0;
      if (show) {
        src.setData({
          type: 'FeatureCollection',
          features: [geoCirclePolygonGeojson(st.lng, st.lat, rk, 72)],
        });
      } else {
        src.setData({ type: 'FeatureCollection', features: [] });
      }
      const vis = show ? 'visible' : 'none';
      if (map.getLayer(fillId)) map.setLayoutProperty(fillId, 'visibility', vis);
      if (map.getLayer(lineId)) map.setLayoutProperty(lineId, 'visibility', vis);
    });
    syncGeoMarkersFromState();
  }

  function geoSwitchIsOn(el) {
    if (!el) return false;
    return el.getAttribute('aria-checked') === 'true';
  }

  function geoSlotReady(slot) {
    const st = geoSlotState[slot];
    const sw = slot === 'a' ? elements.geoActiveA : elements.geoActiveB;
    if (!geoSwitchIsOn(sw)) return false;
    return !!(st && st.city && Number.isFinite(st.lat) && Number.isFinite(st.lng));
  }

  /** Metszet-szűrő: minden bekapcsolt és kitöltött körön belül kell legyen a település. */
  function passesGeoFilter(city) {
    const ra = geoSlotReady('a');
    const rb = geoSlotReady('b');
    if (!ra && !rb) return true;
    const clat = cityLat(city);
    const clng = cityLng(city);
    if (!Number.isFinite(clat) || !Number.isFinite(clng)) return false;
    if (ra) {
      const rKm = parseFloat(elements.geoRadiusA && elements.geoRadiusA.value);
      const rk = Number.isFinite(rKm) ? Math.max(0, rKm) : 0;
      const d = haversineKm(clat, clng, geoSlotState.a.lat, geoSlotState.a.lng);
      if (!Number.isFinite(d) || d > rk) return false;
    }
    if (rb) {
      const rKm = parseFloat(elements.geoRadiusB && elements.geoRadiusB.value);
      const rk = Number.isFinite(rKm) ? Math.max(0, rKm) : 0;
      const d = haversineKm(clat, clng, geoSlotState.b.lat, geoSlotState.b.lng);
      if (!Number.isFinite(d) || d > rk) return false;
    }
    return true;
  }

  /**
   * Ugyanaz, mint a passesGeoFilter, de tetszőleges pontra (a heatmap a
   * poligon-centroidokkal hívja, hogy ne a Supabase city.lat/lng-jétől
   * függjön a megjelenítés).
   */
  function passesGeoFilterByPoint(lat, lng) {
    const ra = geoSlotReady('a');
    const rb = geoSlotReady('b');
    if (!ra && !rb) return true;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    if (ra) {
      const rKm = parseFloat(elements.geoRadiusA && elements.geoRadiusA.value);
      const rk = Number.isFinite(rKm) ? Math.max(0, rKm) : 0;
      const d = haversineKm(lat, lng, geoSlotState.a.lat, geoSlotState.a.lng);
      if (!Number.isFinite(d) || d > rk) return false;
    }
    if (rb) {
      const rKm = parseFloat(elements.geoRadiusB && elements.geoRadiusB.value);
      const rk = Number.isFinite(rKm) ? Math.max(0, rKm) : 0;
      const d = haversineKm(lat, lng, geoSlotState.b.lat, geoSlotState.b.lng);
      if (!Number.isFinite(d) || d > rk) return false;
    }
    return true;
  }

  /** Mindkét kör aktív és kitöltött: korongok legyenek összefüggőek (metszet nem üres). */
  function geoDisjointDisksMessage() {
    if (!geoSlotReady('a') || !geoSlotReady('b')) return null;
    const r1 = parseFloat(elements.geoRadiusA && elements.geoRadiusA.value);
    const r2 = parseFloat(elements.geoRadiusB && elements.geoRadiusB.value);
    const R1 = Number.isFinite(r1) ? Math.max(0, r1) : 0;
    const R2 = Number.isFinite(r2) ? Math.max(0, r2) : 0;
    const d = haversineKm(geoSlotState.a.lat, geoSlotState.a.lng, geoSlotState.b.lat, geoSlotState.b.lng);
    if (!Number.isFinite(d)) return null;
    if (d > R1 + R2 + 0.25) {
      return 'A két körnek metszenie kell egymást — növeld a sugarakat, vagy válassz közelebbi központokat.';
    }
    return null;
  }

  function refreshGeoFilterWarning() {
    const line = elements.geoWarnLine;
    if (!line) return;
    const disjoint = geoDisjointDisksMessage();
    if (disjoint) {
      line.hidden = false;
      line.classList.add('ref-line--warn');
      line.textContent = disjoint;
      return;
    }
    line.hidden = true;
    line.textContent = '';
    line.classList.remove('ref-line--warn');
  }

  function syncGeoRadiusLabels() {
    if (elements.geoRadiusA) {
      const v = Math.round(parseFloat(elements.geoRadiusA.value) || 0);
      elements.geoRadiusA.setAttribute('aria-valuetext', v + ' km');
      if (elements.geoRadiusAVal) elements.geoRadiusAVal.textContent = String(v);
    }
    if (elements.geoRadiusB) {
      const v = Math.round(parseFloat(elements.geoRadiusB.value) || 0);
      elements.geoRadiusB.setAttribute('aria-valuetext', v + ' km');
      if (elements.geoRadiusBVal) elements.geoRadiusBVal.textContent = String(v);
    }
    updateImportantPlaceCircles();
  }

  function rebuildGuidedParamKeysFromDom() {
    guidedParamKeys = [];
    const host = elements.paramCategoriesHost;
    if (!host) return;
    host.querySelectorAll('input[type="range"][data-param-key]').forEach(function (el) {
      const k = el.getAttribute('data-param-key');
      if (k) guidedParamKeys.push(k);
    });
  }

  function expandParamGroupEl(group) {
    if (!group) return;
    group.classList.remove('param-group--collapsed');
    const tb = group.querySelector('.param-group__toggle');
    if (tb) tb.setAttribute('aria-expanded', 'true');
  }

  function collapseParamGroupEl(group) {
    if (!group) return;
    group.classList.add('param-group--collapsed');
    const tb = group.querySelector('.param-group__toggle');
    if (tb) tb.setAttribute('aria-expanded', 'false');
  }

  function expandParamItemEl(card) {
    if (!card) return;
    card.classList.remove('param-item--collapsed');
    const tb = card.querySelector('.param-item__toggle');
    if (tb) tb.setAttribute('aria-expanded', 'true');
  }

  function collapseParamItemEl(card) {
    if (!card) return;
    card.classList.add('param-item--collapsed');
    const tb = card.querySelector('.param-item__toggle');
    if (tb) tb.setAttribute('aria-expanded', 'false');
  }

  function setParamCardSwitchOn(card, on) {
    if (!card) return;
    const sw = card.querySelector('.param-item__ios-switch');
    if (!sw) return;
    const nowOn = !!on;
    sw.setAttribute('aria-checked', nowOn ? 'true' : 'false');
    card.setAttribute('data-param-active', nowOn ? '1' : '0');
    card.classList.toggle('param-item--inactive', !nowOn);
  }

  function setGeoPlaceCardActive(slot, on) {
    const sw = slot === 'a' ? elements.geoActiveA : elements.geoActiveB;
    if (!sw) return;
    const wrap = sw.closest('.param-item');
    const nowOn = !!on;
    sw.setAttribute('aria-checked', nowOn ? 'true' : 'false');
    if (wrap) {
      wrap.setAttribute('data-param-active', nowOn ? '1' : '0');
      wrap.classList.toggle('param-item--inactive', !nowOn);
    }
    refreshGeoFilterWarning();
    scheduleSearchFromSliders();
    updateImportantPlaceCircles();
  }

  /** i <= aktívIndex: be + kinyit; egyébként ki + összecsuk (vezetett út szerint). */
  function syncGuidedParamCardsToStep(activeIndex) {
    const host = elements.paramCategoriesHost;
    if (!host) return;
    for (let i = 0; i < guidedParamKeys.length; i++) {
      const key = guidedParamKeys[i];
      const el = host.querySelector('[data-param-key="' + key + '"]');
      if (!el) continue;
      const card = el.closest('.param-item');
      if (!card) continue;
      if (i <= activeIndex) {
        setParamCardSwitchOn(card, true);
        expandParamItemEl(card);
      } else {
        setParamCardSwitchOn(card, false);
        collapseParamItemEl(card);
      }
    }

    const groups = host.querySelectorAll('.param-group');
    for (let g = 0; g < groups.length; g++) {
      const group = groups[g];
      let open = false;
      const ranges = group.querySelectorAll('input[type="range"][data-param-key]');
      for (let r = 0; r < ranges.length; r++) {
        const k = ranges[r].getAttribute('data-param-key');
        const idx = guidedParamKeys.indexOf(k);
        if (idx !== -1 && idx <= activeIndex) {
          open = true;
          break;
        }
      }
      if (open) expandParamGroupEl(group);
      else collapseParamGroupEl(group);
    }
  }

  function expandImportantPlaceCard(slot) {
    const sw = slot === 'a' ? elements.geoActiveA : elements.geoActiveB;
    if (!sw) return;
    const card = sw.closest('.param-item');
    expandParamItemEl(card);
  }

  function revealGuidedParamStep(index) {
    if (!elements.paramCategoriesHost || index < 0 || index >= guidedParamKeys.length) return;
    syncGuidedParamCardsToStep(index);
    const key = guidedParamKeys[index];
    const el = elements.paramCategoriesHost.querySelector('[data-param-key="' + key + '"]');
    const card = el && el.closest('.param-item');
    window.requestAnimationFrame(function () {
      if (card && typeof card.scrollIntoView === 'function') {
        card.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      }
    });
  }

  function maybeAdvanceGuidedFlowAfterGeo(slot) {
    if (slot === 'a') {
      expandImportantPlaceCard('b');
      setGeoPlaceCardActive('b', true);
      return;
    }
    if (slot === 'b') {
      guidedFlowUnlocked = true;
      guidedFlowParamIndex = 0;
      rebuildGuidedParamKeysFromDom();
      clearGuidedScrollTimer();
      revealGuidedParamStep(0);
    }
  }

  function syncGuidedFlowFromPersistedGeo() {
    rebuildGuidedParamKeysFromDom();
    clearGuidedScrollTimer();
    const aOk =
      geoSlotState.a &&
      geoSlotState.a.city &&
      Number.isFinite(geoSlotState.a.lat) &&
      Number.isFinite(geoSlotState.a.lng);
    const bOk =
      geoSlotState.b &&
      geoSlotState.b.city &&
      Number.isFinite(geoSlotState.b.lat) &&
      Number.isFinite(geoSlotState.b.lng);
    if (bOk) {
      guidedFlowUnlocked = true;
      guidedFlowParamIndex = 0;
      revealGuidedParamStep(0);
    } else {
      guidedFlowUnlocked = false;
      guidedFlowParamIndex = 0;
      if (aOk) {
        expandImportantPlaceCard('b');
        setGeoPlaceCardActive('b', true);
      }
    }
  }

  /** Csak a fő csúszka elengedésekor (change); következő lépés ~0,5 s múlva. */
  function onGuidedParamRangeChange(e) {
    if (guidedFlowIgnoreInputs || !guidedFlowUnlocked) return;
    const t = e.target;
    if (!t || t.nodeName !== 'INPUT' || t.type !== 'range') return;
    if (t.getAttribute('data-param-weight-for')) return;
    const key = t.getAttribute('data-param-key');
    if (!key) return;
    if (key !== guidedParamKeys[guidedFlowParamIndex]) return;
    guidedFlowParamIndex++;
    clearGuidedScrollTimer();
    if (guidedFlowParamIndex < guidedParamKeys.length) {
      const nextIndex = guidedFlowParamIndex;
      guidedScrollTimer = setTimeout(function () {
        guidedScrollTimer = null;
        if (guidedFlowParamIndex !== nextIndex) return;
        revealGuidedParamStep(nextIndex);
      }, 500);
    }
  }

  function countGeoEligibleCities() {
    let n = 0;
    for (let i = 0; i < citiesData.length; i++) {
      if (passesGeoFilter(citiesData[i])) n++;
    }
    return n;
  }

  function applyGeoSlotFromCity(slot, city, clickLngLat) {
    const st = geoSlotState[slot];
    if (!st) return;
    const inp = slot === 'a' ? elements.geoCityInputA : elements.geoCityInputB;
    const displayName = cityName(city);
    const lng = clickLngLat && Number.isFinite(clickLngLat.lng) ? clickLngLat.lng : cityLng(city);
    const lat = clickLngLat && Number.isFinite(clickLngLat.lat) ? clickLngLat.lat : cityLat(city);
    if (inp) inp.value = displayName;
    st.city = city;
    st.lat = lat;
    st.lng = lng;
    if (Number.isFinite(lng) && Number.isFinite(lat)) {
      setGeoSlotMarker(slot, lng, lat, displayName);
    } else {
      removeGeoSlotMarker(slot);
    }
    refreshGeoFilterWarning();
    scheduleSearchFromSliders();
    updateImportantPlaceCircles();
    if (st.city && Number.isFinite(st.lat) && Number.isFinite(st.lng)) {
      maybeAdvanceGuidedFlowAfterGeo(slot);
    }
  }

  function applyTypedGeoSlot(slot) {
    const inp = slot === 'a' ? elements.geoCityInputA : elements.geoCityInputB;
    const line = elements.geoWarnLine;
    if (!inp) return;
    if (!citiesData.length) {
      if (line) {
        line.hidden = false;
        line.classList.add('ref-line--warn');
        line.textContent = 'Előbb töltsd be az all_parameters táblát.';
      }
      return;
    }
    const result = findCityByTypedQuery(inp.value);
    if (!result.ok) {
      if (line) {
        line.hidden = false;
        line.classList.add('ref-line--warn');
        line.textContent = (slot === 'a' ? '1. kör: ' : '2. kör: ') + result.message;
      }
      return;
    }
    const lng0 = cityLng(result.city);
    const lat0 = cityLat(result.city);
    if (!Number.isFinite(lng0) || !Number.isFinite(lat0)) {
      if (line) {
        line.hidden = false;
        line.classList.add('ref-line--warn');
        line.textContent =
          (slot === 'a' ? '1. kör: ' : '2. kör: ') +
          'Ehhez a sorhoz nincs koordináta az adatban; használd a térképes gombot.';
      }
      geoSlotState[slot] = { city: null, lat: NaN, lng: NaN };
      removeGeoSlotMarker(slot);
      refreshGeoFilterWarning();
      scheduleSearchFromSliders();
      updateImportantPlaceCircles();
      return;
    }
    if (line) {
      line.hidden = true;
      line.textContent = '';
      line.classList.remove('ref-line--warn');
    }
    applyGeoSlotFromCity(slot, result.city, null);
  }

  function parseNumeric(val) {
    if (val == null || val === '') return null;
    const n = Number(val);
    return Number.isFinite(n) ? n : null;
  }

  /**
   * Mező: a név kisbetűsítve „_index”-re végződik (PostgreSQL: …_forest_index).
   * Kihagyjuk a created_at / id-szerűeket.
   */
  function isIndexParameterColumn(key) {
    if (typeof key !== 'string') return false;
    const lower = key.toLowerCase();
    if (lower === 'id' || lower === 'created_at') return false;
    return /_index$/i.test(key);
  }

  /** Nem külön mutatóként kezelt _index oszlopok (a fő sport-index melletti részindexek, stb.). */
  function isExcludedStandaloneIndexKey(key) {
    if (typeof key !== 'string') return false;
    const u = key.toUpperCase();
    if (u.indexOf('SPORTEG') !== -1) return true;
    if (/_SPORTAG_INDEX$/i.test(key)) return true;
    if (/_LETES_INDEX$/i.test(key)) return true;
    if (/_LETESITMENY_INDEX$/i.test(key)) return true;
    return false;
  }

  function discoverIndexKeys(sampleRow) {
    if (!sampleRow) return [];
    const out = [];
    for (const k of Object.keys(sampleRow)) {
      if (!isIndexParameterColumn(k)) continue;
      if (isExcludedStandaloneIndexKey(k)) continue;
      out.push(k);
    }
    out.sort(function (a, b) {
      return a.localeCompare(b);
    });
    return out;
  }

  function columnMinMax(key, rows) {
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < rows.length; i++) {
      const v = parseNumeric(rows[i][key]);
      if (v == null) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return { min: 0, max: 100 };
    }
    if (min === max) {
      max = min + 1;
    }
    return { min: min, max: max };
  }

  function computeStep(min, max) {
    const span = max - min;
    if (span <= 0) return 1;
    if (span <= 1) return 0.01;
    if (span <= 20) return 0.1;
    if (span <= 200) return 1;
    return Math.max(1, Math.round(span / 100));
  }

  function snapToStep(value, min, max, step) {
    let x = Math.min(max, Math.max(min, value));
    if (step >= 1) return Math.round(x);
    const inv = Math.round(x / step);
    return Math.min(max, Math.max(min, inv * step));
  }

  function shortLabelForKey(key) {
    const parts = key.split('_');
    return parts.slice(-2).join(' · ') || key;
  }

  function uiParamIdToKeyPrefixUpper(uiParamId) {
    return uiParamId
      .split('_')
      .map(function (seg) {
        return seg.toUpperCase();
      })
      .join('_') + '_';
  }

  function keyMatchesParamUiId(dbKey, uiParamId) {
    if (!uiParamId || uiParamId === 'telepules_nev_egysegesites') return false;
    const k = dbKey.toUpperCase();

    if (uiParamId === 'real_estate_price_grow_5yrs_index') {
      return k.startsWith('INGATLANPIAC_') && k.indexOf('PRICE_GROW_5YRS_INDEX') !== -1;
    }
    if (uiParamId === 'real_estate_price_avg5mth_index') {
      return (
        k.startsWith('INGATLANPIAC_') &&
        (k.endsWith('_HOUSE_AVG_INDEX') || k.endsWith('_FLAT_AVG_INDEX') || k.endsWith('_SITE_AVG_INDEX'))
      );
    }
    if (uiParamId === 'sport_index') {
      return (
        k.startsWith('SPORT_INDEX_') &&
        k.endsWith('_SPORT_INDEX') &&
        k.indexOf('NEM_NORMALIZALT') === -1
      );
    }

    const pref = uiParamIdToKeyPrefixUpper(uiParamId);
    return k.startsWith(pref);
  }

  function getUiParamEntryForDbKey(dbKey) {
    for (let i = 0; i < PARAMETER_UI_ENTRIES.length; i++) {
      const e = PARAMETER_UI_ENTRIES[i];
      if (e.type !== 'param') continue;
      if (keyMatchesParamUiId(dbKey, e.id)) return e;
    }
    return null;
  }

  function ingatlanGrowSuffix(dbKey) {
    const k = dbKey.toUpperCase();
    if (k.indexOf('HOUSE_PRICE_GROW') !== -1 || k.indexOf('_HAZ_') !== -1) return ' · ház';
    if (k.indexOf('FLAT_PRICE_GROW') !== -1 || k.indexOf('_LAKAS_') !== -1) return ' · lakás';
    if (k.indexOf('SITE_PRICE_GROW') !== -1 || k.indexOf('_TELEK_') !== -1) return ' · telek';
    return '';
  }

  function ingatlanAvgSuffix(dbKey) {
    const k = dbKey.toUpperCase();
    if (k.indexOf('HOUSE_AVG') !== -1) return ' · ház';
    if (k.indexOf('FLAT_AVG') !== -1) return ' · lakás';
    if (k.indexOf('SITE_AVG') !== -1) return ' · telek';
    return '';
  }

  function paramLabelForDbKey(dbKey) {
    const ent = getUiParamEntryForDbKey(dbKey);
    if (!ent || !ent.megnevezes) return shortLabelForKey(dbKey);
    return ent.megnevezes;
  }

  function columnDisplayLabel(dbKey) {
    const k = String(dbKey);
    const kl = k.toLowerCase();
    if (kl === 'settlement_name') return 'Település neve';
    if (kl === 'id') return 'ID';
    if (kl === 'created_at') return 'Létrehozva';

    const ent = getUiParamEntryForDbKey(k);
    if (!ent || !ent.megnevezes) return k;

    if (
      ent.id === 'real_estate_price_grow_5yrs_index' ||
      ent.id === 'real_estate_price_avg5mth_index'
    ) {
      return paramLabelForDbKey(k);
    }

    const pref = uiParamIdToKeyPrefixUpper(ent.id);
    const ku = k.toUpperCase();
    if (pref && ku.startsWith(pref)) {
      const rest = k.slice(pref.length);
      const r0 = rest.replace(/_/g, '').toLowerCase();
      const id0 = ent.id.replace(/_/g, '').toLowerCase();
      if (!rest || r0 === id0) return ent.megnevezes;
      return ent.megnevezes + ' · ' + rest.replace(/_/g, ' ');
    }
    return ent.megnevezes + ' · ' + shortLabelForKey(k);
  }

  /**
   * Csúszkák: szakasz-címek + rögzített sorrend. Csak a PARAMETER_UI_ENTRIES-ben szereplő mutatók.
   * @param {string[]} keys
   * @returns {Array<{ type: 'section', title: string } | { type: 'slider', key: string }>}
   */
  function buildSliderPlan(keys) {
    const keySet = new Set(keys);
    /** @type {Array<{ type: 'section', title: string } | { type: 'slider', key: string }>} */
    const items = [];
    const used = new Set();
    let pendingSection = null;

    for (let ei = 0; ei < PARAMETER_UI_ENTRIES.length; ei++) {
      const e = PARAMETER_UI_ENTRIES[ei];
      if (e.type === 'section') {
        pendingSection = e.title;
        continue;
      }
      if (e.id === 'primary_school_proximity_index' || e.id === 'high_school_proximity_index') {
        const schoolMatches = schoolKeysMatchingUiParam(e.id, keys);
        schoolMatches.sort(function (a, b) {
          return a.localeCompare(b);
        });
        if (schoolMatches.length === 0) continue;
        if (pendingSection) {
          items.push({ type: 'section', title: pendingSection });
          pendingSection = null;
        }
        for (let sm = 0; sm < schoolMatches.length; sm++) {
          used.add(schoolMatches[sm]);
        }
        items.push({ type: 'variant_segment', uiParamId: e.id, keys: schoolMatches.slice() });
        continue;
      }

      const matches = keys.filter(function (kk) {
        return keySet.has(kk) && keyMatchesParamUiId(kk, e.id);
      });
      matches.sort(function (a, b) {
        return a.localeCompare(b);
      });
      if (matches.length === 0) continue;
      if (pendingSection) {
        items.push({ type: 'section', title: pendingSection });
        pendingSection = null;
      }
      if (
        e.id === 'real_estate_price_grow_5yrs_index' ||
        e.id === 'real_estate_price_avg5mth_index'
      ) {
        for (let m = 0; m < matches.length; m++) {
          used.add(matches[m]);
        }
        items.push({ type: 'variant_segment', uiParamId: e.id, keys: matches.slice(), preset: 'ingatlan' });
        continue;
      }
      for (let m = 0; m < matches.length; m++) {
        const kk = matches[m];
        if (used.has(kk)) continue;
        used.add(kk);
        items.push({ type: 'slider', key: kk });
      }
    }

    return items;
  }

  function orderIndexKeysForUi(keys) {
    const plan = buildSliderPlan(keys);
    const out = [];
    for (let i = 0; i < plan.length; i++) {
      const item = plan[i];
      if (item.type === 'slider') out.push(item.key);
      else if (item.type === 'variant_segment' && item.keys && item.keys.length) {
        for (let ki = 0; ki < item.keys.length; ki++) {
          out.push(item.keys[ki]);
        }
      }
    }
    return out;
  }

  function getUiParamEntryById(uiParamId) {
    for (let i = 0; i < PARAMETER_UI_ENTRIES.length; i++) {
      const e = PARAMETER_UI_ENTRIES[i];
      if (e.type === 'param' && e.id === uiParamId) return e;
    }
    return null;
  }

  /** Nyertes sor oszlopai: ugyanaz a param-sorrend, majd egyéb oszlopok ABC. */
  function orderAllWinningCityKeys(allKeys) {
    const used = new Set();
    const ordered = [];
    const keySet = new Set(allKeys);

    for (let ei = 0; ei < PARAMETER_UI_ENTRIES.length; ei++) {
      const e = PARAMETER_UI_ENTRIES[ei];
      if (e.type !== 'param') continue;
      const matches = allKeys.filter(function (kk) {
        return keySet.has(kk) && keyMatchesParamUiId(kk, e.id);
      });
      matches.sort(function (a, b) {
        return a.localeCompare(b);
      });
      for (let m = 0; m < matches.length; m++) {
        const kk = matches[m];
        if (used.has(kk)) continue;
        used.add(kk);
        ordered.push(kk);
      }
    }

    const rest = allKeys.filter(function (kk) {
      return !used.has(kk);
    });
    rest.sort(function (a, b) {
      return a.localeCompare(b);
    });
    for (let r = 0; r < rest.length; r++) {
      if (isExcludedStandaloneIndexKey(rest[r])) continue;
      ordered.push(rest[r]);
    }
    return ordered;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * @returns {{ text: string, title: string }}
   */
  function formatValueForTable(val) {
    if (val == null || val === '') return { text: '—', title: '' };
    if (typeof val === 'number' && Number.isFinite(val)) {
      const t = Number.isInteger(val) ? String(val) : String(Math.round(val * 10000) / 10000);
      return { text: t, title: t };
    }
    if (typeof val === 'boolean') return { text: val ? 'igen' : 'nem', title: '' };
    if (typeof val === 'object') {
      try {
        const j = JSON.stringify(val);
        const short = j.length > 240 ? j.slice(0, 240) + '…' : j;
        return { text: short, title: j };
      } catch (e) {
        const str = String(val);
        return { text: str.slice(0, 240), title: str };
      }
    }
    const str = String(val);
    if (str.length <= 240) return { text: str, title: str };
    return { text: str.slice(0, 240) + '…', title: str };
  }

  function hideFeedbackPanel() {
    if (elements.feedbackPanel) {
      elements.feedbackPanel.setAttribute('hidden', '');
      elements.feedbackPanel.classList.remove('feedback-panel--collapsed');
      const fbBtn = document.getElementById('feedback-collapse-btn');
      if (fbBtn) {
        fbBtn.setAttribute('aria-expanded', 'true');
        const g = fbBtn.querySelector('.feedback-panel__edge-tab-glyph');
        if (g) g.textContent = '›';
      }
    }
    if (elements.feedbackPanelInner) {
      elements.feedbackPanelInner.innerHTML = '';
    }
    if (map) setTimeout(function () { map.resize(); }, 80);
  }

  function renderFeedbackPanel(winningCity, targets, finalScore, maxPossible, matchPercent) {
    const inner = elements.feedbackPanelInner;
    const panel = elements.feedbackPanel;
    if (!inner || !panel || !winningCity) return;

    inner.textContent = '';

    const h2 = document.createElement('h2');
    h2.className = 'feedback-panel__title';
    h2.textContent = 'Találat részletei';

    const sumP = document.createElement('p');
    sumP.className = 'feedback-panel__summary';
    sumP.innerHTML =
      '<strong>' +
      escapeHtml(cityName(winningCity)) +
      '</strong> · Σ(w·|Δ|): <strong>' +
      escapeHtml(String(Math.round(finalScore * 1000) / 1000)) +
      '</strong> · max.: ' +
      escapeHtml(String(Math.round(maxPossible * 100) / 100)) +
      ' · egyezés: <strong>' +
      escapeHtml(matchPercent != null ? String(matchPercent) + '%' : '–') +
      '</strong>';

    inner.appendChild(h2);
    inner.appendChild(sumP);

    const h3a = document.createElement('h3');
    h3a.className = 'feedback-panel__section-title';
    h3a.textContent =
      '_index mutatók (cél, település, |Δ|, fontosság w 0–10, w·|Δ|)';

    const wrapA = document.createElement('div');
    wrapA.className = 'feedback-table-wrap';
    const tableA = document.createElement('table');
    tableA.className = 'feedback-table';

    const trh = document.createElement('tr');
    ['Mutató', 'Cél', 'Település', '|Δ|', 'w (0–10)', 'w·|Δ|'].forEach(function (label) {
      const th = document.createElement('th');
      th.textContent = label;
      trh.appendChild(th);
    });
    const theadA = document.createElement('thead');
    theadA.appendChild(trh);
    tableA.appendChild(theadA);

    const rows = [];
    let sumDisplayed = 0;
    for (let i = 0; i < indexParamKeys.length; i++) {
      const key = indexParamKeys[i];
      const pack = targets[key];
      if (!pack || pack.value == null) continue;
      const want = pack.value;
      const weight =
        pack.weight != null && Number.isFinite(pack.weight)
          ? Math.max(0, Math.min(1, pack.weight))
          : 1;
      const got = parseNumeric(winningCity[key]);
      const diff = got != null ? Math.abs(want - got) : null;
      const wdiff = diff != null ? diff * weight : null;
      if (wdiff != null) sumDisplayed += wdiff;
      rows.push({
        key: key,
        want: want,
        got: got,
        diff: diff,
        weight: weight,
        wdiff: wdiff,
      });
    }

    const orderIx = {};
    for (let oi = 0; oi < indexParamKeys.length; oi++) {
      orderIx[indexParamKeys[oi]] = oi;
    }
    rows.sort(function (a, b) {
      const ia = orderIx[a.key] != null ? orderIx[a.key] : 999999;
      const ib = orderIx[b.key] != null ? orderIx[b.key] : 999999;
      return ia - ib;
    });

    const tbodyA = document.createElement('tbody');
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      const tr = document.createElement('tr');

      const td0 = document.createElement('td');
      td0.className = 'feedback-table__key';
      td0.textContent = paramLabelForDbKey(row.key);
      td0.title = row.key;

      const td1 = document.createElement('td');
      td1.className = 'feedback-table__num';
      td1.textContent = String(Math.round(row.want * 1000) / 1000);

      const td2 = document.createElement('td');
      td2.className = 'feedback-table__num';
      td2.textContent = row.got != null ? String(Math.round(row.got * 1000) / 1000) : '–';

      const td3 = document.createElement('td');
      td3.className = 'feedback-table__num';
      td3.textContent = row.diff != null ? String(Math.round(row.diff * 1000) / 1000) : '–';

      const td4 = document.createElement('td');
      td4.className = 'feedback-table__num';
      td4.textContent =
        row.weight != null && Number.isFinite(row.weight)
          ? String(Math.round(row.weight * PARAM_WEIGHT_SLIDER_MAX))
          : '–';

      const td5 = document.createElement('td');
      td5.className = 'feedback-table__num';
      td5.textContent = row.wdiff != null ? String(Math.round(row.wdiff * 1000) / 1000) : '–';

      tr.appendChild(td0);
      tr.appendChild(td1);
      tr.appendChild(td2);
      tr.appendChild(td3);
      tr.appendChild(td4);
      tr.appendChild(td5);
      tbodyA.appendChild(tr);
    }
    tableA.appendChild(tbodyA);

    const tfootA = document.createElement('tfoot');
    const trf = document.createElement('tr');
    const tdf0 = document.createElement('td');
    tdf0.colSpan = 5;
    tdf0.textContent = 'Σ w·|Δ| (csak ahol volt település-érték)';
    const tdf1 = document.createElement('td');
    tdf1.className = 'feedback-table__num';
    tdf1.textContent = String(Math.round(sumDisplayed * 1000) / 1000);
    trf.appendChild(tdf0);
    trf.appendChild(tdf1);
    tfootA.appendChild(trf);
    tableA.appendChild(tfootA);

    wrapA.appendChild(tableA);

    inner.appendChild(h3a);
    inner.appendChild(wrapA);

    const h3b = document.createElement('h3');
    h3b.className = 'feedback-panel__section-title';
    h3b.textContent = 'Minden oszlop (nyertes sor)';

    const wrapB = document.createElement('div');
    wrapB.className = 'feedback-table-wrap';
    const tableB = document.createElement('table');
    tableB.className = 'feedback-table feedback-table--all';

    const trhb = document.createElement('tr');
    ['Oszlop', 'Érték'].forEach(function (label) {
      const th = document.createElement('th');
      th.textContent = label;
      trhb.appendChild(th);
    });
    const theadB = document.createElement('thead');
    theadB.appendChild(trhb);
    tableB.appendChild(theadB);

    const tbodyB = document.createElement('tbody');
    const keys = orderAllWinningCityKeys(Object.keys(winningCity));
    for (let j = 0; j < keys.length; j++) {
      const k = keys[j];
      const tr = document.createElement('tr');
      const tdK = document.createElement('td');
      tdK.className = 'feedback-table__key';
      tdK.textContent = columnDisplayLabel(k);
      tdK.title = k;

      const tdV = document.createElement('td');
      tdV.className = 'feedback-table__val';
      const formatted = formatValueForTable(winningCity[k]);
      tdV.textContent = formatted.text;
      if (formatted.title && formatted.title !== formatted.text) {
        tdV.title = formatted.title;
      }

      tr.appendChild(tdK);
      tr.appendChild(tdV);
      tbodyB.appendChild(tr);
    }
    tableB.appendChild(tbodyB);
    wrapB.appendChild(tableB);

    inner.appendChild(h3b);
    inner.appendChild(wrapB);

    panel.classList.remove('feedback-panel--collapsed');
    const fbBtn = document.getElementById('feedback-collapse-btn');
    if (fbBtn) {
      fbBtn.setAttribute('aria-expanded', 'true');
      const g = fbBtn.querySelector('.feedback-panel__edge-tab-glyph');
      if (g) g.textContent = '›';
    }
    panel.removeAttribute('hidden');
  }

  /** Aktuális csúszkaértékek mentése „eredeti” visszaállításhoz (build / első betöltés után). */
  function captureParamSlidersBaseline(scopeEl) {
    if (!scopeEl) return;
    scopeEl.querySelectorAll('input[type="range"][data-param-key]').forEach(function (el) {
      el.setAttribute('data-baseline-value', String(el.value));
    });
    scopeEl.querySelectorAll('input[type="range"][data-param-weight-for]').forEach(function (el) {
      el.setAttribute('data-baseline-weight', String(el.value));
    });
  }

  function restoreParamSlidersFromBaseline(scopeEl) {
    if (!scopeEl) return;
    guidedFlowIgnoreInputs = true;
    try {
      scopeEl.querySelectorAll('input[type="range"][data-param-key]').forEach(function (el) {
        const b = el.getAttribute('data-baseline-value');
        if (b == null || b === '') return;
        el.value = b;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });
      scopeEl.querySelectorAll('input[type="range"][data-param-weight-for]').forEach(function (el) {
        const b = el.getAttribute('data-baseline-weight');
        if (b == null || b === '') return;
        el.value = b;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });
    } finally {
      guidedFlowIgnoreInputs = false;
    }
  }

  function randomizeSlidersInElement(scopeEl) {
    if (!scopeEl) return;
    guidedFlowIgnoreInputs = true;
    try {
      const sliders = scopeEl.querySelectorAll('input[type="range"][data-param-key]');
      sliders.forEach(function (el) {
        const card = el.closest('.param-item');
        if (card && card.getAttribute('data-param-active') === '0') return;
        const min = parseFloat(el.min);
        const max = parseFloat(el.max);
        const step = parseFloat(el.step);
        const st = Number.isFinite(step) && step > 0 ? step : 1;
        if (!Number.isFinite(min) || !Number.isFinite(max)) return;
        const raw = min + Math.random() * (max - min);
        const v = snapToStep(raw, min, max, st);
        el.value = String(v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });
    } finally {
      guidedFlowIgnoreInputs = false;
    }
  }

  /**
   * @param {string} sectionTitle
   * @param {boolean} [startExpanded] alapértelmezés: true (nyitva)
   */
  function createParamGroupBlock(sectionTitle, startExpanded) {
    paramCategoryUid++;
    const bodyId = 'param-group-body-' + paramCategoryUid;

    const wrap = document.createElement('div');
    wrap.className = 'control-group param-group';

    const expanded = startExpanded !== false;

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'param-group__toggle';
    toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    toggle.setAttribute('aria-controls', bodyId);

    const chevron = document.createElement('span');
    chevron.className = 'param-group__chevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.textContent = '▼';

    const titleEl = document.createElement('span');
    titleEl.className = 'param-group__title';
    titleEl.textContent = sectionTitle;

    toggle.appendChild(chevron);
    toggle.appendChild(titleEl);

    const body = document.createElement('div');
    body.id = bodyId;
    body.className = 'param-group__body';

    wrap.appendChild(toggle);
    wrap.appendChild(body);

    if (!expanded) {
      wrap.classList.add('param-group--collapsed');
    }

    toggle.addEventListener('click', function () {
      const nowCollapsed = wrap.classList.toggle('param-group--collapsed');
      toggle.setAttribute('aria-expanded', nowCollapsed ? 'false' : 'true');
    });

    return { wrap: wrap, body: body };
  }

  /**
   * Többállású kapcsoló + egy csúszka: ingatlan (3 állás) vagy iskola (2 állás).
   * A csúszka a kiválasztott index oszlopot vezérli; a buborék a companion oszlopból jön.
   */
  function createVariantSegmentParamCard(uiParamId, matchingKeys, sliderIdNum, preset) {
    const ent = getUiParamEntryById(uiParamId);
    if (!ent) return null;

    const isSchool =
      uiParamId === 'primary_school_proximity_index' ||
      uiParamId === 'high_school_proximity_index';

    let variantMap = {};
    let labelDefs = [];
    let segmentOrder = INGATLAN_SEGMENT_ORDER;
    let segmentIndexMap = INGATLAN_SEGMENT_INDEX;
    let segmentCols = 3;
    let formatFn = formatIngatlanPctForUi;
    let parseCompanion = parseNumeric;
    let itemExtraClass = 'param-item--ingatlan-variant';
    let segmentAriaLabel = 'Ingatlan típus: telek, lakás, ház';
    let defaultVariantId = 'haz';

    if (isSchool) {
      variantMap = buildSchoolVariantMap(uiParamId);
      labelDefs = schoolVariantDefsForUiParam(uiParamId);
      segmentOrder = SCHOOL_SEGMENT_ORDER;
      segmentIndexMap = SCHOOL_SEGMENT_INDEX;
      segmentCols = 2;
      formatFn = formatKmForUi;
      parseCompanion = parseNumeric;
      itemExtraClass = 'param-item--school-variant';
      segmentAriaLabel = 'Iskola típus: állami, alternatív';
      defaultVariantId = variantMap.allami ? 'allami' : 'alternativ';
    } else {
      if (!matchingKeys || !matchingKeys.length) return null;
      const isGrow = uiParamId === 'real_estate_price_grow_5yrs_index';
      const variantDefs = isGrow ? INGATLAN_GROW_VARIANTS : INGATLAN_AVG_VARIANTS;
      formatFn = isGrow ? formatIngatlanPctForUi : formatHufForUi;
      parseCompanion = isGrow ? parseNumeric : parseHufAmount;
      labelDefs = variantDefs;
      for (let vi = 0; vi < variantDefs.length; vi++) {
        const vd = variantDefs[vi];
        const indexKey = findIngatlanIndexKeyForVariant(matchingKeys, vd.indexMatch);
        if (!indexKey) continue;
        const companionKey = ingatlanCompanionColumnKey(indexKey, vd.companionSuffix);
        if (!companionKey) continue;
        variantMap[vd.id] = { indexKey: indexKey, companionKey: companionKey };
      }
      defaultVariantId = variantMap.haz ? 'haz' : variantMap.lakas ? 'lakas' : 'telek';
    }

    if (!variantMap[defaultVariantId]) {
      const firstId = segmentOrder.find(function (id) {
        return !!variantMap[id];
      });
      if (!firstId) return null;
      defaultVariantId = firstId;
    }

    paramCategoryUid++;
    const bodyId = 'param-item-body-' + paramCategoryUid;
    const labelText = ent.megnevezes;
    const sid = 'param-slider-' + sliderIdNum;
    const wid = 'param-weight-' + sliderIdNum;

    const wrap = document.createElement('div');
    wrap.className = 'control-group param-item ' + itemExtraClass;
    wrap.setAttribute('data-param-active', '0');
    wrap.classList.add('param-item--inactive');
    wrap.classList.add('param-item--collapsed');
    wrap._ingFormat = formatFn;
    wrap._ingVariantMap = variantMap;
    wrap._ingActiveVariant = defaultVariantId;

    const activeSwitch = document.createElement('button');
    activeSwitch.type = 'button';
    activeSwitch.className = 'param-item__ios-switch';
    activeSwitch.setAttribute('role', 'switch');
    activeSwitch.setAttribute('aria-checked', 'false');
    activeSwitch.setAttribute('aria-label', 'Beleszámít a keresésbe: ' + labelText);
    activeSwitch.title = 'Beleszámít a keresésbe';

    const headRow = document.createElement('div');
    headRow.className = 'param-item__head-row';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'param-item__toggle';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', bodyId);

    const chevron = document.createElement('span');
    chevron.className = 'param-item__chevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.textContent = '▼';

    const titleEl = document.createElement('span');
    titleEl.className = 'param-item__title';
    titleEl.textContent = labelText;
    titleEl.title = uiParamId;

    toggle.appendChild(chevron);
    toggle.appendChild(titleEl);
    headRow.appendChild(toggle);
    headRow.appendChild(createParameterInfoWrapForKey(uiParamId));
    headRow.appendChild(activeSwitch);

    activeSwitch.addEventListener('click', function (e) {
      e.stopPropagation();
      e.preventDefault();
      const wasCollapsed = wrap.classList.contains('param-item--collapsed');
      const turningOn = activeSwitch.getAttribute('aria-checked') !== 'true';
      preserveSidebarScrollAnchor(headRow, function () {
        const nowOn = activeSwitch.getAttribute('aria-checked') !== 'true';
        activeSwitch.setAttribute('aria-checked', nowOn ? 'true' : 'false');
        wrap.setAttribute('data-param-active', nowOn ? '1' : '0');
        wrap.classList.toggle('param-item--inactive', !nowOn);
        if (nowOn) {
          if (wrap.classList.contains('param-item--collapsed')) {
            wrap.classList.remove('param-item--collapsed');
            toggle.setAttribute('aria-expanded', 'true');
          }
        } else if (!wrap.classList.contains('param-item--collapsed')) {
          wrap.classList.add('param-item--collapsed');
          toggle.setAttribute('aria-expanded', 'false');
        }
      });
      if (turningOn && wasCollapsed) startParamExpandScrollStabilize(wrap, headRow);
      if (sliderAutoSearchActive) sidebarLayoutAnchorEl = headRow;
      scheduleSearchFromSliders();
    });

    toggle.addEventListener('click', function () {
      preserveSidebarScrollAnchor(headRow, function () {
        const nowCollapsed = wrap.classList.toggle('param-item--collapsed');
        toggle.setAttribute('aria-expanded', nowCollapsed ? 'false' : 'true');
      });
    });

    const itemBody = document.createElement('div');
    itemBody.id = bodyId;
    itemBody.className = 'param-item__body';

    const input = document.createElement('input');
    input.type = 'range';
    input.className = 'slider';
    input.id = sid;

    const stack = document.createElement('div');
    stack.className = 'param-slider-stack';
    const row = document.createElement('div');
    row.className = 'param-range-row';
    const minEl = document.createElement('span');
    minEl.className = 'param-range-end param-range-end--min';
    const maxEl = document.createElement('span');
    maxEl.className = 'param-range-end param-range-end--max';
    const sliderWrap = document.createElement('div');
    sliderWrap.className = 'slider-wrap param-range-thumb-wrap';
    const bubble = document.createElement('div');
    bubble.className = 'slider-bubble param-range-value-bubble';
    bubble.setAttribute('aria-hidden', 'true');
    sliderWrap.appendChild(bubble);
    sliderWrap.appendChild(input);
    row.appendChild(minEl);
    row.appendChild(sliderWrap);
    row.appendChild(maxEl);
    stack.appendChild(row);
    itemBody.appendChild(stack);

    bindSliderThumbBubble(input, bubble, sliderWrap, function (sl) {
      const model = wrap._ingModel;
      const fmt = wrap._ingFormat;
      if (model && fmt) return fmt(model.valueAtSliderValue(parseFloat(sl.value)));
      return String(sl.value);
    });

    function applyVariantSegment(
      card,
      variantId,
      segmentBtns,
      segTrack,
      slInput,
      minSpan,
      maxSpan,
      bub,
      sWrap,
      wInp,
      segIdxMap
    ) {
      const vm = card._ingVariantMap[variantId];
      if (!vm) return;
      const key = vm.indexKey;
      const r = sliderRanges[key];
      if (!r) return;

      card._ingActiveVariant = variantId;
      const segIdx = segIdxMap[variantId];
      if (segTrack != null && Number.isFinite(segIdx)) {
        segTrack.style.setProperty('--seg-idx', String(segIdx));
      }
      Object.keys(segmentBtns).forEach(function (id) {
        const btn = segmentBtns[id];
        if (!btn) return;
        const on = id === variantId;
        btn.classList.toggle('param-variant-segment__btn--active', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      const step = computeStep(r.min, r.max);
      const mid = snapToStep((r.min + r.max) / 2, r.min, r.max, step);
      const model = createIndexCompanionAverageModel(key, vm.companionKey, step, parseCompanion);
      card._ingModel = model;
      slInput.setAttribute('data-param-key', key);
      slInput.setAttribute('aria-label', labelText + ' (' + key + ')');
      slInput.title = key;
      if (wInp) wInp.setAttribute('data-param-weight-for', key);
      slInput.min = String(r.min);
      slInput.max = String(r.max);
      slInput.step = String(step);
      slInput.value = String(mid);
      const fmt = card._ingFormat;
      if (model && fmt) {
        minSpan.textContent = fmt(model.valueAtSliderValue(r.min));
        maxSpan.textContent = fmt(model.valueAtSliderValue(r.max));
        const t = fmt(model.valueAtSliderValue(parseFloat(slInput.value)));
        bub.textContent = t;
        slInput.setAttribute('aria-valuetext', t);
      }
      const x = rangeInputThumbBubbleLeftPx(slInput, sWrap);
      if (Number.isFinite(x)) {
        bub.style.left = Math.max(0, x) + 'px';
        bub.style.transform = 'translateX(-50%)';
      }
      slInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    const labelByVariantId = {};
    for (let li = 0; li < labelDefs.length; li++) {
      labelByVariantId[labelDefs[li].id] = labelDefs[li].label;
    }

    const segmentWrap = document.createElement('div');
    segmentWrap.className = 'param-variant-segment';
    segmentWrap.setAttribute('role', 'group');
    segmentWrap.setAttribute('aria-label', segmentAriaLabel);

    const segTrack = document.createElement('div');
    segTrack.className =
      'param-variant-segment__track' +
      (segmentCols === 2 ? ' param-variant-segment__track--cols-2' : '');
    const segThumb = document.createElement('span');
    segThumb.className = 'param-variant-segment__thumb';
    segThumb.setAttribute('aria-hidden', 'true');
    segTrack.appendChild(segThumb);

    const segmentBtns = {};
    for (let si = 0; si < segmentOrder.length; si++) {
      const segId = segmentOrder[si];
      const segBtn = document.createElement('button');
      segBtn.type = 'button';
      segBtn.className = 'param-variant-segment__btn';
      segBtn.setAttribute('data-variant-id', segId);
      segBtn.textContent = labelByVariantId[segId] || segId;
      segBtn.setAttribute('aria-pressed', 'false');
      if (!variantMap[segId]) {
        segBtn.disabled = true;
        segBtn.classList.add('param-variant-segment__btn--unavailable');
      }
      segmentBtns[segId] = segBtn;
      segTrack.appendChild(segBtn);
      segBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (segBtn.disabled) return;
        applyVariantSegment(
          wrap,
          segId,
          segmentBtns,
          segTrack,
          input,
          minEl,
          maxEl,
          bubble,
          sliderWrap,
          wInput,
          segmentIndexMap
        );
        if (sliderAutoSearchActive) scheduleSearchFromSliders();
      });
    }
    segmentWrap.appendChild(segTrack);

    const weightWrap = document.createElement('div');
    weightWrap.className = 'param-item__weight';
    const wInput = document.createElement('input');
    wInput.type = 'range';
    wInput.className = 'slider param-weight-slider';
    wInput.id = wid;
    wInput.setAttribute('data-param-weight-for', variantMap[defaultVariantId].indexKey);
    wInput.setAttribute('aria-label', 'Fontosság: ' + labelText);
    wInput.title = 'Fontosság (0–' + PARAM_WEIGHT_SLIDER_MAX + ', egész)';
    wInput.min = '0';
    wInput.max = String(PARAM_WEIGHT_SLIDER_MAX);
    wInput.step = '1';
    wInput.value = String(PARAM_WEIGHT_SLIDER_MAX);
    const wStack = buildParamRangeRowWithExtrema(wInput, 1, 0, PARAM_WEIGHT_SLIDER_MAX);
    const wLabel = document.createElement('span');
    wLabel.className = 'param-weight-label';
    wLabel.textContent = 'Fontosság · a |Δ| szorzója (0–' + PARAM_WEIGHT_SLIDER_MAX + ', csak egész)';
    weightWrap.appendChild(wStack);
    weightWrap.appendChild(wLabel);

    itemBody.insertBefore(segmentWrap, stack);
    itemBody.appendChild(weightWrap);

    applyVariantSegment(
      wrap,
      defaultVariantId,
      segmentBtns,
      segTrack,
      input,
      minEl,
      maxEl,
      bubble,
      sliderWrap,
      wInput,
      segmentIndexMap
    );
    bindParamRangeTrackSeek(input);
    bindParamRangeTrackSeek(wInput);

    wrap.appendChild(headRow);
    wrap.appendChild(itemBody);
    wrap._ingWeightInput = wInput;

    return wrap;
  }

  function createParamItemCard(key, sliderIdNum) {
    paramCategoryUid++;
    const bodyId = 'param-item-body-' + paramCategoryUid;
    const labelText = paramLabelForDbKey(key);

    const r = sliderRanges[key];
    if (!r) return null;
    const step = computeStep(r.min, r.max);
    const mid = snapToStep((r.min + r.max) / 2, r.min, r.max, step);
    const sid = 'param-slider-' + sliderIdNum;
    const wid = 'param-weight-' + sliderIdNum;

    const wrap = document.createElement('div');
    wrap.className = 'control-group param-item';
    wrap.setAttribute('data-param-active', '0');
    wrap.classList.add('param-item--inactive');
    wrap.classList.add('param-item--collapsed');

    const activeSwitch = document.createElement('button');
    activeSwitch.type = 'button';
    activeSwitch.className = 'param-item__ios-switch';
    activeSwitch.setAttribute('role', 'switch');
    activeSwitch.setAttribute('aria-checked', 'false');
    activeSwitch.setAttribute('aria-label', 'Beleszámít a keresésbe: ' + labelText);
    activeSwitch.title = 'Beleszámít a keresésbe';

    const headRow = document.createElement('div');
    headRow.className = 'param-item__head-row';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'param-item__toggle';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', bodyId);

    const chevron = document.createElement('span');
    chevron.className = 'param-item__chevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.textContent = '▼';

    const titleEl = document.createElement('span');
    titleEl.className = 'param-item__title';
    titleEl.textContent = labelText;
    titleEl.title = key;

    toggle.appendChild(chevron);
    toggle.appendChild(titleEl);

    headRow.appendChild(toggle);
    headRow.appendChild(createParameterInfoWrapForKey(key));
    headRow.appendChild(activeSwitch);

    activeSwitch.addEventListener('click', function (e) {
      e.stopPropagation();
      e.preventDefault();
      const wasCollapsed = wrap.classList.contains('param-item--collapsed');
      const turningOn = activeSwitch.getAttribute('aria-checked') !== 'true';
      preserveSidebarScrollAnchor(headRow, function () {
        const nowOn = activeSwitch.getAttribute('aria-checked') !== 'true';
        activeSwitch.setAttribute('aria-checked', nowOn ? 'true' : 'false');
        wrap.setAttribute('data-param-active', nowOn ? '1' : '0');
        wrap.classList.toggle('param-item--inactive', !nowOn);
        if (nowOn) {
          if (wrap.classList.contains('param-item--collapsed')) {
            wrap.classList.remove('param-item--collapsed');
            toggle.setAttribute('aria-expanded', 'true');
          }
        } else if (!wrap.classList.contains('param-item--collapsed')) {
          wrap.classList.add('param-item--collapsed');
          toggle.setAttribute('aria-expanded', 'false');
        }
      });
      if (turningOn && wasCollapsed) {
        startParamExpandScrollStabilize(wrap, headRow);
      }
      if (sliderAutoSearchActive) {
        sidebarLayoutAnchorEl = headRow;
      }
      scheduleSearchFromSliders();
    });

    const itemBody = document.createElement('div');
    itemBody.id = bodyId;
    itemBody.className = 'param-item__body';

    const input = document.createElement('input');
    input.type = 'range';
    input.className = 'slider';
    input.id = sid;
    input.setAttribute('data-param-key', key);
    input.setAttribute('aria-label', labelText + ' (' + key + ')');
    input.title = key;
    input.min = String(r.min);
    input.max = String(r.max);
    input.step = String(step);
    input.value = String(mid);

    const uiParamEnt = getUiParamEntryForDbKey(key);
    let indexCompanionModel = null;
    /** @type {null | function(number|null): string} */
    let indexCompanionFormat = null;
    /** @type {{ a: object, b: object, formatPair: function(number|null, number|null): string } | null} */
    let twoCompanion = null;
    if (uiParamEnt) {
      if (uiParamEnt.id === 'forest_index') {
        const ck = forestCompanionRatioColumnKey(key);
        indexCompanionModel = ck ? createIndexCompanionAverageModel(key, ck, step) : null;
        indexCompanionFormat = formatForestRatioForUi;
      } else if (uiParamEnt.id === 'water_index') {
        const ck = waterCompanionRatioColumnKey(key);
        indexCompanionModel = ck ? createIndexCompanionAverageModel(key, ck, step) : null;
        indexCompanionFormat = formatForestRatioForUi;
      } else if (uiParamEnt.id === 'terrain_index') {
        const ck = terrainCompanionSlopeColumnKey(key);
        indexCompanionModel = ck ? createIndexCompanionAverageModel(key, ck, step) : null;
        indexCompanionFormat = formatSlopeDegreesForUi;
      } else if (uiParamEnt.id === 'budapest_car_train_index') {
        const ck = budapestCarTrainCompanionTotalMinKey(key);
        indexCompanionModel = ck ? createIndexCompanionAverageModel(key, ck, step) : null;
        indexCompanionFormat = formatMinutesForUi;
      } else if (uiParamEnt.id === 'internet_index') {
        const ck = internetCompanionMbpsKey(key);
        indexCompanionModel = ck ? createIndexCompanionAverageModel(key, ck, step) : null;
        indexCompanionFormat = formatMbpsForUi;
      } else if (uiParamEnt.id === 'transport_frequency_index') {
        const ck = transportFrequencyCompanionNapiJaratokKey(key);
        indexCompanionModel = ck ? createIndexCompanionAverageModel(key, ck, step) : null;
        indexCompanionFormat = formatNapiJaratokForUi;
      } else if (uiParamEnt.id === 'district_seat_access_index') {
        const ck = districtSeatCompanionPercKey(key);
        indexCompanionModel = ck ? createIndexCompanionAverageModel(key, ck, step) : null;
        indexCompanionFormat = formatMinutesForUi;
      } else if (uiParamEnt.id === 'budapest_access_index') {
        const ck = budapestAccessCompanionPercKey(key);
        indexCompanionModel = ck ? createIndexCompanionAverageModel(key, ck, step) : null;
        indexCompanionFormat = formatMinutesForUi;
      } else if (uiParamEnt.id === 'groceries_index') {
        const ckKm = groceriesCompanionKmKey(key);
        const ckShops = groceriesCompanionBrandsKey(key);
        const mKm = ckKm ? createIndexCompanionAverageModel(key, ckKm, step) : null;
        const mShops = ckShops ? createIndexCompanionAverageModel(key, ckShops, step) : null;
        if (mKm && mShops) {
          twoCompanion = { a: mKm, b: mShops, formatPair: formatGroceriesPairForUi };
        }
      } else if (uiParamEnt.id === 'sport_index') {
        const ckA = sportCompanionSportagDbKey(key);
        const ckB = sportCompanionLetesitmenyDbKey(key);
        const mA = ckA ? createIndexCompanionAverageModel(key, ckA, step) : null;
        const mB = ckB ? createIndexCompanionAverageModel(key, ckB, step) : null;
        if (mA && mB) {
          twoCompanion = { a: mA, b: mB, formatPair: formatSportPairForUi };
        }
      } else if (uiParamEnt.id === 'gastro_index') {
        const ck = gastroCompanionGasztroDbKey(key);
        indexCompanionModel = ck ? createIndexCompanionAverageModel(key, ck, step) : null;
        indexCompanionFormat = formatVendeglatohelyForUi;
      } else if (uiParamEnt.id === 'senior_index') {
        const ck = seniorCompanionArany65Key(key);
        indexCompanionModel = ck ? createIndexCompanionAverageModel(key, ck, step) : null;
        indexCompanionFormat = formatForestRatioForUi;
      } else if (uiParamEnt.id === 'diploma_index') {
        const ck = diplomaCompanionAranyaKey(key);
        indexCompanionModel = ck ? createIndexCompanionAverageModel(key, ck, step) : null;
        indexCompanionFormat = formatForestRatioForUi;
      }
    }

    let valueStack;
    if (twoCompanion) {
      valueStack = buildTwoCompanionSliderStack(
        input,
        step,
        r.min,
        r.max,
        twoCompanion.a,
        twoCompanion.b,
        twoCompanion.formatPair
      );
    } else if (indexCompanionModel && indexCompanionFormat) {
      valueStack = buildIndexCompanionSliderStack(
        input,
        step,
        r.min,
        r.max,
        indexCompanionModel,
        indexCompanionFormat
      );
    } else {
      valueStack = buildParamRangeRowWithExtrema(input, step, r.min, r.max);
    }
    itemBody.appendChild(valueStack);

    const weightWrap = document.createElement('div');
    weightWrap.className = 'param-item__weight';

    const wInput = document.createElement('input');
    wInput.type = 'range';
    wInput.className = 'slider param-weight-slider';
    wInput.id = wid;
    wInput.setAttribute('data-param-weight-for', key);
    wInput.setAttribute(
      'aria-label',
      'Fontosság: ' + labelText + ' (' + key + ')'
    );
    wInput.title = 'Fontosság (0–' + PARAM_WEIGHT_SLIDER_MAX + ', egész) · ' + key;
    wInput.min = '0';
    wInput.max = String(PARAM_WEIGHT_SLIDER_MAX);
    wInput.step = '1';
    wInput.value = String(PARAM_WEIGHT_SLIDER_MAX);

    const wStack = buildParamRangeRowWithExtrema(wInput, 1, 0, PARAM_WEIGHT_SLIDER_MAX);

    const wLabel = document.createElement('span');
    wLabel.className = 'param-weight-label';
    wLabel.textContent =
      'Fontosság · a |Δ| szorzója (0–' + PARAM_WEIGHT_SLIDER_MAX + ', csak egész)';

    weightWrap.appendChild(wStack);
    weightWrap.appendChild(wLabel);
    itemBody.appendChild(weightWrap);

    wrap.appendChild(headRow);
    wrap.appendChild(itemBody);

    toggle.addEventListener('click', function () {
      preserveSidebarScrollAnchor(headRow, function () {
        const nowCollapsed = wrap.classList.toggle('param-item--collapsed');
        toggle.setAttribute('aria-expanded', nowCollapsed ? 'false' : 'true');
      });
    });

    bindParamRangeTrackSeek(input);
    bindParamRangeTrackSeek(wInput);

    return wrap;
  }

  function suggestCitiesFromAllParameters(raw, limit) {
    const q = normalizeSettlementName(preprocessSettlementQuery(String(raw || '')));
    if (!q.length) return [];
    const maxOut = Math.max(1, Math.min(50, limit == null ? 8 : limit));

    const districts = listBudapestDistrictRows();
    const wantManyDistricts = Math.max(maxOut, 23);

    if (districts.length && /^\d{1,2}$/.test(q)) {
      const pref = q;
      const filtered = [];
      for (let i = 0; i < districts.length; i++) {
        const c = districts[i];
        const dn = districtNumberFromSettlementName(cityName(c));
        if (!Number.isFinite(dn)) continue;
        if (String(dn).indexOf(pref) === 0) filtered.push(c);
      }
      if (filtered.length) {
        filtered.sort(function (a, b) {
          const na = districtNumberFromSettlementName(cityName(a));
          const nb = districtNumberFromSettlementName(cityName(b));
          if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
          return String(cityName(a)).localeCompare(String(cityName(b)), 'hu');
        });
        return filtered.slice(0, Math.min(filtered.length, wantManyDistricts));
      }
    }

    const isExactBudapest = q === 'budapest' || q === 'bp';
    const isTypingBudapestStem =
      q.length >= 4 && q.length < 'budapest'.length && 'budapest'.startsWith(q);
    if (districts.length && (isExactBudapest || isTypingBudapestStem)) {
      return districts.slice(0, Math.min(districts.length, wantManyDistricts));
    }

    const isBudapestRefinement =
      q.startsWith('budapest ') ||
      q.startsWith('budapest,') ||
      q.startsWith('bp ') ||
      /^bp[0-9ivxlcdm]/.test(q);
    if (districts.length && isBudapestRefinement) {
      let rest = '';
      if (q.startsWith('budapest')) {
        rest = q.slice('budapest'.length).replace(/^\s*,?\s*/, '').trim();
      } else if (q.startsWith('bp')) {
        rest = q.slice(2).replace(/^\s*,?\s*/, '').trim();
      }
      if (!rest.length) {
        return districts.slice(0, Math.min(districts.length, wantManyDistricts));
      }
      const filtered = [];
      for (let i = 0; i < districts.length; i++) {
        const c = districts[i];
        const n = normalizeSettlementName(cityName(c));
        if (n.indexOf(q) !== -1) {
          filtered.push(c);
          continue;
        }
        if (n.indexOf(rest) !== -1) {
          filtered.push(c);
          continue;
        }
        if (cityMatchesDistrictRestToken(c, rest)) {
          filtered.push(c);
        }
      }
      if (filtered.length) {
        return filtered.slice(0, maxOut);
      }
    }

    const starts = [];
    const includes = [];
    for (let i = 0; i < citiesData.length; i++) {
      const c = citiesData[i];
      const n = normalizeSettlementName(String(cityName(c) || ''));
      if (!n.length) continue;
      if (n.indexOf(q) === 0) starts.push(c);
      else if (n.indexOf(q) !== -1) includes.push(c);
    }
    starts.sort(function (a, b) {
      return String(cityName(a)).length - String(cityName(b)).length;
    });
    includes.sort(function (a, b) {
      return String(cityName(a)).length - String(cityName(b)).length;
    });
    return starts.concat(includes).slice(0, maxOut);
  }

  function setupGeoAutocomplete(slot) {
    const inp = slot === 'a' ? elements.geoCityInputA : elements.geoCityInputB;
    if (!inp) return;
    const acWrap = inp.closest('.geo-autocomplete-wrap');
    if (!acWrap) return;
    const list = acWrap.querySelector('.geo-suggest-list');
    if (!list) return;
    const geoCard = acWrap.closest('.param-item--geo-place');

    function syncGeoSuggestOverflow() {
      if (geoCard) geoCard.classList.toggle('param-item--geo-suggest-open', !list.hidden);
    }

    function hideListSoon() {
      window.setTimeout(function () {
        list.hidden = true;
        syncGeoSuggestOverflow();
      }, 280);
    }

    function renderSuggestions() {
      const qNorm = normalizeSettlementName(preprocessSettlementQuery(inp.value));
      let lim = 8;
      const isExactBudapest = qNorm === 'budapest' || qNorm === 'bp';
      const isTypingBudapestStem =
        qNorm.length >= 4 && qNorm.length < 8 && 'budapest'.startsWith(qNorm);
      const isDigitDistrictQuery = /^\d{1,2}$/.test(qNorm);
      const isBudapestRefine =
        qNorm.startsWith('budapest ') ||
        qNorm.startsWith('budapest,') ||
        qNorm.startsWith('bp ') ||
        /^bp[0-9ivxlcdm]/.test(qNorm);
      if (
        isExactBudapest ||
        isBudapestRefine ||
        isTypingBudapestStem ||
        isDigitDistrictQuery
      ) {
        lim = 23;
      }
      const sug = suggestCitiesFromAllParameters(inp.value, lim);
      list.innerHTML = '';
      if (sug.length === 0) {
        list.hidden = true;
        syncGeoSuggestOverflow();
        return;
      }
      sug.forEach(function (city) {
        const li = document.createElement('li');
        li.className = 'geo-suggest-item';
        li.setAttribute('role', 'option');
        li.textContent = cityName(city);
        li.addEventListener('mousedown', function (e) {
          e.preventDefault();
        });
        li.addEventListener('pointerdown', function (e) {
          e.preventDefault();
          applyGeoSlotFromCity(slot, city, null);
          list.hidden = true;
          syncGeoSuggestOverflow();
          inp.blur();
        });
        list.appendChild(li);
      });
      list.hidden = false;
      syncGeoSuggestOverflow();
    }

    list.addEventListener('mousedown', function (e) {
      e.preventDefault();
    });

    inp.addEventListener('input', renderSuggestions);
    inp.addEventListener('focus', renderSuggestions);
    inp.addEventListener('blur', hideListSoon);
    document.addEventListener('click', function (e) {
      if (!acWrap.contains(/** @type {Node} */ (e.target))) {
        list.hidden = true;
        syncGeoSuggestOverflow();
      }
    });
  }

  function createImportantPlaceCard(slot, titleLabel) {
    paramCategoryUid++;
    const bodyId = 'geo-item-body-' + paramCategoryUid;

    const wrap = document.createElement('div');
    wrap.className = 'control-group param-item param-item--geo-place';
    const activeSwitch = document.createElement('button');
    activeSwitch.type = 'button';
    activeSwitch.className = 'param-item__ios-switch';
    activeSwitch.id = 'geo-active-' + slot;
    activeSwitch.setAttribute('role', 'switch');
    activeSwitch.setAttribute('aria-label', 'Szűrő bekapcsolva: ' + titleLabel);
    activeSwitch.title = 'Fontos hely szűrő be / ki';

    if (slot === 'a') {
      wrap.setAttribute('data-param-active', '1');
      wrap.classList.remove('param-item--inactive');
      activeSwitch.setAttribute('aria-checked', 'true');
    } else {
      wrap.setAttribute('data-param-active', '0');
      wrap.classList.add('param-item--inactive');
      activeSwitch.setAttribute('aria-checked', 'false');
    }

    const headRow = document.createElement('div');
    headRow.className = 'param-item__head-row';

    const collapseToggle = document.createElement('button');
    collapseToggle.type = 'button';
    collapseToggle.className = 'param-item__toggle';
    collapseToggle.setAttribute('aria-expanded', 'true');
    collapseToggle.setAttribute('aria-controls', bodyId);

    const chevron = document.createElement('span');
    chevron.className = 'param-item__chevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.textContent = '▼';

    const titleEl = document.createElement('span');
    titleEl.className = 'param-item__title';
    titleEl.textContent = titleLabel;

    collapseToggle.appendChild(chevron);
    collapseToggle.appendChild(titleEl);
    headRow.appendChild(collapseToggle);
    headRow.appendChild(createParameterInfoWrapForKey(infoDbKeyForGeoSlot(slot)));
    headRow.appendChild(activeSwitch);

    const itemBody = document.createElement('div');
    itemBody.id = bodyId;
    itemBody.className = 'param-item__body';

    const cityLab = document.createElement('label');
    cityLab.className = 'control-label control-label-sub';
    cityLab.setAttribute('for', 'geo-city-input-' + slot);
    cityLab.textContent = 'Település (all_parameters)';

    const acWrap = document.createElement('div');
    acWrap.className = 'geo-autocomplete-wrap';

    const row = document.createElement('div');
    row.className = 'ref-city-row';

    const inp = document.createElement('input');
    inp.type = 'search';
    inp.id = 'geo-city-input-' + slot;
    inp.className = 'ref-city-input';
    inp.placeholder = 'Kezd el gépelni…';
    inp.autocomplete = 'off';
    inp.spellcheck = false;
    inp.setAttribute('aria-label', titleLabel + ' — település');

    const pickBtn = document.createElement('button');
    pickBtn.type = 'button';
    pickBtn.id = 'pick-geo-' + slot + '-btn';
    pickBtn.className = 'pick-map-btn';
    pickBtn.setAttribute('aria-pressed', 'false');
    pickBtn.setAttribute('aria-label', titleLabel + ' — térkép');
    pickBtn.title = 'Térképen';
    pickBtn.innerHTML =
      '<span class="material-symbols-outlined" aria-hidden="true">pin_drop</span>';

    row.appendChild(inp);
    row.appendChild(pickBtn);

    const list = document.createElement('ul');
    list.className = 'geo-suggest-list';
    list.hidden = true;
    list.setAttribute('role', 'listbox');

    acWrap.appendChild(row);
    acWrap.appendChild(list);

    itemBody.appendChild(cityLab);
    itemBody.appendChild(acWrap);

    const radLab = document.createElement('label');
    radLab.className = 'control-label control-label-sub';
    radLab.setAttribute('for', 'geo-radius-' + slot);
    radLab.textContent = 'Sugár (km)';

    const rInput = document.createElement('input');
    rInput.type = 'range';
    rInput.className = 'slider';
    rInput.id = 'geo-radius-' + slot;
    rInput.min = '0';
    rInput.max = '500';
    rInput.step = '1';
    rInput.value = '50';
    rInput.setAttribute('aria-label', titleLabel + ' — sugár (km)');

    const stack = buildParamRangeRowWithExtrema(rInput, 1, 0, 500, formatKmForUi);
    bindParamRangeTrackSeek(rInput);

    itemBody.appendChild(radLab);
    itemBody.appendChild(stack);

    wrap.appendChild(headRow);
    wrap.appendChild(itemBody);

    collapseToggle.addEventListener('click', function () {
      preserveSidebarScrollAnchor(headRow, function () {
        const nowCollapsed = wrap.classList.toggle('param-item--collapsed');
        collapseToggle.setAttribute('aria-expanded', nowCollapsed ? 'false' : 'true');
      });
    });

    activeSwitch.addEventListener('click', function (e) {
      e.stopPropagation();
      e.preventDefault();
      const wasCollapsed = wrap.classList.contains('param-item--collapsed');
      const turningOn = activeSwitch.getAttribute('aria-checked') !== 'true';
      preserveSidebarScrollAnchor(headRow, function () {
        const nowOn = activeSwitch.getAttribute('aria-checked') !== 'true';
        activeSwitch.setAttribute('aria-checked', nowOn ? 'true' : 'false');
        wrap.setAttribute('data-param-active', nowOn ? '1' : '0');
        wrap.classList.toggle('param-item--inactive', !nowOn);
        if (nowOn) {
          if (wrap.classList.contains('param-item--collapsed')) {
            wrap.classList.remove('param-item--collapsed');
            collapseToggle.setAttribute('aria-expanded', 'true');
          }
        } else if (!wrap.classList.contains('param-item--collapsed')) {
          wrap.classList.add('param-item--collapsed');
          collapseToggle.setAttribute('aria-expanded', 'false');
        }
      });
      if (turningOn && wasCollapsed) {
        startParamExpandScrollStabilize(wrap, headRow);
      }
      if (sliderAutoSearchActive) {
        sidebarLayoutAnchorEl = headRow;
      }
      refreshGeoFilterWarning();
      scheduleSearchFromSliders();
      updateImportantPlaceCircles();
    });

    if (slot === 'b') {
      wrap.classList.add('param-item--collapsed');
      collapseToggle.setAttribute('aria-expanded', 'false');
    }

    return wrap;
  }

  function buildImportantPlacesPanel() {
    const host = document.getElementById('important-places-host');
    if (!host) return;
    host.innerHTML = '';
    const grp = createParamGroupBlock('Számomra fontos helyek', true);
    grp.wrap.classList.add('important-places-group');

    const warn = document.createElement('p');
    warn.id = 'geo-warn-line';
    warn.className = 'ref-line ref-line--warn';
    warn.hidden = true;

    grp.body.appendChild(
      createImportantPlaceCard('a', geoImportantPlaceTitle.a || '1. számomra fontos hely')
    );
    grp.body.appendChild(
      createImportantPlaceCard('b', geoImportantPlaceTitle.b || '2. számomra fontos hely')
    );
    grp.body.appendChild(warn);
    host.appendChild(grp.wrap);
  }

  function buildParamSliders() {
    clearGuidedScrollTimer();
    const root = elements.paramCategoriesHost;
    if (!root) return;
    root.innerHTML = '';

    if (indexParamKeys.length === 0) {
      root.innerHTML =
        '<p class="ref-line ref-line--warn">Nincs _index mező betöltve. Ellenőrizd az all_parameters táblát.</p>';
      guidedParamKeys = [];
      guidedFlowUnlocked = false;
      guidedFlowParamIndex = 0;
      return;
    }

    const plan = buildSliderPlan(indexParamKeys);
    let sliderIndex = 0;
    let groupBody = null;

    for (let pi = 0; pi < plan.length; pi++) {
      const item = plan[pi];
      if (item.type === 'section') {
        const grp = createParamGroupBlock(item.title, false);
        root.appendChild(grp.wrap);
        groupBody = grp.body;
        continue;
      }
      if (item.type === 'variant_segment' && groupBody) {
        const card = createVariantSegmentParamCard(item.uiParamId, item.keys, sliderIndex, item.preset);
        if (card) groupBody.appendChild(card);
        sliderIndex++;
      } else if (item.type === 'slider' && groupBody) {
        const card = createParamItemCard(item.key, sliderIndex);
        if (card) groupBody.appendChild(card);
        sliderIndex++;
      }
    }
    captureParamSlidersBaseline(root);
    rebuildGuidedParamKeysFromDom();
    guidedFlowUnlocked = false;
    guidedFlowParamIndex = 0;
  }

  function collectSliderTargets() {
    /** @type {Record<string, { value: number, weight: number }>} */
    const targets = {};
    if (!elements.paramCategoriesHost) return targets;
    const sliders = elements.paramCategoriesHost.querySelectorAll('input[type="range"][data-param-key]');
    sliders.forEach(function (el) {
      const key = el.getAttribute('data-param-key');
      if (!key) return;
      const card = el.closest('.param-item');
      if (card && card.getAttribute('data-param-active') === '0') return;
      const n = parseNumeric(el.value);
      if (n == null) return;
      let w = 1;
      if (card) {
        const wEl = card.querySelector('input[type="range"][data-param-weight-for]');
        if (wEl) {
          const ww = parseFloat(wEl.value);
          if (Number.isFinite(ww)) {
            const wi = Math.round(ww);
            w =
              Math.max(0, Math.min(PARAM_WEIGHT_SLIDER_MAX, wi)) / PARAM_WEIGHT_SLIDER_MAX;
          }
        }
      }
      targets[key] = { value: n, weight: w };
    });
    return targets;
  }

  function normalizeParameterInfoTableKey(k) {
    if (k == null || k === '') return '';
    return String(k)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }

  function pickParameterInfoRowKey(row) {
    if (!row || typeof row !== 'object') return '';
    const preferred = [
      'parameter_key',
      'param_key',
      'mutato_kod',
      'mutato',
      'slug',
      'key',
      'kod',
    ];
    for (let i = 0; i < preferred.length; i++) {
      const v = row[preferred[i]];
      if (v != null && String(v).trim() !== '') return String(v).trim();
    }
    const nameHits = new Set([
      'parameterkey',
      'paramkey',
      'mutatokod',
      'mutato',
      'slug',
      'key',
      'kod',
    ]);
    const keys = Object.keys(row);
    for (let i = 0; i < keys.length; i++) {
      const rk = keys[i];
      const norm = rk
        .toLowerCase()
        .replace(/\uFEFF/g, '')
        .replace(/\s+/g, '')
        .replace(/_/g, '');
      if (nameHits.has(norm)) {
        const v = row[rk];
        if (v != null && String(v).trim() !== '') return String(v).trim();
      }
    }
    return '';
  }

  function pickParameterInfoUiDef(row) {
    if (!row || typeof row !== 'object') return '';
    const keys = Object.keys(row);
    for (let i = 0; i < keys.length; i++) {
      const rk = keys[i];
      const n = rk
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/_/g, '')
        .replace(/í/g, 'i')
        .replace(/ó/g, 'o')
        .replace(/é/g, 'e')
        .replace(/á/g, 'a');
      if (
        n === 'uidefinicio' ||
        n === 'uidefinition' ||
        (n.indexOf('ui') !== -1 && n.indexOf('defin') !== -1)
      ) {
        const v = row[rk];
        if (v != null && String(v).trim() !== '') return String(v);
      }
    }
    const direct = row['UI definíció'];
    if (direct != null && String(direct).trim() !== '') return String(direct);
    const fallback = row.ui_definicio || row.ui_definition || row.leiras || row.description;
    if (fallback != null && String(fallback).trim() !== '') return String(fallback);
    return '';
  }

  function pickParameterInfoMegnevezes(row) {
    if (!row || typeof row !== 'object') return '';
    const direct = row.megnevezes || row.megnevezés || row.megnevezes_display;
    if (direct != null && String(direct).trim() !== '') return String(direct).trim();
    const keys = Object.keys(row);
    for (let i = 0; i < keys.length; i++) {
      const rk = keys[i];
      const n = rk.toLowerCase().replace(/\s+/g, '').replace(/í/g, 'i').replace(/é/g, 'e');
      if (n === 'megnevezes' || n === 'megjelenonev' || n === 'cimke' || n === 'label') {
        const v = row[rk];
        if (v != null && String(v).trim() !== '') return String(v).trim();
      }
    }
    return '';
  }

  function pickParameterInfoAdatforrasOk(row) {
    if (!row || typeof row !== 'object') return '';
    const direct = row.adatforras_ok || row.adatforras;
    if (direct != null && String(direct).trim() !== '') return String(direct).trim();
    const keys = Object.keys(row);
    for (let i = 0; i < keys.length; i++) {
      const rk = keys[i];
      const n = rk.toLowerCase().replace(/\s+/g, '').replace(/í/g, 'i').replace(/á/g, 'a');
      if (n === 'adatforrasok' || (n.indexOf('adatforras') !== -1 && n.indexOf('link') === -1)) {
        const v = row[rk];
        if (v != null && String(v).trim() !== '') return String(v).trim();
      }
    }
    return '';
  }

  function pickParameterInfoAdatforrasLink(row) {
    if (!row || typeof row !== 'object') return '';
    const direct = row.adatforras_link || row.adatforras_linkje;
    if (direct != null && String(direct).trim() !== '') return String(direct).trim();
    const keys = Object.keys(row);
    for (let i = 0; i < keys.length; i++) {
      const rk = keys[i];
      const n = rk.toLowerCase().replace(/\s+/g, '').replace(/í/g, 'i');
      if (n.indexOf('adatforras') !== -1 && n.indexOf('link') !== -1) {
        const v = row[rk];
        if (v != null && String(v).trim() !== '') return String(v).trim();
      }
    }
    return '';
  }

  /**
   * Tooltip: UI definíció, egy üres sor, majd adatforrás linkek (több URL: pontosvessző → külön sor).
   * @param {Record<string, unknown>} row
   */
  function splitParameterInfoLinkUrls(raw) {
    if (raw == null || String(raw).trim() === '') return [];
    return String(raw)
      .split(/\s*;\s*/)
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean);
  }

  function buildParameterInfoTooltipFromRow(row) {
    const ui = pickParameterInfoUiDef(row).trim();
    const linkRaw = pickParameterInfoAdatforrasLink(row).trim();
    const urls = splitParameterInfoLinkUrls(linkRaw);
    const linksBlock = urls.join('\n');
    let out = ui;
    if (linksBlock) {
      if (out) out += '\n\n' + linksBlock;
      else out = linksBlock;
    }
    if (!out.trim()) {
      const m = pickParameterInfoMegnevezes(row).trim();
      if (m) out = m;
    }
    return out;
  }

  function applyParameterInfoMegnevezesFromRows(data) {
    if (!Array.isArray(data)) return;
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const k = pickParameterInfoRowKey(row);
      const label = pickParameterInfoMegnevezes(row);
      if (!k || !label) continue;
      const kn = normalizeParameterInfoTableKey(k);
      for (let j = 0; j < PARAMETER_UI_ENTRIES.length; j++) {
        const e = PARAMETER_UI_ENTRIES[j];
        if (e.type === 'param' && e.id === kn) {
          e.megnevezes = label;
          break;
        }
      }
    }
  }

  async function fetchParameterInfoMap() {
    try {
      const { data, error } = await supabase.from(PARAMETER_INFO_TABLE).select('*');
      if (error) {
        console.warn('parameter_info:', error.message || error);
        return;
      }
      parameterInfoByKey = {};
      geoImportantPlaceTitle = { a: '', b: '' };
      if (!Array.isArray(data)) return;
      if (data.length === 0) {
        console.warn(
          'parameter_info: 0 sor érkezett (anon REST). A Table Editorben látható adat nem jelenik meg a böngészőben, ' +
            'ha nincs SELECT policy az anon szerepkörnek. Futtasd: supabase/parameter_info_schema.sql (RLS rész).'
        );
        return;
      }
      applyParameterInfoMegnevezesFromRows(data);
      for (let g = 0; g < data.length; g++) {
        const gRow = data[g];
        const gk = pickParameterInfoRowKey(gRow);
        const gLab = pickParameterInfoMegnevezes(gRow);
        if (!gk || !gLab) continue;
        const gkn = normalizeParameterInfoTableKey(gk);
        if (gkn === 'geo_important_a') geoImportantPlaceTitle.a = gLab;
        if (gkn === 'geo_important_b') geoImportantPlaceTitle.b = gLab;
      }
      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const k = pickParameterInfoRowKey(row);
        const text = buildParameterInfoTooltipFromRow(row);
        const kn = normalizeParameterInfoTableKey(k);
        if (!kn || text.trim() === '') continue;
        parameterInfoByKey[kn] = text;
      }
    } catch (e) {
      console.warn('parameter_info fetch', e);
    }
  }

  function aliasParameterInfoTooltipsToIndexColumns() {
    if (!indexParamKeys || indexParamKeys.length === 0) return;
    for (let i = 0; i < indexParamKeys.length; i++) {
      const kk = indexParamKeys[i];
      const ent = getUiParamEntryForDbKey(kk);
      if (!ent || !ent.id) continue;
      const idn = normalizeParameterInfoTableKey(ent.id);
      const coln = normalizeParameterInfoTableKey(kk);
      const t = parameterInfoByKey[idn];
      if (t == null || String(t).trim() === '' || !coln || coln === idn) continue;
      parameterInfoByKey[coln] = t;
    }
  }

  function getParameterInfoPlaceholderText(infoKey) {
    const tryKeys = [];
    if (infoKey) {
      const n0 = normalizeParameterInfoTableKey(infoKey);
      if (n0) tryKeys.push(n0);
    }
    const ent = getUiParamEntryForDbKey(infoKey);
    if (ent && ent.id) {
      const idn = normalizeParameterInfoTableKey(ent.id);
      if (idn && tryKeys.indexOf(idn) === -1) tryKeys.push(idn);
    }
    for (let i = 0; i < tryKeys.length; i++) {
      const t = parameterInfoByKey[tryKeys[i]];
      if (t != null && String(t).trim() !== '') return String(t);
    }
    return (
      'Ehhez a mutatóhoz még nincs leírás a parameter_info táblában. Kulcs: ' +
      infoKey
    );
  }

  function htmlForParameterInfoPlainText(plain) {
    const lines = String(plain || '').split('\n');
    const parts = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (/^https?:\/\/\S+$/i.test(trimmed)) {
        const safe = escapeHtml(trimmed);
        parts.push(
          '<a href="' + safe + '" target="_blank" rel="noopener noreferrer">' + safe + '</a>'
        );
      } else {
        parts.push(escapeHtml(line));
      }
    }
    return parts.join('<br>');
  }

  function fillParamInfoTooltipHtml(tip) {
    if (!tip) return;
    const key = tip.getAttribute('data-parameter-info-key');
    const plain = key ? getParameterInfoPlaceholderText(key) : '';
    tip.innerHTML = htmlForParameterInfoPlainText(plain);
  }

  function refreshParameterInfoTooltipTexts() {
    document.querySelectorAll('.param-info-tooltip[data-parameter-info-key]').forEach(function (tip) {
      fillParamInfoTooltipHtml(tip);
    });
  }

  function bindParamInfoWraps(scopeEl) {
    const root = scopeEl || document;
    root.querySelectorAll('.param-info-wrap:not([data-tooltip-bound="1"])').forEach(function (wrap) {
      wrap.setAttribute('data-tooltip-bound', '1');
      const btn = wrap.querySelector('.param-info-btn');
      if (btn) btn.setAttribute('aria-expanded', 'false');

      wrap.addEventListener('mouseenter', function () {
        showParamTooltipForWrap(wrap);
      });
      wrap.addEventListener('mouseleave', function (e) {
        if (isParamInfoTooltipPinned(wrap)) return;
        const rel = e.relatedTarget;
        const tip = getParamInfoTipForWrap(wrap);
        if (tip && rel && (tip === rel || tip.contains(rel))) return;
        hideParamTooltipForWrap(wrap);
      });
      wrap.addEventListener('focusin', function () {
        showParamTooltipForWrap(wrap);
      });
      wrap.addEventListener('focusout', function () {
        window.setTimeout(function () {
          if (isParamInfoTooltipPinned(wrap)) return;
          const tip = getParamInfoTipForWrap(wrap);
          const ae = document.activeElement;
          if (wrap.contains(ae) || (tip && tip.contains(ae))) return;
          if (!wrap.matches(':focus-within')) hideParamTooltipForWrap(wrap);
        }, 0);
      });

      if (btn) {
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          if (isParamInfoTooltipPinned(wrap)) {
            setParamInfoTooltipPinned(wrap, false);
            hideParamTooltipForWrap(wrap);
          } else {
            setParamInfoTooltipPinned(wrap, true);
            showParamTooltipForWrap(wrap);
          }
        });
      }

      const tip0 = wrap.querySelector('.param-info-tooltip');
      if (tip0) bindParamInfoTipBridgeEvents(wrap, tip0);
    });
  }

  function infoDbKeyForGeoSlot(slot) {
    return slot === 'a' ? 'geo_important_a' : 'geo_important_b';
  }

  function createParameterInfoWrapForKey(infoKey) {
    paramCategoryUid++;
    const tipId = 'param-info-tip-' + paramCategoryUid;
    const wrap = document.createElement('div');
    wrap.className = 'param-info-wrap param-info-wrap--head';
    wrap.setAttribute('data-param-info-tip-id', tipId);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'param-info-btn param-info-btn--head';
    btn.setAttribute('aria-label', 'További információ a mutatóról');
    btn.setAttribute('aria-describedby', tipId);
    btn.textContent = 'i';
    const tip = document.createElement('div');
    tip.id = tipId;
    tip.className = 'param-info-tooltip';
    tip.setAttribute('role', 'tooltip');
    tip.setAttribute('data-parameter-info-key', infoKey);
    fillParamInfoTooltipHtml(tip);
    wrap.appendChild(btn);
    wrap.appendChild(tip);
    return wrap;
  }

  function rebuildCityIndex() {
    budapestDistrictRowsCache = null;
    cityByNormName.clear();
    cityHomonymsByAscii.clear();
    for (let i = 0; i < citiesData.length; i++) {
      registerCityLookupKeys(citiesData[i]);
    }
  }

  function findCityByTypedQuery(raw) {
    const rawStr = preprocessSettlementQuery(String(raw || ''));
    const strictQ = normalizeSettlementNameStrict(rawStr);
    const q = normalizeSettlementName(rawStr);
    if (!strictQ.length && !q.length) {
      return { ok: false, message: 'Írj be egy településnevet.' };
    }

    if (q === 'budapest' || q === 'bp') {
      return {
        ok: false,
        message:
          'Budapest kerületei külön sorok — írd be pontosan „Budapest” vagy „bp”, majd válassz a listából, vagy adj meg kerületet (pl. „1. kerület”, „első kerület”, „Budapest 11”).',
      };
    }

    if (strictQ) {
      const exactStrict = cityByNormName.get(strictQ);
      if (exactStrict) return { ok: true, city: exactStrict };
    }
    if (q) {
      const hom = cityHomonymsByAscii.get(q);
      if (hom && hom.length === 1) return { ok: true, city: hom[0] };
      if (hom && hom.length > 1) {
        const byAccent = resolveCityHomonym(hom, rawStr, NaN, NaN);
        if (byAccent) return { ok: true, city: byAccent };
        const names = hom
          .slice(0, 6)
          .map(function (c) {
            return formatCityWithCounty(c);
          })
          .join(', ');
        return {
          ok: false,
          message:
            'Több hasonló nevű település — pontosíts (ékezet!), vagy válassz a listából: ' +
            names,
        };
      }
    }

    let nByRomanOrDigit = NaN;
    if (/^\d+$/.test(q)) {
      const d = parseInt(q, 10);
      if (d >= 1 && d <= 23) nByRomanOrDigit = d;
    }
    if (!Number.isFinite(nByRomanOrDigit)) {
      const r = romanToInt(q);
      if (r >= 1 && r <= 23) nByRomanOrDigit = r;
    }
    if (Number.isFinite(nByRomanOrDigit)) {
      let found = null;
      let nFound = 0;
      for (let i = 0; i < citiesData.length; i++) {
        const c = citiesData[i];
        if (!isBudapestDistrictRow(c)) continue;
        if (districtNumberFromSettlementName(cityName(c)) === nByRomanOrDigit) {
          nFound++;
          found = c;
        }
      }
      if (nFound === 1) return { ok: true, city: found };
    }

    const matches = [];
    for (let i = 0; i < citiesData.length; i++) {
      const c = citiesData[i];
      const n = normalizeSettlementName(String(cityName(c) || ''));
      if (!n.length) continue;
      if (n.indexOf(q) === 0) {
        matches.push({ c: c, w: 0 });
      } else if (n.indexOf(q) !== -1) {
        matches.push({ c: c, w: 1 });
      }
    }

    if (matches.length === 0) {
      return { ok: false, message: 'Nincs ilyen település az adatbázisban.' };
    }

    matches.sort(function (a, b) {
      if (a.w !== b.w) return a.w - b.w;
      return String(cityName(a.c)).length - String(cityName(b.c)).length;
    });

    const starts = matches.filter(function (m) {
      return m.w === 0;
    });
    if (starts.length === 1) return { ok: true, city: starts[0].c };
    if (starts.length > 1) {
      const names = starts
        .slice(0, 5)
        .map(function (m) {
          return cityName(m.c);
        })
        .join(', ');
      return {
        ok: false,
        message: 'Több találat — pontosíts vagy válassz a listából: ' + names,
      };
    }

    const contains = matches.filter(function (m) {
      return m.w === 1;
    });
    if (contains.length === 1) return { ok: true, city: contains[0].c };
    const names2 = contains
      .slice(0, 5)
      .map(function (m) {
        return cityName(m.c);
      })
      .join(', ');
    return {
      ok: false,
      message: 'Több találat — pontosíts: ' + names2,
    };
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
        const bb = geometryBBox(geom);
        const centerLat = bb && bb.length === 4 ? (bb[1] + bb[3]) / 2 : NaN;
        const centerLng = bb && bb.length === 4 ? (bb[0] + bb[2]) / 2 : NaN;
        list.push({
          name: name,
          geometry: geom,
          bbox: bb,
          centerLat: centerLat,
          centerLng: centerLng,
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

  function removeGeoSlotMarker(slot) {
    const pair = geoMarkerBySlot[slot];
    if (!pair) return;
    try {
      if (pair.pin) pair.pin.remove();
      if (pair.label) pair.label.remove();
    } catch (e) {
      console.warn('Geo marker remove:', e);
    }
    geoMarkerBySlot[slot] = null;
  }

  function setGeoSlotMarker(slot, lng, lat, settlementName) {
    removeGeoSlotMarker(slot);
    if (!map || !Number.isFinite(lng) || !Number.isFinite(lat)) return;
    const pinMarker = new maplibregl.Marker({ color: '#0a0a0a', scale: 1 })
      .setLngLat([lng, lat])
      .addTo(map);
    const labelMarker = new maplibregl.Marker({
      element: buildImportantPlaceLabelEl(settlementName),
      anchor: 'bottom',
      offset: [0, -62],
    })
      .setLngLat([lng, lat])
      .addTo(map);
    geoMarkerBySlot[slot] = { pin: pinMarker, label: labelMarker };
  }

  function updatePickButtonActive() {
    if (elements.pickGeoABtn) {
      elements.pickGeoABtn.classList.toggle('is-active', pickMode === 'geoA');
      elements.pickGeoABtn.setAttribute('aria-pressed', pickMode === 'geoA' ? 'true' : 'false');
    }
    if (elements.pickGeoBBtn) {
      elements.pickGeoBBtn.classList.toggle('is-active', pickMode === 'geoB');
      elements.pickGeoBBtn.setAttribute('aria-pressed', pickMode === 'geoB' ? 'true' : 'false');
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
    const line = elements.geoWarnLine;

    if (!settlementName) {
      if (line) {
        line.hidden = false;
        line.classList.add('ref-line--warn');
        line.textContent =
          'Nem sikerült beazonosítani a települést. Kattints egy magyar település közigazgatási határán belülre.';
      }
      return;
    }

    const city = resolveCityFromMapPick(settlementName, lng, lat);
    if (!city) {
      if (line) {
        line.hidden = false;
        line.classList.add('ref-line--warn');
        line.textContent =
          'A térképen: ' + settlementName + ' — ez a település nincs az all_parameters táblában.';
      }
      return;
    }

    if (pickMode === 'geoA') {
      if (line) {
        line.hidden = true;
        line.classList.remove('ref-line--warn');
        line.textContent = '';
      }
      applyGeoSlotFromCity('a', city, { lng: lng, lat: lat });
    } else if (pickMode === 'geoB') {
      if (line) {
        line.hidden = true;
        line.classList.remove('ref-line--warn');
        line.textContent = '';
      }
      applyGeoSlotFromCity('b', city, { lng: lng, lat: lat });
    }
    endPick();
  }

  async function startPick(mode) {
    if (mode !== 'geoA' && mode !== 'geoB') return;
    const target = mode;
    if (pickMode === target) {
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
      const errLine = elements.geoWarnLine;
      if (errLine) {
        errLine.hidden = false;
        errLine.classList.add('ref-line--warn');
        errLine.textContent =
          'A település-határok fájlja nem töltődött be (data/…bundle.js). Frissíts, vagy nyisd meg lokális szerverről (pl. python3 -m http.server).';
      }
      return;
    }

    if (citiesData.length === 0) {
      endPick();
      if (elements.resultBox)
        elements.resultBox.textContent = 'Előbb töltsd be az all_parameters adatokat.';
      return;
    }

    pickMode = target;
    if (elements.mapPickingBanner && elements.mapPickingBannerText) {
      elements.mapPickingBanner.hidden = false;
      const bannerMsg = {
        geoA: 'Koppints a térképre az 1. kör középpontjához (település határán belül).',
        geoB: 'Koppints a térképre a 2. kör középpontjához (település határán belül).',
      };
      elements.mapPickingBannerText.textContent = bannerMsg[target];
    }
    updatePickButtonActive();

    mapClickHandler = function (ev) {
      onMapPickClick(ev);
    };
    map.on('click', mapClickHandler);
    if (map) map.resize();
  }

  function computeMaxPossibleDiff(targets) {
    let s = 0;
    for (let i = 0; i < indexParamKeys.length; i++) {
      const k = indexParamKeys[i];
      const pack = targets[k];
      if (!pack || pack.value == null) continue;
      const r = sliderRanges[k];
      if (!r) continue;
      const w =
        pack.weight != null && Number.isFinite(pack.weight)
          ? Math.max(0, Math.min(1, pack.weight))
          : 1;
      s += (r.max - r.min) * w;
    }
    return s > 0 ? s : 1;
  }

  /**
   * Összegzi a w·|user − city| súlyozott eltéréseket minden _index mezőre (ahol mindkét érték szám).
   */
  function findBestMatch(targets) {
    if (!citiesData.length || indexParamKeys.length === 0) return null;

    let best = null;
    let minSum = Infinity;

    for (let i = 0; i < citiesData.length; i++) {
      const city = citiesData[i];
      if (!passesGeoFilter(city)) continue;
      let sum = 0;
      let used = 0;
      for (let j = 0; j < indexParamKeys.length; j++) {
        const key = indexParamKeys[j];
        const pack = targets[key];
        if (!pack || pack.value == null) continue;
        const want = pack.value;
        const w =
          pack.weight != null && Number.isFinite(pack.weight)
            ? Math.max(0, Math.min(1, pack.weight))
            : 1;
        const got = parseNumeric(city[key]);
        if (got == null) continue;
        sum += Math.abs(want - got) * w;
        used++;
      }
      if (used === 0) continue;
      if (sum < minSum) {
        minSum = sum;
        best = city;
      }
    }

    if (!best) return null;
    return { city: best, finalScore: minSum };
  }

  function diffToMatchPercent(finalScore, maxPossible) {
    const percent = 100 - (finalScore / maxPossible) * 100;
    return Math.round(Math.max(0, Math.min(100, percent)));
  }

  // ===========================================================================
  // Település-infó popup (térképre kattintáskor, heatmapen)
  // ===========================================================================
  /** @type {maplibregl.Popup | null} */
  let cityInfoPopup = null;
  /** @type {string | null} A kijelölt település poligon feature id (hse-choropleth promoteId). */
  let cityInfoSelectedFeatureId = null;

  function clearCityInfoSelection() {
    if (!map || !cityInfoSelectedFeatureId) return;
    try {
      map.removeFeatureState(
        { source: 'hse-choropleth', id: cityInfoSelectedFeatureId },
        'selected'
      );
    } catch (_) {}
    cityInfoSelectedFeatureId = null;
  }

  function setCityInfoSelection(featureId) {
    if (!map || !map.getSource('hse-choropleth') || !featureId) return;
    clearCityInfoSelection();
    try {
      map.setFeatureState(
        { source: 'hse-choropleth', id: featureId },
        { selected: true }
      );
      cityInfoSelectedFeatureId = featureId;
    } catch (_) {}
  }

  function isFeatureOnHeatmap(featureId) {
    return !!(
      heatmapEnabled &&
      featureId &&
      lastHeatmapPaintedIds &&
      lastHeatmapPaintedIds.has(featureId)
    );
  }

  /**
   * Adott index oszlophoz visszaadja a megjelenítéshez használt companion oszlopot
   * és formátum-függvényt. Ugyanazt a logikát követi, mint a slider-buborékok.
   * @param {string} key
   * @returns {{ companionKey?: string, format?: function, parse?: function,
   *             pair?: { a: string, b: string, formatPair: function, parse?: function } } | null}
   */
  function findCompanionInfoForIndexKey(key) {
    // Iskola: a DB oszlop SCHOOL_PROXIMITY_INDEX_* — nem illeszkedik a ui param id prefixre.
    const schoolDefs = SCHOOL_PRIMARY_VARIANTS.concat(SCHOOL_GYMNASIUM_VARIANTS);
    for (let si = 0; si < schoolDefs.length; si++) {
      if (schoolDefs[si].indexKey === key) {
        return { companionKey: schoolDefs[si].companionKey, format: formatKmForUi };
      }
    }

    const ent = getUiParamEntryForDbKey(key);
    if (!ent) return null;
    const id = ent.id;
    if (id === 'forest_index') {
      return { companionKey: forestCompanionRatioColumnKey(key), format: formatForestRatioForUi };
    }
    if (id === 'water_index') {
      return { companionKey: waterCompanionRatioColumnKey(key), format: formatForestRatioForUi };
    }
    if (id === 'terrain_index') {
      return { companionKey: terrainCompanionSlopeColumnKey(key), format: formatSlopeDegreesForUi };
    }
    if (id === 'budapest_car_train_index') {
      return { companionKey: budapestCarTrainCompanionTotalMinKey(key), format: formatMinutesForUi };
    }
    if (id === 'internet_index') {
      return { companionKey: internetCompanionMbpsKey(key), format: formatMbpsForUi };
    }
    if (id === 'transport_frequency_index') {
      return { companionKey: transportFrequencyCompanionNapiJaratokKey(key), format: formatNapiJaratokForUi };
    }
    if (id === 'district_seat_access_index') {
      return { companionKey: districtSeatCompanionPercKey(key), format: formatMinutesForUi };
    }
    if (id === 'budapest_access_index') {
      return { companionKey: budapestAccessCompanionPercKey(key), format: formatMinutesForUi };
    }
    if (id === 'groceries_index') {
      return {
        pair: {
          a: groceriesCompanionKmKey(key),
          b: groceriesCompanionBrandsKey(key),
          formatPair: formatGroceriesPairForUi,
        },
      };
    }
    if (id === 'sport_index') {
      return {
        pair: {
          a: sportCompanionSportagDbKey(key),
          b: sportCompanionLetesitmenyDbKey(key),
          formatPair: formatSportPairForUi,
        },
      };
    }
    if (id === 'gastro_index') {
      return { companionKey: gastroCompanionGasztroDbKey(key), format: formatVendeglatohelyForUi };
    }
    if (id === 'senior_index') {
      return { companionKey: seniorCompanionArany65Key(key), format: formatForestRatioForUi };
    }
    if (id === 'diploma_index') {
      return { companionKey: diplomaCompanionAranyaKey(key), format: formatForestRatioForUi };
    }
    if (id === 'real_estate_price_grow_5yrs_index' || id === 'real_estate_price_avg5mth_index') {
      const isGrow = id === 'real_estate_price_grow_5yrs_index';
      const defs = isGrow ? INGATLAN_GROW_VARIANTS : INGATLAN_AVG_VARIANTS;
      const fmt = isGrow ? formatIngatlanPctForUi : formatHufForUi;
      const parseFn = isGrow ? parseNumeric : parseHufAmount;
      for (let i = 0; i < defs.length; i++) {
        if (defs[i].indexMatch.test(key)) {
          const companionKey = ingatlanCompanionColumnKey(key, defs[i].companionSuffix);
          return { companionKey: companionKey, format: fmt, parse: parseFn };
        }
      }
      return null;
    }
    return null;
  }

  /**
   * A panelban szereplő paraméterekhez visszaadja a `city` adott értékeit
   * a hozzá tartozó címkével és formátummal.
   * Variant kártyák (ingatlan, iskola) esetén az aktívan kiválasztott variant kerül be.
   * @param {object} city
   * @returns {Array<{ label: string, value: string }>}
   */
  function buildCityInfoRows(city) {
    const rows = [];
    if (!city || !elements.paramCategoriesHost) return rows;
    const sliders = elements.paramCategoriesHost.querySelectorAll(
      'input[type="range"][data-param-key]'
    );
    for (let i = 0; i < sliders.length; i++) {
      const sl = sliders[i];
      const key = sl.getAttribute('data-param-key');
      if (!key) continue;
      const card = sl.closest('.param-item');
      if (!card || card.getAttribute('data-param-active') !== '1') continue;
      const titleEl = card ? card.querySelector('.param-item__title') : null;
      const label = titleEl && titleEl.textContent
        ? titleEl.textContent.trim()
        : paramLabelForDbKey(key);

      let valueText = '–';
      const info = findCompanionInfoForIndexKey(key);
      if (info && info.pair) {
        const parseFn = info.pair.parse || parseNumeric;
        const a = parseFn(city[info.pair.a]);
        const b = parseFn(city[info.pair.b]);
        valueText = info.pair.formatPair(a, b);
      } else if (info && info.companionKey && info.format) {
        const parseFn = info.parse || parseNumeric;
        const v = parseFn(city[info.companionKey]);
        valueText = info.format(v);
      } else {
        const v = parseNumeric(city[key]);
        valueText = v == null ? '–' : String(Math.round(v));
      }

      rows.push({ label: label, value: valueText });
    }
    return rows;
  }

  function buildCityInfoCardEl(city) {
    const wrap = document.createElement('div');
    wrap.className = 'city-info';

    const title = document.createElement('div');
    title.className = 'city-info__title';
    title.textContent = cityName(city);
    wrap.appendChild(title);

    const listHost = document.createElement('div');
    appendCityInfoListToContainer(listHost, city);
    wrap.appendChild(listHost);
    return wrap;
  }

  function appendCityInfoListToContainer(container, city) {
    const rows = buildCityInfoRows(city);
    if (rows.length === 0) {
      const p = document.createElement('p');
      p.className = 'city-info__empty';
      p.textContent =
        'Nincs bekapcsolt paraméter. Kapcsolj be legalább egyet a bal oldali panelen.';
      container.appendChild(p);
      return;
    }
    const list = document.createElement('div');
    list.className = 'city-info__list';
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const row = document.createElement('div');
      row.className = 'city-info__row';
      const lab = document.createElement('span');
      lab.className = 'city-info__label';
      lab.textContent = r.label;
      const val = document.createElement('span');
      val.className = 'city-info__val';
      val.textContent = r.value;
      row.appendChild(lab);
      row.appendChild(val);
      list.appendChild(row);
    }
    container.appendChild(list);
  }

  function onCityInfoPopupClose() {
    clearCityInfoSelection();
    cityInfoPopup = null;
  }

  function closeCityInfoPopup() {
    clearCityInfoSelection();
    if (!cityInfoPopup) return;
    const popup = cityInfoPopup;
    cityInfoPopup = null;
    try {
      popup.remove();
    } catch (_) {}
  }

  function openCityInfoPopup(city, lng, lat, featureId) {
    if (!map || !city || !featureId) return;
    closeCityInfoPopup();
    setCityInfoSelection(featureId);
    const el = buildCityInfoCardEl(city);
    cityInfoPopup = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: false,
      closeOnMove: false,
      maxWidth: '380px',
      offset: 10,
      className: 'city-info-popup',
    })
      .setLngLat([lng, lat])
      .setDOMContent(el)
      .addTo(map);
    cityInfoPopup.on('close', onCityInfoPopupClose);
  }

  async function onCityInfoMapClick(e) {
    if (pickMode) return;
    if (!heatmapEnabled) {
      closeCityInfoPopup();
      return;
    }
    const lng = e.lngLat.lng;
    const lat = e.lngLat.lat;
    try {
      await ensureGeoIndexed();
      await ensureHeatmapLayers();
    } catch (_) {
      return;
    }
    const name = findSettlementNameAt(lng, lat);
    if (!name) {
      closeCityInfoPopup();
      return;
    }
    const featureId = geoPolygonFeatureId(name);
    if (!isFeatureOnHeatmap(featureId)) {
      closeCityInfoPopup();
      return;
    }
    const city = resolveCityFromMapPick(name, lng, lat);
    if (!city) {
      closeCityInfoPopup();
      return;
    }
    openCityInfoPopup(city, lng, lat, featureId);
  }

  // ===========================================================================
  // Találat-hőtérkép (choropleth a települési poligonokon, plasma színskála)
  // ===========================================================================
  /** @type {boolean} A felhasználó által bekapcsolt-e a hőtérkép réteg. */
  let heatmapEnabled = false;
  /** @type {boolean} A MapLibre source + layer-ek hozzá vannak-e adva már. */
  let heatmapLayersReady = false;
  /** @type {Promise<void> | null} Az ensureHeatmapLayers folyamatban van-e. */
  let heatmapLayersPromise = null;
  /** @type {Set<string> | null} Az utoljára festett feature ID-k (a régi state-ek törléséhez). */
  let lastHeatmapPaintedIds = null;

  /** plasma paletta (rossz illeszkedés → jó illeszkedés). 0 = sötétlila, 100 = sárga. */
  function buildPlasmaColorExpr() {
    return [
      'interpolate',
      ['linear'],
      ['coalesce', ['feature-state', 'matchPercent'], -1],
      -1, 'rgba(0,0,0,0)',
      0, '#0d0887',
      12.5, '#5c01a6',
      25, '#9c179e',
      37.5, '#cc4778',
      50, '#ed7953',
      62.5, '#f89441',
      75, '#fdc328',
      100, '#f0f921',
    ];
  }

  async function ensureHeatmapLayers() {
    if (heatmapLayersReady) return;
    if (heatmapLayersPromise) {
      try { await heatmapLayersPromise; } catch (_) {}
      return;
    }
    if (!map) return;
    heatmapLayersPromise = (async function () {
      if (!map.isStyleLoaded()) {
        await new Promise(function (res) {
          map.once('load', res);
        });
      }
      await ensureGeoIndexed();
      if (!geoIndexed || geoIndexed.length === 0) {
        throw new Error('A települési poligonok nincsenek betöltve.');
      }

      const features = [];
      for (let i = 0; i < geoIndexed.length; i++) {
        const it = geoIndexed[i];
        const id = geoPolygonFeatureId(it.name);
        if (!id) continue;
        features.push({
          type: 'Feature',
          properties: { name: it.name, id: id },
          geometry: it.geometry,
        });
      }
      const fc = { type: 'FeatureCollection', features: features };
      if (map.getSource('hse-choropleth')) {
        map.getSource('hse-choropleth').setData(fc);
      } else {
        map.addSource('hse-choropleth', {
          type: 'geojson',
          data: fc,
          promoteId: 'id',
        });
      }

      const colorExpr = buildPlasmaColorExpr();
      const hasPercentExpr = ['!=', ['coalesce', ['feature-state', 'matchPercent'], -1], -1];
      const beforeId = map.getLayer('important-place-a-fill')
        ? 'important-place-a-fill'
        : (map.getLayer('important-place-b-fill') ? 'important-place-b-fill' : undefined);

      if (!map.getLayer('hse-choropleth-fill')) {
        map.addLayer({
          id: 'hse-choropleth-fill',
          type: 'fill',
          source: 'hse-choropleth',
          layout: { visibility: heatmapEnabled ? 'visible' : 'none' },
          paint: {
            'fill-color': colorExpr,
            'fill-opacity': ['case', hasPercentExpr, 0.5, 0],
            'fill-outline-color': 'rgba(0,0,0,0)',
          },
        }, beforeId);
      }

      // Lágy szegély: ugyanaz a szín, kis blur — a települési határvonalak optikai elmosása.
      if (!map.getLayer('hse-choropleth-blur')) {
        map.addLayer({
          id: 'hse-choropleth-blur',
          type: 'line',
          source: 'hse-choropleth',
          layout: { visibility: heatmapEnabled ? 'visible' : 'none' },
          paint: {
            'line-color': colorExpr,
            'line-width': 2,
            'line-blur': 3,
            'line-opacity': ['case', hasPercentExpr, 0.45, 0],
          },
        }, beforeId);
      }

      // Kijelölt település: plazma színű szegély (matchPercent), finoman hangsúlyozva.
      if (!map.getLayer('hse-choropleth-selection')) {
        map.addLayer({
          id: 'hse-choropleth-selection',
          type: 'line',
          source: 'hse-choropleth',
          layout: { visibility: heatmapEnabled ? 'visible' : 'none' },
          paint: {
            'line-color': colorExpr,
            'line-width': 3,
            'line-blur': 0,
            'line-opacity': [
              'case',
              ['==', ['coalesce', ['feature-state', 'selected'], false], true],
              0.85,
              0,
            ],
          },
        }, beforeId);
      } else if (map.getLayer('hse-choropleth-selection')) {
        map.setPaintProperty('hse-choropleth-selection', 'line-width', 3);
        map.setPaintProperty('hse-choropleth-selection', 'line-opacity', [
          'case',
          ['==', ['coalesce', ['feature-state', 'selected'], false], true],
          0.85,
          0,
        ]);
      }

      heatmapLayersReady = true;
    })().catch(function (err) {
      console.warn('Hőtérkép réteg betöltése:', err);
    }).then(function () {
      heatmapLayersPromise = null;
    });
    await heatmapLayersPromise;
  }

  /**
   * Frissíti a település-poligonok matchPercent feature-state-jét a jelenlegi
   * csúszka-állás alapján. Logika:
   *   1. Iterálunk a poligonokon. Ha a poligon centroidja a geo-szűrőn (sugár-kör)
   *      kívülre esik, kihagyjuk — így a Supabase city.lat/lng hibái nem rángatnak
   *      át poligonokat más sugár-körbe.
   *   2. A poligon nevéből visszakeresünk egy Supabase-város-rekordot a meglévő
   *      alias-os cityByNormName lookup-pal.
   *   3. Súlyozott |want − got| összeget számolunk.
   *   4. A teljes (sugáron belüli, adattal rendelkező) halmaz min/max sum-jára
   *      feszítjük ki a plazma skálát: legjobb=100/sárga, legrosszabb=0/sötétlila.
   * @param {Record<string, { value: number, weight: number }>} targets
   */
  function updateHeatmapFromTargets(targets) {
    if (!heatmapLayersReady || !map.getSource('hse-choropleth')) return;
    if (!citiesData.length || indexParamKeys.length === 0) return;
    if (!geoIndexed || geoIndexed.length === 0) return;

    const clearOldStates = function () {
      if (lastHeatmapPaintedIds) {
        lastHeatmapPaintedIds.forEach(function (id) {
          try {
            map.removeFeatureState(
              { source: 'hse-choropleth', id: id },
              'matchPercent'
            );
          } catch (_) {}
        });
      }
    };

    // 1) poligon-iteráció: szűrés a poligon centroidjára + sum számolás
    const featureSums = [];
    for (let i = 0; i < geoIndexed.length; i++) {
      const item = geoIndexed[i];
      const featureId = geoPolygonFeatureId(item.name);
      if (!featureId) continue;
      if (!passesGeoFilterByPoint(item.centerLat, item.centerLng)) continue;
      const city = lookupCityRowFromGeoPickLabel(
        item.name,
        item.centerLng,
        item.centerLat
      );
      if (!city) continue;

      let sum = 0;
      let used = 0;
      for (let j = 0; j < indexParamKeys.length; j++) {
        const key = indexParamKeys[j];
        const pack = targets[key];
        if (!pack || pack.value == null) continue;
        const w =
          pack.weight != null && Number.isFinite(pack.weight)
            ? Math.max(0, Math.min(1, pack.weight))
            : 1;
        const got = parseNumeric(city[key]);
        if (got == null) continue;
        sum += Math.abs(pack.value - got) * w;
        used++;
      }
      if (used === 0) continue;
      featureSums.push({ id: featureId, sum: sum });
    }

    if (featureSums.length === 0) {
      clearOldStates();
      lastHeatmapPaintedIds = new Set();
      if (cityInfoSelectedFeatureId) closeCityInfoPopup();
      return;
    }

    // 2) per-search min/max → plazma a tényleges spektrumra feszítve
    let minSum = Infinity;
    let maxSum = -Infinity;
    for (let i = 0; i < featureSums.length; i++) {
      const s = featureSums[i].sum;
      if (s < minSum) minSum = s;
      if (s > maxSum) maxSum = s;
    }
    const range = maxSum - minSum;

    // 3) régi state-ek tisztítása + új state-ek ráfestése
    clearOldStates();
    const nowPainted = new Set();
    for (let i = 0; i < featureSums.length; i++) {
      const fs = featureSums[i];
      let pct = range > 0 ? 100 * (1 - (fs.sum - minSum) / range) : 100;
      pct = Math.round(Math.max(0, Math.min(100, pct)));
      map.setFeatureState(
        { source: 'hse-choropleth', id: fs.id },
        { matchPercent: pct }
      );
      nowPainted.add(fs.id);
    }
    lastHeatmapPaintedIds = nowPainted;

    if (
      cityInfoSelectedFeatureId &&
      !lastHeatmapPaintedIds.has(cityInfoSelectedFeatureId)
    ) {
      closeCityInfoPopup();
    } else if (cityInfoSelectedFeatureId) {
      setCityInfoSelection(cityInfoSelectedFeatureId);
    }
  }

  function clearHeatmapFeatureStates() {
    if (!map || !map.getSource('hse-choropleth') || !lastHeatmapPaintedIds) return;
    lastHeatmapPaintedIds.forEach(function (id) {
      try {
        map.removeFeatureState(
          { source: 'hse-choropleth', id: id },
          'matchPercent'
        );
      } catch (_) {}
    });
    lastHeatmapPaintedIds = null;
  }

  function setHeatmapLayerVisibility(visible) {
    if (!map) return;
    ['hse-choropleth-fill', 'hse-choropleth-blur', 'hse-choropleth-selection'].forEach(
      function (id) {
        if (map.getLayer(id)) {
          map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
        }
      }
    );
  }

  function syncHeatmapToggleUi() {
    const btn = document.getElementById('heatmap-toggle-btn');
    if (btn) {
      btn.classList.toggle('map-corner-toggle--active', heatmapEnabled);
      btn.setAttribute('aria-pressed', heatmapEnabled ? 'true' : 'false');
      btn.title = heatmapEnabled
        ? 'Találat-hőtérkép kikapcsolása'
        : 'Találat-hőtérkép bekapcsolása';
    }
    const legend = document.getElementById('heatmap-legend');
    if (legend) {
      legend.classList.toggle('heatmap-legend--visible', heatmapEnabled);
      legend.setAttribute('aria-hidden', heatmapEnabled ? 'false' : 'true');
    }
  }

  async function setHeatmapEnabled(on) {
    heatmapEnabled = !!on;
    syncHeatmapToggleUi();
    if (heatmapEnabled) {
      try {
        await ensureHeatmapLayers();
      } catch (e) {
        console.warn('Hőtérkép bekapcsolás:', e);
      }
      setHeatmapLayerVisibility(true);
      if (citiesData.length && indexParamKeys.length) {
        const targets = collectSliderTargets();
        updateHeatmapFromTargets(targets);
      }
    } else {
      setHeatmapLayerVisibility(false);
      closeCityInfoPopup();
    }
  }

  function initHeatmapToggle() {
    const btn = document.getElementById('heatmap-toggle-btn');
    if (!btn) return;
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      setHeatmapEnabled(!heatmapEnabled);
    });
    syncHeatmapToggleUi();
  }

  async function fetchAllParameters() {
    hideFeedbackPanel();
    elements.resultBox.textContent = 'Települések betöltése (all_parameters)…';
    try {
      const pageSize = 1000;
      const all = [];
      let from = 0;
      let fetchError = null;

      for (;;) {
        const { data, error } = await supabase
          .from(SUPABASE_TABLE)
          .select('*')
          .order('settlement_name', { ascending: true })
          .range(from, from + pageSize - 1);

        if (error) {
          fetchError = error;
          break;
        }

        const chunk = Array.isArray(data) ? data : [];
        for (let i = 0; i < chunk.length; i++) {
          all.push(chunk[i]);
        }

        if (chunk.length < pageSize) {
          break;
        }
        from += pageSize;
        if (from > 500000) {
          console.warn('fetchAllParameters: biztonsági határ, megállítva.');
          break;
        }
      }

      if (fetchError) {
        console.error('Supabase error:', fetchError);
        elements.resultBox.textContent =
          'Hiba: ' + (fetchError.message || 'Nem sikerült betöltenival parameters.');
        clearGuidedScrollTimer();
        return;
      }

      citiesData = all;
      if (citiesData.length === 0) {
        indexParamKeys = [];
        sliderRanges = {};
        if (elements.paramCategoriesHost) elements.paramCategoriesHost.innerHTML = '';
        elements.resultBox.textContent =
          'Nincs sor az all_parameters táblában. Ellenőrizd az RLS-t (SELECT engedélyezése anon számára).';
        guidedParamKeys = [];
        guidedFlowUnlocked = false;
        guidedFlowParamIndex = 0;
        clearGuidedScrollTimer();
        return;
      }

      indexParamKeys = discoverIndexKeys(citiesData[0]);
      indexParamKeys = augmentIndexParamKeysWithSchool(indexParamKeys);
      indexParamKeys = orderIndexKeysForUi(indexParamKeys);
      sliderRanges = {};
      for (let i = 0; i < indexParamKeys.length; i++) {
        const k = indexParamKeys[i];
        sliderRanges[k] = columnMinMax(k, citiesData);
      }

      rebuildCityIndex();
      buildParamSliders();
      updateImportantPlaceCircles();
      syncGuidedFlowFromPersistedGeo();

      elements.resultBox.textContent =
        citiesData.length +
        ' település · ' +
        indexParamKeys.length +
        ' mutató. Állítsd a csúszkákat, majd nyomd meg a „Tökéletes hely keresése” gombot — utána minden csúszka módosításra újra keres.';
    } catch (err) {
      console.error('Fetch error:', err);
      citiesData = [];
      indexParamKeys = [];
      sliderRanges = {};
      rebuildCityIndex();
      if (elements.paramCategoriesHost) elements.paramCategoriesHost.innerHTML = '';
      updateImportantPlaceCircles();
      elements.resultBox.textContent = 'Hiba: nem sikerült csatlakozni az adatbázishoz.';
      guidedParamKeys = [];
      guidedFlowUnlocked = false;
      guidedFlowParamIndex = 0;
      clearGuidedScrollTimer();
    }
  }

  function removeWinningMarker() {
    if (!winningMarker) return;
    try {
      if (winningMarker.pin) winningMarker.pin.remove();
      if (winningMarker.card) winningMarker.card.remove();
    } catch (e) {
      console.warn('Marker remove:', e);
    }
    winningMarker = null;
  }

  function showResult(winningCity, matchPercent, ticketId, meta) {
    const name = cityName(winningCity);
    const percentText = matchPercent != null ? ' – ' + matchPercent + '% egyezés' : '';
    const ticketText = ticketId != null ? ' (#' + ticketId + ')' : '';
    let paramCount = 0;
    if (meta && meta.paramCount != null && Number.isFinite(meta.paramCount)) {
      paramCount = Math.max(0, Math.round(meta.paramCount));
    } else if (meta && meta.targets && typeof meta.targets === 'object') {
      paramCount = Object.keys(meta.targets).length;
    }
    const paramText = paramCount > 0 ? ' · ' + paramCount + ' bekapcsolt paraméter alapján' : '';
    elements.resultBox.textContent = name + percentText + paramText + ticketText;

    if (meta && elements.feedbackPanelInner) {
      renderFeedbackPanel(
        winningCity,
        meta.targets || {},
        meta.finalScore != null ? meta.finalScore : 0,
        meta.maxPossible != null ? meta.maxPossible : 1,
        matchPercent
      );
    }

    const lng = cityLng(winningCity);
    const lat = cityLat(winningCity);

    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;

    removeWinningMarker();

    const shouldFlyMap = meta && meta.flyMapToResult === true;
    if (map && shouldFlyMap) {
      map.flyTo({
        center: [lng, lat],
        zoom: RESULT_ZOOM,
        duration: 1500,
        essential: true,
      });
    }

    const pinMarker = new maplibregl.Marker({ color: '#d81515', scale: 1.35 })
      .setLngLat([lng, lat])
      .addTo(map);
    const cardMarker = new maplibregl.Marker({
      element: buildWinningCardEl(name),
      anchor: 'bottom',
      offset: [0, -58],
    })
      .setLngLat([lng, lat])
      .addTo(map);

    winningMarker = { pin: pinMarker, card: cardMarker };

    if (map) {
      setTimeout(function () {
        map.resize();
      }, 400);
    }
  }

  async function saveSearchResult(winningCity, targets, egyezesPontszam) {
    try {
      const row = {
        telepules_nev: cityName(winningCity),
        lat: cityLat(winningCity),
        lng: cityLng(winningCity),
        erdo_ertek: null,
        kultura_ertek: null,
        egyezes_pontszam: egyezesPontszam != null ? Number(egyezesPontszam) : null,
      };
      const { data, error } = await supabase.from('talalatok').insert(row).select('id').single();

      if (error) {
        console.warn('Találat mentése (talalatok):', error.message || error);
        return null;
      }
      return data?.id ?? null;
    } catch (err) {
      console.warn('Találat mentése:', err);
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

  function closeTicketOverlayOnly() {
    if (!elements.ticketOverlay) return;
    elements.ticketOverlay.setAttribute('hidden', '');
    elements.ticketOverlay.setAttribute('aria-hidden', 'true');
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

  /**
   * @param {{ showTicket?: boolean, persistToDb?: boolean, flyMapToResult?: boolean }} opts
   */
  async function performSearch(opts) {
    const showTicket = !!(opts && opts.showTicket);
    const persistToDb = !!(opts && opts.persistToDb);
    const flyMapToResult = !!(opts && opts.flyMapToResult);
    const layoutAnchor = sidebarLayoutAnchorEl;
    sidebarLayoutAnchorEl = null;
    const scroller = getSidebarScrollEl();

    if (!showTicket) {
      closeTicketOverlayOnly();
    }

    const targets = collectSliderTargets();
    const result = findBestMatch(targets);
    const paramCount = Object.keys(targets).length;

    if (heatmapEnabled) {
      updateHeatmapFromTargets(targets);
    }

    if (result) {
      const maxP = computeMaxPossibleDiff(targets);
      const matchPercent = diffToMatchPercent(result.finalScore, maxP);
      let ticketId = null;
      if (persistToDb) {
        ticketId = await saveSearchResult(result.city, targets, matchPercent);
      }
      let anchorY = NaN;
      if (layoutAnchor && scroller) {
        anchorY = layoutAnchor.getBoundingClientRect().top;
      }
      showResult(result.city, matchPercent, ticketId, {
        targets: targets,
        finalScore: result.finalScore,
        maxPossible: maxP,
        flyMapToResult: flyMapToResult,
        paramCount: paramCount,
      });
      if (showTicket) showTicketOverlay(ticketId);
      if (layoutAnchor && scroller && Number.isFinite(anchorY)) {
        applySidebarScrollAnchorAfterLayout(layoutAnchor, scroller, anchorY);
      }
    } else {
      let anchorY = NaN;
      if (layoutAnchor && scroller) {
        anchorY = layoutAnchor.getBoundingClientRect().top;
      }
      let msg =
        'Nincs találat. Töltsd be az adatokat, vagy ellenőrizd a csúszkákat és a kapcsolatot.';
      if (citiesData.length && indexParamKeys.length) {
        const geoOn = geoSlotReady('a') || geoSlotReady('b');
        if (geoOn && countGeoEligibleCities() === 0) {
          msg =
            'Nincs település, amely minden bekapcsolt fontos hely körön belül esik. Növeld a sugarakat, válassz más központokat, vagy kapcsold ki a szűrő(k)et.';
        }
      }
      elements.resultBox.textContent = msg;
      removeWinningMarker();
      hideFeedbackPanel();
      if (layoutAnchor && scroller && Number.isFinite(anchorY)) {
        applySidebarScrollAnchorAfterLayout(layoutAnchor, scroller, anchorY);
      }
    }
  }

  async function onSearchClick() {
    sliderAutoSearchActive = true;
    const inactiveLabels = getInactiveParamCategoryLabels();
    if (firstMainSearchClickWithPrompt && inactiveLabels.length > 0) {
      openFirstSearchHintModal(inactiveLabels);
      return;
    }
    firstMainSearchClickWithPrompt = false;
    await performSearch({ showTicket: true, persistToDb: true, flyMapToResult: true });
  }

  function scheduleSearchFromSliders() {
    if (!sliderAutoSearchActive) return;
    if (sliderSearchDebounceTimer != null) {
      clearTimeout(sliderSearchDebounceTimer);
    }
    sliderSearchDebounceTimer = setTimeout(function () {
      sliderSearchDebounceTimer = null;
      performSearch({ showTicket: false, persistToDb: false, flyMapToResult: false }).catch(function (e) {
        console.warn('Keresés (csúszka):', e);
      });
    }, SLIDER_SEARCH_DEBOUNCE_MS);
  }

  function placeParamTooltip(wrap) {
    const btn = wrap.querySelector('.param-info-btn');
    const tip = getParamInfoTipForWrap(wrap);
    if (!btn || !tip) return;
    const br = btn.getBoundingClientRect();
    const margin = 8;
    const gap = 6;
    tip.style.position = 'fixed';
    tip.style.right = 'auto';
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    let left = br.right - w;
    if (left < margin) left = margin;
    if (left + w > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - margin - w);
    }
    let top = br.bottom + gap;
    if (top + h > window.innerHeight - margin) {
      top = Math.max(margin, br.top - h - gap);
    }
    const headerEl = document.querySelector('.sidebar-header');
    const headerBottom = headerEl ? headerEl.getBoundingClientRect().bottom + gap : margin;
    if (top < headerBottom) top = headerBottom;
    if (top + h > window.innerHeight - margin) {
      top = Math.max(headerBottom, br.top - h - gap);
    }
    if (top < headerBottom) top = headerBottom;
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  }

  function repositionOpenParamTooltips() {
    document.querySelectorAll('.param-info-wrap').forEach(function (wrap) {
      const tip = getParamInfoTipForWrap(wrap);
      if (tip && tip.classList.contains('param-info-tooltip--visible')) {
        placeParamTooltip(wrap);
      }
    });
  }

  function initParamInfoTooltips() {
    var sidebar = document.querySelector('.sidebar-scroll') || document.querySelector('.sidebar');
    if (sidebar) {
      sidebar.addEventListener('scroll', repositionOpenParamTooltips);
    }
    window.addEventListener('resize', repositionOpenParamTooltips);
    window.addEventListener('scroll', repositionOpenParamTooltips, true);
    document.addEventListener('mousedown', function (e) {
      dismissPinnedParamInfoTooltipsIfOutside(e.target);
    });
  }

  function initLayoutDocking() {
    const sidebarDock = document.getElementById('sidebar-dock');
    const sidebarCloseBtn = document.getElementById('sidebar-collapse-btn');
    const sidebarOpenBtn = document.getElementById('sidebar-expand-btn');
    const feedbackBtn = document.getElementById('feedback-collapse-btn');

    function resizeMapSoon() {
      if (map) {
        setTimeout(function () {
          map.resize();
          syncGeoMarkersFromState();
        }, 280);
      }
    }

    function setSidebarDockCollapsed(collapsed) {
      if (!sidebarDock) return;
      if (collapsed) sidebarDock.classList.add('sidebar-dock--collapsed');
      else sidebarDock.classList.remove('sidebar-dock--collapsed');
      if (sidebarCloseBtn) {
        sidebarCloseBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        sidebarCloseBtn.setAttribute('aria-hidden', collapsed ? 'true' : 'false');
        sidebarCloseBtn.title = collapsed ? 'Bal panel megnyitása' : 'Bal panel elrejtése';
      }
      if (sidebarOpenBtn) {
        sidebarOpenBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        sidebarOpenBtn.setAttribute('aria-hidden', collapsed ? 'false' : 'true');
        sidebarOpenBtn.title = collapsed ? 'Bal panel megnyitása' : 'Bal panel elrejtése';
      }
      resizeMapSoon();
    }

    function toggleSidebarDock() {
      if (!sidebarDock) return;
      const collapsed = !sidebarDock.classList.contains('sidebar-dock--collapsed');
      setSidebarDockCollapsed(collapsed);
    }

    if (sidebarDock && (sidebarCloseBtn || sidebarOpenBtn)) {
      if (sidebarCloseBtn) sidebarCloseBtn.addEventListener('click', toggleSidebarDock);
      if (sidebarOpenBtn) sidebarOpenBtn.addEventListener('click', toggleSidebarDock);
    }

    if (elements.feedbackPanel && feedbackBtn) {
      feedbackBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (elements.feedbackPanel.hasAttribute('hidden')) return;
        const collapsed = elements.feedbackPanel.classList.toggle('feedback-panel--collapsed');
        feedbackBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        feedbackBtn.title = collapsed ? 'Jobb panel megnyitása' : 'Jobb panel elrejtése';
        const g = feedbackBtn.querySelector('.feedback-panel__edge-tab-glyph');
        if (g) g.textContent = collapsed ? '‹' : '›';
        if (collapsed) closeCityInfoPopup();
        resizeMapSoon();
      });
    }
  }

  async function init() {
    initElements();
    initLayoutDocking();
    initHeatmapToggle();
    initFirstSearchHintModal();
    initParamInfoTooltips();
    initMap();
    buildImportantPlacesPanel();
    initImportantPlaceElements();
    bindParamInfoWraps(document.getElementById('sidebar-main'));
    setupGeoAutocomplete('a');
    setupGeoAutocomplete('b');

    elements.searchBtn.addEventListener('click', onSearchClick);

    if (elements.paramCategoriesHost) {
      elements.paramCategoriesHost.addEventListener('input', function (e) {
        const t = e.target;
        if (!t || t.nodeName !== 'INPUT' || t.type !== 'range') return;
        if (!t.getAttribute('data-param-key') && !t.getAttribute('data-param-weight-for')) return;
        scheduleSearchFromSliders();
      });
      elements.paramCategoriesHost.addEventListener('change', function (e) {
        onGuidedParamRangeChange(e);
        const t = e.target;
        if (!t || t.nodeName !== 'INPUT' || t.type !== 'range') return;
        if (!t.getAttribute('data-param-key') && !t.getAttribute('data-param-weight-for')) return;
        scheduleSearchFromSliders();
      });
    }

    if (elements.paramRandomAllBtn) {
      elements.paramRandomAllBtn.addEventListener('click', function () {
        if (elements.paramCategoriesHost) {
          randomizeSlidersInElement(elements.paramCategoriesHost);
        }
      });
    }

    if (elements.paramRestoreBaselineBtn) {
      elements.paramRestoreBaselineBtn.addEventListener('click', function () {
        if (elements.paramCategoriesHost) {
          restoreParamSlidersFromBaseline(elements.paramCategoriesHost);
        }
      });
    }

    if (elements.pickGeoABtn) {
      elements.pickGeoABtn.addEventListener('click', function () {
        startPick('geoA');
      });
    }
    if (elements.pickGeoBBtn) {
      elements.pickGeoBBtn.addEventListener('click', function () {
        startPick('geoB');
      });
    }

    if (elements.geoCityInputA) {
      elements.geoCityInputA.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          applyTypedGeoSlot('a');
        }
      });
    }
    if (elements.geoCityInputB) {
      elements.geoCityInputB.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          applyTypedGeoSlot('b');
        }
      });
    }
    [elements.geoRadiusA, elements.geoRadiusB].forEach(function (el) {
      if (!el) return;
      el.addEventListener('input', function () {
        syncGeoRadiusLabels();
        refreshGeoFilterWarning();
        scheduleSearchFromSliders();
      });
    });

    if (elements.mapPickingCancel) {
      elements.mapPickingCancel.addEventListener('click', function () {
        endPick();
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && pickMode) {
        e.preventDefault();
        endPick();
        return;
      }
      if (
        e.key === 'Escape' &&
        elements.firstSearchHintOverlay &&
        !elements.firstSearchHintOverlay.hasAttribute('hidden')
      ) {
        e.preventDefault();
        closeFirstSearchHintModal();
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

    syncGeoRadiusLabels();
    refreshGeoFilterWarning();
    updateImportantPlaceCircles();
    [elements.geoRadiusA, elements.geoRadiusB].forEach(function (el) {
      if (el) el.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await fetchParameterInfoMap();
    await fetchAllParameters();
    aliasParameterInfoTooltipsToIndexColumns();
    refreshParameterInfoTooltipTexts();
    bindParamInfoWraps(document.getElementById('sidebar-main'));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      init();
    });
  } else {
    init();
  }
})();
