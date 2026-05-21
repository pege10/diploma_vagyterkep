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
  const SUPABASE_BEST_CITY_FINDS_TABLE = 'best_city_finds';
  const PARAMETER_INFO_TABLE = 'parameter_info';

  /** Nem kerülnek a best_city_finds INSERT-be (saját id/created_at, vagy csak kliens mező). */
  const BEST_CITY_FIND_ROW_OMIT = new Set(['id', 'created_at', 'nev']);

  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  let citiesData = [];
  /** all_parameters oszlopnevek → best_city_finds INSERT (match_score +). */
  let bestCityFindInsertKeys = null;
  /** Oszlopnevek, amelyek kisbetűs „_index” végződéssel rendelkeznek (pl. …_forest_index) */
  let indexParamKeys = [];
  /** @type {Record<string, { min: number, max: number }>} */
  let sliderRanges = {};

  /** Első találat csak a „Tökéletes hely keresése” gombbal; utána a csúszkák változására is fut a keresés. */
  let sliderAutoSearchActive = false;
  /** Szóló nézet: heatmap csak erre az index kulcsra (null = összes aktív mutató). */
  let soloHeatmapParamKey = null;
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

  /**
   * Ideiglenesen kikapcsolt mutatók (UI + keresés + hőtérkép). Visszakapcsolás: töröld az id-t.
   */
  var DISABLED_UI_PARAM_IDS = {
    diploma_index: true,
  };

  function isUiParamDisabled(uiParamId) {
    return !!DISABLED_UI_PARAM_IDS[uiParamId];
  }

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
  /** @type {'a'|'b'|null} */
  let mobileGeoSetupSlot = null;
  let mobileGeoSetupRestore = null;
  let mobileGeoSetupTurnedOnBySheet = false;
  /** Indítás után automatikus 1. fontos hely panel (adatbetöltés után nyílik). */
  let mobileGeoAutoOpenSlot = null;

  let geoSlotState = {
    a: { city: null, lat: NaN, lng: NaN },
    b: { city: null, lat: NaN, lng: NaN },
  };
  /** @type {((e: maplibregl.MapMouseEvent) => void) | null} */
  let mapClickHandler = null;
  /** @type {((e: TouchEvent) => void) | null} */
  let mapTouchPickHandler = null;
  let mapPickTouchDedupeUntil = 0;

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
    paramClearAllSoloBtn: null,
    paramToggleAllBtn: null,
    paramRestoreBaselineBtn: null,
    feedbackPanel: null,
    feedbackPanelInner: null,
    firstSearchHintOverlay: null,
    firstSearchHintCloseBtn: null,
    firstSearchHintProceedBtn: null,
    strictParamsOverlay: null,
    strictParamsTitle: null,
    strictParamsMessage: null,
    strictParamsList: null,
    strictParamsCloseBtn: null,
    sidebarDock: null,
    mobileGeoSheet: null,
    mobileGeoSheetBody: null,
    mobileGeoSheetWarnHost: null,
    mobileGeoSheetOk: null,
    mobileGeoSheetCancel: null,
    mobileMapBackBtn: null,
    mobileWinnerSheet: null,
    mobileWinnerSheetBody: null,
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
    elements.paramClearAllSoloBtn = document.getElementById('param-clear-all-solo-btn');
    elements.paramToggleAllBtn = document.getElementById('param-toggle-all-btn');
    elements.paramRestoreBaselineBtn = document.getElementById('param-restore-baseline-btn');
    elements.feedbackPanel = document.getElementById('feedback-panel');
    elements.feedbackPanelInner = elements.feedbackPanel
      ? elements.feedbackPanel.querySelector('.feedback-panel__inner')
      : null;
    elements.firstSearchHintOverlay = document.getElementById('first-search-hint-overlay');
    elements.firstSearchHintCloseBtn = document.getElementById('first-search-hint-close');
    elements.firstSearchHintProceedBtn = document.getElementById('first-search-hint-proceed');
    elements.strictParamsOverlay = document.getElementById('strict-params-overlay');
    elements.strictParamsTitle = document.getElementById('strict-params-title');
    elements.strictParamsMessage = document.getElementById('strict-params-message');
    elements.strictParamsList = document.getElementById('strict-params-list');
    elements.strictParamsCloseBtn = document.getElementById('strict-params-close');
    elements.sidebarDock = document.getElementById('sidebar-dock');
    elements.mobileGeoSheet = document.getElementById('mobile-geo-sheet');
    elements.mobileGeoSheetBody = document.getElementById('mobile-geo-sheet-body');
    elements.mobileGeoSheetWarnHost = document.getElementById('mobile-geo-sheet-warn-host');
    elements.mobileGeoSheetOk = document.getElementById('mobile-geo-sheet-ok');
    elements.mobileGeoSheetCancel = document.getElementById('mobile-geo-sheet-cancel');
    elements.mobileMapBackBtn = document.getElementById('mobile-map-back-btn');
    elements.mobileWinnerSheet = document.getElementById('mobile-winner-sheet');
    elements.mobileWinnerSheetBody = document.getElementById('mobile-winner-sheet-body');
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
    const proceed = elements.firstSearchHintProceedBtn;
    if (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        closeFirstSearchHintModal();
      });
    }
    if (proceed) {
      proceed.addEventListener('click', function (e) {
        e.stopPropagation();
        closeFirstSearchHintModal();
        runMainSearchFromButton();
      });
    }
    if (ov) {
      ov.addEventListener('click', function (e) {
        if (e.target === ov) closeFirstSearchHintModal();
      });
    }
  }

  function closeStrictParamsModal() {
    const ov = elements.strictParamsOverlay;
    if (ov) {
      ov.setAttribute('hidden', '');
      ov.setAttribute('aria-hidden', 'true');
    }
  }

  function findParamCardByDbKey(dbKey) {
    if (!elements.paramCategoriesHost || !dbKey) return null;
    const esc =
      typeof CSS !== 'undefined' && CSS.escape
        ? CSS.escape(dbKey)
        : String(dbKey).replace(/"/g, '\\"');
    let card = elements.paramCategoriesHost.querySelector(
      '.param-item [data-param-band-min-for="' + esc + '"]'
    );
    if (card) return card.closest('.param-item');
    card = elements.paramCategoriesHost.querySelector(
      '.param-item input[data-param-key="' + esc + '"]'
    );
    return card ? card.closest('.param-item') : null;
  }

  function cityPassesAllBandFiltersExcept(city, targets, exceptKey) {
    for (const key in targets) {
      if (!Object.prototype.hasOwnProperty.call(targets, key)) continue;
      if (key === exceptKey) continue;
      const pack = targets[key];
      if (!pack || pack.mode !== 'band') continue;
      if (!passesBandFilterForCity(city, pack)) return false;
    }
    return true;
  }

  /**
   * Nincs találat: mely sávos mutatók szűrik ki legtöbb települést (rugalmasság lazítás javaslat).
   * @returns {{ reason: string, message: string, suggestions: Array<{ key: string, label: string, type: string, failOnly: number, flex: number }> } | null}
   */
  function buildStrictFilterSuggestions(targets) {
    const geoOn = geoSlotReady('a') || geoSlotReady('b');
    if (geoOn && countGeoEligibleCities() === 0) {
      return {
        reason: 'geo',
        message:
          'Egy település sem esik az összes bekapcsolt fontos hely körébe. Növeld a sugarakat, válassz más központokat, vagy kapcsold ki a szűrőket.',
        suggestions: [],
      };
    }

    const eligible = [];
    for (let i = 0; i < citiesData.length; i++) {
      if (passesGeoFilter(citiesData[i])) eligible.push(citiesData[i]);
    }
    if (eligible.length === 0) {
      return {
        reason: 'empty',
        message: 'Nincs település a jelenlegi szűrők mellett.',
        suggestions: [],
      };
    }

    let passAllBands = 0;
    for (let j = 0; j < eligible.length; j++) {
      if (cityPassesActiveBandFilters(eligible[j], targets)) passAllBands++;
    }

    const bandScores = [];
    for (const key in targets) {
      if (!Object.prototype.hasOwnProperty.call(targets, key)) continue;
      const pack = targets[key];
      if (!pack || pack.mode !== 'band') continue;
      let failOnly = 0;
      for (let k = 0; k < eligible.length; k++) {
        const city = eligible[k];
        if (
          !passesBandFilterForCity(city, pack) &&
          cityPassesAllBandFiltersExcept(city, targets, key)
        ) {
          failOnly++;
        }
      }
      const flex =
        pack.flex != null && Number.isFinite(pack.flex)
          ? Math.max(0, Math.min(1, pack.flex))
          : PARAM_BAND_FLEX_DEFAULT / PARAM_WEIGHT_SLIDER_MAX;
      if (failOnly > 0) {
        bandScores.push({
          key: key,
          label: paramLabelForDbKey(key),
          type: 'band',
          failOnly: failOnly,
          flex: flex,
          score: failOnly * (0.35 + flex * 0.65),
        });
      }
    }

    bandScores.sort(function (a, b) {
      return b.score - a.score;
    });

    if (passAllBands === 0 && bandScores.length > 0) {
      return {
        reason: 'band',
        message:
          'Túl szigorúak a beállítások: egy település sem felel meg minden sávnak egyszerre. Lazítsd a rugalmasságot (Laza), vagy szélesítsd a tól–ig sávokat.',
        suggestions: bandScores.slice(0, 3),
      };
    }

    if (passAllBands > 0) {
      let anyScore = false;
      for (let m = 0; m < eligible.length; m++) {
        const sc = computeCitySearchScore(eligible[m], targets);
        if (sc.used > 0) {
          anyScore = true;
          break;
        }
      }
      if (!anyScore) {
        return {
          reason: 'data',
          message:
            'A bekapcsolt mutatóknál sok településnél hiányzik az adat. Kapcsolj ki pár mutatót, vagy válassz másikat.',
          suggestions: [],
        };
      }
    }

    return {
      reason: 'generic',
      message:
        'Nincs megfelelő település. Lazítsd a rugalmasságot (Laza), szélesítsd a sávokat, vagy kapcsolj ki pár mutatót.',
      suggestions: bandScores.slice(0, 3),
    };
  }

  function applyLoosenSuggestion(sug) {
    if (!sug) return;
    if (sug.type === 'band' && sug.key) {
      const card = findParamCardByDbKey(sug.key);
      const flexEl =
        card && card.querySelector('input[type="range"][data-param-flex-for]');
      if (flexEl) {
        flexEl.value = '0';
        flexEl.dispatchEvent(new Event('input', { bubbles: true }));
        flexEl.dispatchEvent(new Event('change', { bubbles: true }));
        try {
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch (_) {}
      }
    } else if (sug.type === 'geo') {
      const host = document.getElementById('important-places-host');
      if (host) {
        try {
          host.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (_) {}
      }
    }
    closeStrictParamsModal();
    setMobileMapView(false);
    sliderAutoSearchActive = true;
    performSearch({ showTicket: true, persistToDb: true, flyMapToResult: true }).catch(function (e) {
      console.warn('Keresés (lazítás után):', e);
    });
  }

  function openStrictParamsModal(analysis) {
    const ov = elements.strictParamsOverlay;
    const titleEl = elements.strictParamsTitle;
    const msgEl = elements.strictParamsMessage;
    const listEl = elements.strictParamsList;
    if (!ov || !titleEl || !msgEl || !listEl || !analysis) return;

    titleEl.textContent = 'Túl szűk a keresés';
    msgEl.textContent = analysis.message || '';

    listEl.innerHTML = '';
    const sugs = analysis.suggestions || [];
    if (sugs.length === 0) {
      const li = document.createElement('li');
      li.className = 'strict-params-list__empty';
      li.textContent =
        analysis.reason === 'geo'
          ? 'Állíts a fontos helyek sugarain vagy központjain.'
          : 'Kapcsolj ki mutatókat, vagy állíts a csúszkákon.';
      listEl.appendChild(li);
    } else {
      for (let i = 0; i < sugs.length; i++) {
        const sug = sugs[i];
        const li = document.createElement('li');
        li.className = 'strict-params-list__item';
        const row = document.createElement('div');
        row.className = 'strict-params-list__row';
        const label = document.createElement('span');
        label.className = 'strict-params-list__label';
        label.textContent = sug.label;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'strict-params-loosen-btn';
        btn.textContent = 'Lazítsd (Laza)';
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          applyLoosenSuggestion(sug);
        });
        row.appendChild(label);
        row.appendChild(btn);
        li.appendChild(row);
        listEl.appendChild(li);
      }
    }

    ov.removeAttribute('hidden');
    ov.setAttribute('aria-hidden', 'false');
    if (elements.strictParamsCloseBtn) {
      try {
        elements.strictParamsCloseBtn.focus();
      } catch (e) {
        /* ignore */
      }
    }
  }

  function initStrictParamsModal() {
    const ov = elements.strictParamsOverlay;
    const btn = elements.strictParamsCloseBtn;
    if (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        closeStrictParamsModal();
      });
    }
    if (ov) {
      ov.addEventListener('click', function (e) {
        if (e.target === ov) closeStrictParamsModal();
      });
    }
  }

  function showNoSearchResultFeedback(targets) {
    let msg =
      'Nincs olyan település, amely minden bekapcsolt mutatónak egyszerre megfelel. Lazítsd a rugalmasságot (Laza), szélesítsd a sávokat, vagy kapcsolj ki pár mutatót.';
    const geoOn = geoSlotReady('a') || geoSlotReady('b');
    if (geoOn && countGeoEligibleCities() === 0) {
      msg =
        'Nincs település, amely minden bekapcsolt fontos hely körön belül esik. Növeld a sugarakat, válassz más központokat, vagy kapcsold ki a szűrő(k)et.';
    }
    if (elements.resultBox) elements.resultBox.textContent = msg;
    const analysis = buildStrictFilterSuggestions(targets);
    if (analysis) openStrictParamsModal(analysis);
    setMobileMapView(false);
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
  /** Sávos (tól–ig) mutatók rugalmasság csúszka alapértéke (0–10 skála). */
  var PARAM_BAND_FLEX_DEFAULT = 5;

  /** Mobilon indítás után (érintős UI). */
  function isTouchMobileAppStarted() {
    const root = document.documentElement;
    return root.classList.contains('is-touch') && root.classList.contains('app-started');
  }

  /** Mobilon panel-only UI: térkép rejtve, kivéve térképválasztás és keresés utáni térképnézet. */
  function isMobileMapPanelMode() {
    const root = document.documentElement;
    return (
      isTouchMobileAppStarted() &&
      !root.classList.contains('map-picking') &&
      !root.classList.contains('mobile-map-view')
    );
  }

  function syncMobileMapBackBtn() {
    const btn = elements.mobileMapBackBtn;
    if (!btn) return;
    const show =
      isTouchMobileAppStarted() &&
      document.documentElement.classList.contains('mobile-map-view') &&
      !document.documentElement.classList.contains('mobile-geo-setup') &&
      !document.documentElement.classList.contains('map-picking');
    if (show) {
      btn.removeAttribute('hidden');
      btn.setAttribute('aria-hidden', 'false');
    } else {
      btn.setAttribute('hidden', '');
      btn.setAttribute('aria-hidden', 'true');
    }
  }

  function showMobileWinnerSheetEl(show) {
    const sheet = elements.mobileWinnerSheet;
    const root = document.documentElement;
    if (!sheet) return;
    if (show) {
      sheet.removeAttribute('hidden');
      sheet.setAttribute('aria-hidden', 'false');
      root.classList.add('mobile-winner-sheet-open');
    } else {
      sheet.setAttribute('hidden', '');
      sheet.setAttribute('aria-hidden', 'true');
      root.classList.remove('mobile-winner-sheet-open');
    }
  }

  function hideMobileWinnerSheet() {
    if (elements.mobileWinnerSheetBody) elements.mobileWinnerSheetBody.innerHTML = '';
    showMobileWinnerSheetEl(false);
    syncMobileMapBackBtn();
    syncMobileMapDockButtons();
    if (map) setTimeout(function () { if (map) map.resize(); }, 120);
  }

  function fillWinnerInfoContainer(container, city, matchPercent) {
    if (!container || !city) return;
    container.textContent = '';
    const h2 = document.createElement('h2');
    h2.className = 'feedback-panel__title feedback-panel__title--winner';
    let title = 'Tökéletes hely · ' + cityName(city);
    if (matchPercent != null && Number.isFinite(Number(matchPercent))) {
      title += ' · ' + Math.round(Number(matchPercent)) + '% egyezés';
    }
    h2.textContent = title;
    container.appendChild(h2);
    appendCityInfoListToContainer(container, city);
  }

  function renderMobileWinnerSheet(city, matchPercent) {
    if (!isTouchMobileAppStarted() || !elements.mobileWinnerSheetBody || !city) return;
    fillWinnerInfoContainer(elements.mobileWinnerSheetBody, city, matchPercent);
    showMobileWinnerSheetEl(true);
    syncMobileMapBackBtn();
    syncMobileMapDockButtons();
    if (map) setTimeout(function () { if (map) map.resize(); }, 120);
  }

  /**
   * @param {boolean} on
   * @param {{ forGeoEditor?: boolean }} [opts]
   */
  function setMobileMapView(on, opts) {
    if (!isTouchMobileAppStarted()) return;
    const forGeoEditor = !!(opts && opts.forGeoEditor);
    const root = document.documentElement;
    if (on) root.classList.add('mobile-map-view');
    else {
      root.classList.remove('mobile-map-view');
      hideMobileWinnerSheet();
    }
    syncMobileMapBackBtn();
    syncMobileMapDockButtons();
    if (!on && elements.sidebarDock) {
      elements.sidebarDock.classList.remove('sidebar-dock--collapsed');
    }
    if (map) {
      setTimeout(function () {
        if (map) map.resize();
      }, 80);
      setTimeout(function () {
        if (map) {
          map.resize();
          if (on) {
            syncGeoMarkersFromState();
            updateImportantPlaceCircles();
            if (
              !forGeoEditor &&
              !root.classList.contains('mobile-geo-setup') &&
              lastSearchFeedbackMeta &&
              lastSearchFeedbackMeta.winningCity
            ) {
              renderMobileWinnerSheet(
                lastSearchFeedbackMeta.winningCity,
                lastSearchFeedbackMeta.matchPercent
              );
            }
          }
        }
      }, 320);
    }
  }

  function syncMobileMapDockButtons() {
    if (!isTouchMobileAppStarted()) return;
    const inGeoSetup = document.documentElement.classList.contains('mobile-geo-setup');
    const inMap = document.documentElement.classList.contains('mobile-map-view');
    const hasWinnerSheet = document.documentElement.classList.contains('mobile-winner-sheet-open');
    const openBtn = document.getElementById('sidebar-expand-btn');
    const closeBtn = document.getElementById('sidebar-collapse-btn');
    if (inGeoSetup) {
      if (openBtn) openBtn.setAttribute('aria-hidden', 'true');
      if (closeBtn) closeBtn.setAttribute('aria-hidden', 'true');
      return;
    }
    if (openBtn) {
      const showExpand = inMap && !hasWinnerSheet;
      openBtn.setAttribute('aria-hidden', showExpand ? 'false' : 'true');
      openBtn.title = 'Paraméterek megnyitása';
      openBtn.setAttribute('aria-label', 'Paraméterek megnyitása');
    }
    if (closeBtn) {
      closeBtn.setAttribute('aria-hidden', inMap ? 'true' : 'false');
      closeBtn.title = 'Térkép megnyitása';
      closeBtn.setAttribute('aria-label', 'Térkép megnyitása');
    }
  }

  function initMobileMapChrome() {
    if (elements.mobileMapBackBtn) {
      elements.mobileMapBackBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        setMobileMapView(false);
      });
    }
  }

  function getGeoPlaceCardEl(slot) {
    const sw = slot === 'a' ? elements.geoActiveA : elements.geoActiveB;
    return sw ? sw.closest('.param-item--geo-place') : null;
  }

  function isGeoPlaceSwitchOn(slot) {
    const sw = slot === 'a' ? elements.geoActiveA : elements.geoActiveB;
    return !!(sw && sw.getAttribute('aria-checked') === 'true');
  }

  function shouldAutoOpenMobileGeoSetup(slot) {
    if (!isTouchMobileAppStarted()) return false;
    if (!isGeoPlaceSwitchOn(slot)) return false;
    return !geoSlotReady(slot);
  }

  function tryOpenMobileGeoSetupIfNeeded(slot) {
    if (!shouldAutoOpenMobileGeoSetup(slot)) return;
    openMobileGeoEditorIfNeeded(slot);
  }

  /** Főpanelen érintés / fókusz: csak a fontos-hely panel kerül a térkép fölé. */
  function openMobileGeoEditorIfNeeded(slot) {
    if (!isTouchMobileAppStarted() || (slot !== 'a' && slot !== 'b')) return;
    if (!isGeoPlaceSwitchOn(slot)) return;
    if (mobileGeoSetupSlot === slot) return;
    enterMobileGeoSetup(slot);
  }

  function bindMobileGeoCardEditorTriggers(wrap, slot, inp, pickBtn, rInput) {
    function openEditor() {
      openMobileGeoEditorIfNeeded(slot);
    }
    wrap.addEventListener(
      'pointerdown',
      function (e) {
        if (!isTouchMobileAppStarted()) return;
        if (!isGeoPlaceSwitchOn(slot)) return;
        if (e.target.closest('.param-item__ios-switch')) return;
        if (e.target.closest('.param-item__toggle')) return;
        openEditor();
      },
      { passive: true }
    );
    if (inp) {
      inp.addEventListener('focus', openEditor);
      inp.addEventListener('click', function (e) {
        e.stopPropagation();
        openEditor();
      });
    }
    if (pickBtn) {
      pickBtn.addEventListener(
        'pointerdown',
        function (e) {
          e.stopPropagation();
          openEditor();
        },
        { passive: true }
      );
    }
    if (rInput) {
      rInput.addEventListener('pointerdown', openEditor, { passive: true });
      rInput.addEventListener('focus', openEditor);
    }
  }

  function showMobileGeoSheetEl(show) {
    const sheet = elements.mobileGeoSheet;
    if (!sheet) return;
    if (show) {
      sheet.removeAttribute('hidden');
      sheet.setAttribute('aria-hidden', 'false');
    } else {
      sheet.setAttribute('hidden', '');
      sheet.setAttribute('aria-hidden', 'true');
    }
  }

  function enterMobileGeoSetup(slot) {
    if (!isTouchMobileAppStarted() || (slot !== 'a' && slot !== 'b')) return;
    if (mobileGeoSetupSlot === slot) return;
    if (mobileGeoSetupSlot) exitMobileGeoSetup(true);

    const card = getGeoPlaceCardEl(slot);
    const bodyHost = elements.mobileGeoSheetBody;
    if (!card || !bodyHost) return;

    card.classList.remove('param-item--collapsed');
    const toggle = card.querySelector('.param-item__toggle');
    if (toggle) toggle.setAttribute('aria-expanded', 'true');

    const warn = elements.geoWarnLine;
    mobileGeoSetupRestore = {
      cardParent: card.parentNode,
      cardNext: card.nextSibling,
      warnParent: warn ? warn.parentNode : null,
      warnNext: warn ? warn.nextSibling : null,
    };

    bodyHost.appendChild(card);
    if (warn && elements.mobileGeoSheetWarnHost) {
      elements.mobileGeoSheetWarnHost.appendChild(warn);
    }

    mobileGeoSetupSlot = slot;
    document.documentElement.classList.add('mobile-geo-setup');
    document.documentElement.setAttribute('data-geo-setup-slot', slot);
    showMobileGeoSheetEl(true);
    hideMobileWinnerSheet();
    setMobileMapView(true, { forGeoEditor: true });
    refreshGeoFilterWarning();
    updateImportantPlaceCircles();
    syncGeoMarkersFromState();
    syncMobileMapBackBtn();
  }

  function exitMobileGeoSetup(apply) {
    const slot = mobileGeoSetupSlot;
    const restore = mobileGeoSetupRestore;
    const card = slot ? getGeoPlaceCardEl(slot) : null;
    const warn = elements.geoWarnLine;

    if (card && restore && restore.cardParent) {
      if (restore.cardNext) restore.cardParent.insertBefore(card, restore.cardNext);
      else restore.cardParent.appendChild(card);
    }
    if (warn && restore && restore.warnParent) {
      if (restore.warnNext) restore.warnParent.insertBefore(warn, restore.warnNext);
      else restore.warnParent.appendChild(warn);
    }

    mobileGeoSetupSlot = null;
    mobileGeoSetupRestore = null;
    const turnedOnBySheet = mobileGeoSetupTurnedOnBySheet;
    mobileGeoSetupTurnedOnBySheet = false;

    document.documentElement.classList.remove('mobile-geo-setup');
    document.documentElement.removeAttribute('data-geo-setup-slot');
    showMobileGeoSheetEl(false);

    if (!apply && turnedOnBySheet && slot) {
      setGeoPlaceCardActive(slot, false);
    }

    setMobileMapView(false);
    syncMobileMapDockButtons();
    refreshGeoFilterWarning();
    updateImportantPlaceCircles();
    if (map) {
      setTimeout(function () {
        if (map) map.resize();
      }, 120);
    }
  }

  function onMobileGeoSheetOk() {
    const slot = mobileGeoSetupSlot;
    exitMobileGeoSetup(true);
    if (slot === 'a' && geoSlotReady('a')) {
      maybeAdvanceGuidedFlowAfterGeo('a');
    } else if (slot === 'b' && geoSlotReady('b')) {
      maybeAdvanceGuidedFlowAfterGeo('b');
    }
  }

  function onMobileGeoSheetCancel() {
    exitMobileGeoSetup(false);
  }

  function initMobileGeoSheet() {
    if (elements.mobileGeoSheetOk) {
      elements.mobileGeoSheetOk.addEventListener('click', function (e) {
        e.stopPropagation();
        onMobileGeoSheetOk();
      });
    }
    if (elements.mobileGeoSheetCancel) {
      elements.mobileGeoSheetCancel.addEventListener('click', function (e) {
        e.stopPropagation();
        onMobileGeoSheetCancel();
      });
    }
  }

  /** Kiállítás / mobil sorszám: holisticsearch.space/exhibition */
  function isExhibitionMode() {
    return /\/exhibition(?:\/|$)/i.test(location.pathname || '');
  }

  /**
   * GitHub Pages: / = kereső (mobilon nincs sorszám overlay); /exhibition/ = sorszám jegy keresés után.
   */
  function shouldShowSearchTicketOverlay() {
    if (!document.documentElement.classList.contains('is-touch')) return true;
    return isExhibitionMode() || /\bsorszam=1\b/i.test(location.search || '');
  }

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

  function isTransportFrequencySzékhelyTier(city, indexKey) {
    if (!city) return false;
    if (isBudapestDistrictRow(city)) return true;
    const mKey = indexKey
      ? indexKey.replace(/_transport_frequency_index$/i, '_modszer')
      : null;
    if (!mKey) return false;
    const m = String(city[mKey] || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_');
    if (m === 'szekhelye_maga' || m === 'szekhely_maga') return true;
    if (m.indexOf('szekhely') !== -1 && m.indexOf('maga') !== -1) return true;
    if (m === 'budapest_kerulet') return true;
    return false;
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

  function jobsCompanionMunkalehetosegAranyKey(indexKey) {
    if (typeof indexKey !== 'string' || !/_jobs_index$/i.test(indexKey)) return null;
    return indexKey.replace(/_jobs_index$/i, '_munkalehetoseg_arany_nyers');
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

  /** Egész percek → „12 perc”, „1 óra 5 perc” (perc indexek buborékja / szélső érték). */
  function formatDurationMinutesForUi(minutes) {
    if (minutes == null || !Number.isFinite(minutes)) return '–';
    const total = Math.round(minutes);
    if (total < 0) return '–';
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (h <= 0) return String(m) + NBSP + 'perc';
    if (m === 0) return String(h) + NBSP + 'óra';
    return String(h) + NBSP + 'óra' + NBSP + String(m) + NBSP + 'perc';
  }

  function formatMinutesForUi(minutes) {
    return formatDurationMinutesForUi(minutes);
  }

  function formatIndexScoreForUi(n) {
    if (n == null || !Number.isFinite(n)) return '–';
    return String(Math.round(n));
  }

  /** Sávos szűrő UI: elfogadható tartomány + rugalmasság. */
  var BAND_FILTER_UI_PARAM_IDS = {
    airpollution_index: true,
    budapest_car_train_index: true,
    internet_index: true,
    urban_mobility_index: true,
    transport_frequency_index: true,
    district_seat_access_index: true,
    budapest_access_index: true,
    cultural_index: true,
    groceries_index: true,
    sport_index: true,
    gastro_index: true,
    primary_school_proximity_index: true,
    high_school_proximity_index: true,
    real_estate_price_grow_5yrs_index: true,
    real_estate_price_avg5mth_index: true,
    jobs_index: true,
  };

  function isBandFilterUiParamId(uiParamId) {
    return !!BAND_FILTER_UI_PARAM_IDS[uiParamId];
  }

  function isBandFilterParamKey(dbKey) {
    const ent = getUiParamEntryForDbKey(dbKey);
    return !!(ent && isBandFilterUiParamId(ent.id));
  }

  /**
   * @returns {{ filterCol: string, formatValue: function, parseValue: function,
   *             invertScale: boolean, intro: string, bandLabel: string,
   *             leftHint: string, rightHint: string, defaultMaxDelta: number|null,
   *             step: number, scorePrefer: string, flexTitle: string } | null}
   */
  function getBandFilterConfigForDbKey(dbKey) {
    const ent = getUiParamEntryForDbKey(dbKey);
    if (!ent || !isBandFilterUiParamId(ent.id)) return null;

    const flexTitle =
      'Rugalmasság (0 = nincs korlát, ' + PARAM_WEIGHT_SLIDER_MAX + ' = szigorú sáv)';
    const minutesLoHi = {
      invertScale: true,
      intro:
        'Elfogadható utazási idő tartomány. Balra a hosszabb, jobbra a rövidebb idő.',
      bandLabel: 'Elfogadható időtartam',
      leftHint: 'Legtöbb idő',
      rightHint: 'Legkevesebb idő',
      formatValue: formatDurationMinutesForUi,
      parseValue: parseNumeric,
      step: 1,
      defaultMaxDelta: 30,
      scorePrefer: 'lower',
      flexTitle: flexTitle,
    };
    const indexBand = {
      invertScale: false,
      intro:
        'Elfogadható index tartomány. Balra az alacsonyabb, jobbra a magasabb érték.',
      bandLabel: 'Elfogadható tartomány',
      leftHint: 'Alacsonyabb',
      rightHint: 'Magasabb',
      formatValue: formatIndexScoreForUi,
      parseValue: parseNumeric,
      step: 1,
      defaultMaxDelta: null,
      scorePrefer: 'higher',
      flexTitle: flexTitle,
    };

    let preset = null;

    switch (ent.id) {
      case 'airpollution_index':
        preset = Object.assign({}, indexBand, {
          intro:
            'Elfogadható légszennyezettségi index (3 km). Szűrés: index pont; magasabb index = erősebb szennyezés.',
          bandLabel: 'Elfogadható tartomány',
          leftHint: 'Tisztább',
          rightHint: 'Szennyezettebb',
          scorePrefer: 'lower',
        });
        break;
      case 'budapest_access_index':
        preset = Object.assign({}, indexBand, {
          intro:
            'Elfogadható elérés Budapestre. Szűrés: index pont; felirat: utazási idő.',
          bandLabel: 'Elfogadható elérés',
          leftHint: 'Rosszabb',
          rightHint: 'Jobb (0 perc)',
        });
        break;
      case 'budapest_car_train_index':
        preset = Object.assign({}, indexBand, {
          intro:
            'Elfogadható elérés Budapestre (autó + vonat). Szűrés: index; felirat: összidő.',
          bandLabel: 'Elfogadható idő',
          leftHint: 'Rosszabb',
          rightHint: 'Jobb (0 perc)',
        });
        break;
      case 'district_seat_access_index':
        preset = Object.assign({}, indexBand, {
          intro:
            'Elfogadható elérés a járásszékhelyre. Szűrés: index; felirat: utazási idő.',
          bandLabel: 'Elfogadható elérés',
          leftHint: 'Rosszabb',
          rightHint: 'Jobb',
        });
        break;
      case 'internet_index':
        preset = Object.assign({}, indexBand, {
          intro: 'Elfogadható internet index. Szűrés: pont; felirat: Mbps.',
          bandLabel: 'Elfogadható sebesség',
          leftHint: 'Gyengébb',
          rightHint: 'Erősebb',
        });
        break;
      case 'transport_frequency_index':
        preset = Object.assign({}, indexBand, {
          intro:
            'Elfogadható tömegközlekedési index (0–100). Szűrés: pont; a felirat a pontszinthez tartozó legjobb járatszám (járásszékhely és BP kerület nélkül).',
          bandLabel: 'Elfogadható tartomány',
          leftHint: 'Gyengébb',
          rightHint: 'Erősebb',
        });
        break;
      case 'urban_mobility_index':
      case 'cultural_index':
      case 'sport_index':
        preset = indexBand;
        break;
      case 'groceries_index':
        preset = Object.assign({}, indexBand, {
          intro: 'Elfogadható kisker index. Szűrés: pont; felirat: km és üzletszám.',
          bandLabel: 'Elfogadható ellátás',
          leftHint: 'Gyengébb',
          rightHint: 'Erősebb',
          scorePrefer: 'higher',
        });
        break;
      case 'gastro_index':
        preset = Object.assign({}, indexBand, {
          intro: 'Elfogadható gasztronómia index. Szűrés: pont; felirat: helyszám.',
          bandLabel: 'Elfogadható kínálat',
          leftHint: 'Kevesebb',
          rightHint: 'Több',
        });
        break;
      case 'jobs_index':
        preset = Object.assign({}, indexBand, {
          intro:
            'Elfogadható helyi munkalehetőség index (0–100). Szűrés: pont; felirat: munkalehetőség aránya (%).',
          bandLabel: 'Elfogadható tartomány',
          leftHint: 'Gyengébb',
          rightHint: 'Erősebb',
        });
        break;
      case 'primary_school_proximity_index':
      case 'high_school_proximity_index': {
        if (!schoolVariantDefForIndexKey(dbKey)) return null;
        preset = Object.assign({}, indexBand, {
          intro: 'Elfogadható iskolaválaszték index. Szűrés: pont; felirat: távolság (km).',
          bandLabel: 'Elfogadható közelség',
          leftHint: 'Távolabb',
          rightHint: 'Közelebb',
          scorePrefer: 'higher',
        });
        break;
      }
      case 'real_estate_price_grow_5yrs_index': {
        if (
          !INGATLAN_GROW_VARIANTS.some(function (vd) {
            return vd.indexMatch.test(dbKey);
          })
        ) {
          return null;
        }
        preset = Object.assign({}, indexBand, {
          intro: 'Elfogadható áremelkedés index. Szűrés: pont; felirat: %.',
          bandLabel: 'Elfogadható emelkedés',
          leftHint: 'Alacsonyabb',
          rightHint: 'Magasabb',
        });
        break;
      }
      case 'real_estate_price_avg5mth_index': {
        if (
          !INGATLAN_AVG_VARIANTS.some(function (vd) {
            return vd.indexMatch.test(dbKey);
          })
        ) {
          return null;
        }
        preset = Object.assign({}, indexBand, {
          intro: 'Elfogadható ingatlanár index. Szűrés: pont; felirat: Ft/m².',
          bandLabel: 'Elfogadható árszint',
          leftHint: 'Olcsóbb',
          rightHint: 'Drágább',
          scorePrefer: 'lower',
        });
        break;
      }
      default:
        return null;
    }

    if (!preset) return null;
    return enrichBandFilterConfig(dbKey, preset);
  }

  /** Sáv: szűrés mindig index (dbKey); kiírás kísérő metrika, ha van. */
  function enrichBandFilterConfig(indexKey, preset) {
    const out = Object.assign({ filterCol: indexKey }, preset);
    const info = findCompanionInfoForIndexKey(indexKey);
    if (info && info.pair) {
      out.displayPair = info.pair;
    } else if (info && info.companionKey && info.format) {
      out.displayCompanionKey = info.companionKey;
      out.displayFormat = info.format;
      out.displayParse = info.parse;
    }
    return out;
  }

  /**
   * Tömegközlekedés: felirat = max. járat/nap az adott index-szinten (nem székhely, nem BP kerület).
   */
  function createTransportFrequencyBandDisplayModel(indexKey, cfg) {
    const jarCol = transportFrequencyCompanionNapiJaratokKey(indexKey);
    const idxCol = indexKey;
    if (!jarCol || !citiesData.length) return null;
    /** @type {Map<number, number>} max járat / kerekített index */
    const maxByIndex = new Map();
    const sortedKeys = [];
    for (let i = 0; i < citiesData.length; i++) {
      const c = citiesData[i];
      if (isTransportFrequencySzékhelyTier(c, indexKey)) continue;
      const ix = parseNumeric(c[idxCol]);
      const jar = parseNumeric(c[jarCol]);
      if (ix == null || jar == null) continue;
      const k = Math.round(ix);
      const prev = maxByIndex.get(k);
      if (prev == null || jar > prev) maxByIndex.set(k, jar);
    }
    maxByIndex.forEach(function (_v, k) {
      sortedKeys.push(k);
    });
    sortedKeys.sort(function (a, b) {
      return a - b;
    });
    if (!sortedKeys.length) return null;

    function maxForRoundedIndex(rk) {
      const direct = maxByIndex.get(rk);
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
      if (i0 < 0) return maxByIndex.get(sortedKeys[i1]);
      if (i1 < 0) return maxByIndex.get(sortedKeys[i0]);
      if (i0 === i1) return maxByIndex.get(sortedKeys[i0]);
      const k0 = sortedKeys[i0];
      const k1 = sortedKeys[i1];
      const r0 = maxByIndex.get(k0);
      const r1 = maxByIndex.get(k1);
      if (r0 == null) return r1;
      if (r1 == null) return r0;
      if (k1 === k0) return r0;
      const t = (rk - k0) / (k1 - k0);
      return r0 + (r1 - r0) * t;
    }

    return {
      formatAtIndex: function (ix) {
        const v = parseFloat(ix);
        if (!Number.isFinite(v)) return '–';
        const m = maxForRoundedIndex(Math.round(v));
        if (m == null || !Number.isFinite(m)) return '–';
        return formatNapiJaratokForUi(m);
      },
    };
  }

  function createBandFilterDisplayModel(indexKey, cfg) {
    if (!cfg || !indexKey) return null;
    const ent = getUiParamEntryForDbKey(indexKey);
    if (ent && ent.id === 'transport_frequency_index') {
      return createTransportFrequencyBandDisplayModel(indexKey, cfg);
    }
    const step = cfg.step != null ? cfg.step : 1;
    if (cfg.displayPair) {
      const parseFn = cfg.displayPair.parse || parseNumeric;
      const mA = createIndexCompanionAverageModel(
        indexKey,
        cfg.displayPair.a,
        step,
        parseFn
      );
      const mB = createIndexCompanionAverageModel(
        indexKey,
        cfg.displayPair.b,
        step,
        parseFn
      );
      if (!mA || !mB) return null;
      return {
        formatAtIndex: function (ix) {
          return cfg.displayPair.formatPair(
            mA.valueAtSliderValue(ix),
            mB.valueAtSliderValue(ix)
          );
        },
      };
    }
    if (cfg.displayCompanionKey && cfg.displayFormat) {
      const m = createIndexCompanionAverageModel(
        indexKey,
        cfg.displayCompanionKey,
        step,
        cfg.displayParse
      );
      if (!m) return null;
      return {
        formatAtIndex: function (ix) {
          return cfg.displayFormat(m.valueAtSliderValue(ix));
        },
      };
    }
    return null;
  }

  function formatBandFilterUiValue(indexVal, cfg, indexKey, scaleMax, displayModel) {
    if (indexVal == null || !Number.isFinite(indexVal)) return '–';
    if (displayModel && displayModel.formatAtIndex) {
      const t = displayModel.formatAtIndex(indexVal);
      if (t != null && t !== '') return t;
    }
    const fmt = cfg && cfg.formatValue ? cfg.formatValue : formatIndexScoreForUi;
    return fmt(indexVal);
  }

  function bandFilterCompanionKey(dbKey) {
    const cfg = getBandFilterConfigForDbKey(dbKey);
    return cfg ? cfg.filterCol : null;
  }

  function computeNumericColumnRange(colKey, parseFn) {
    const parseValue = parseFn || parseNumeric;
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < citiesData.length; i++) {
      const v = parseValue(citiesData[i][colKey]);
      if (v == null) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return { min: 0, max: 100 };
    }
    const lo = min >= 0 && min < 10 ? Math.max(0, min) : Math.floor(min);
    const hi = max >= 0 && max < 10 ? max : Math.ceil(max);
    return { min: lo, max: Math.max(lo + (parseFn === parseHufAmount ? 1000 : 1), hi) };
  }

  function snapBandFilterStep(value, scaleMin, scaleMax, step) {
    const st = step != null && step > 0 ? step : 1;
    let v = Math.round(value / st) * st;
    if (v < scaleMin) v = scaleMin;
    if (v > scaleMax) v = scaleMax;
    return v;
  }

  function computeBandFilterDataRange(cfg, indexKey) {
    if (cfg && cfg.filterCol) {
      return computeNumericColumnRange(cfg.filterCol, cfg.parseValue);
    }
    return { min: 0, max: 100 };
  }

  /** Percentilis a betöltött településeken (0–1). */
  function computeColumnPercentiles(colKey, parseFn, pctLo, pctHi, rowExcludeFn) {
    const parseValue = parseFn || parseNumeric;
    const vals = [];
    for (let i = 0; i < citiesData.length; i++) {
      if (rowExcludeFn && rowExcludeFn(citiesData[i])) continue;
      const v = parseValue(citiesData[i][colKey]);
      if (v == null) continue;
      vals.push(v);
    }
    if (!vals.length) return null;
    vals.sort(function (a, b) {
      return a - b;
    });
    function atPct(p) {
      const idx = Math.min(
        vals.length - 1,
        Math.max(0, Math.floor(p * (vals.length - 1)))
      );
      return vals[idx];
    }
    return {
      lo: atPct(pctLo),
      hi: atPct(pctHi),
      min: vals[0],
      max: vals[vals.length - 1],
    };
  }

  function roundBandDisplayEndpoint(n, step) {
    if (n == null || !Number.isFinite(n)) return n;
    if (n <= 0) return 0;
    const st = step != null && step > 0 ? step : 1;
    if (st >= 1) return Math.round(n / st) * st;
    const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(n))));
    const r = Math.round(n / mag) * mag;
    return Math.round(r / st) * st;
  }

  /**
   * Skála: index tartomány; szélső felirat = kísérő metrika (mint a régi indexcsúszka).
   */
  function bandFilterDisplayEndpoints(cfg, dataMr, indexKey) {
    const scaleMin = dataMr.min;
    const scaleMax = dataMr.max;
    const displayModel = createBandFilterDisplayModel(indexKey, cfg);
    const labelMin = formatBandFilterUiValue(
      scaleMin,
      cfg,
      indexKey,
      scaleMax,
      displayModel
    );
    const labelMax = formatBandFilterUiValue(
      scaleMax,
      cfg,
      indexKey,
      scaleMax,
      displayModel
    );
    return {
      scaleMin: scaleMin,
      scaleMax: scaleMax,
      labelMin: labelMin,
      labelMax: labelMax,
      displayModel: displayModel,
    };
  }

  function computeMinuteColumnRange(colKey) {
    const mr = computeNumericColumnRange(colKey, parseNumeric);
    if (mr.max <= mr.min) return { min: 0, max: 240 };
    return { min: Math.max(0, Math.floor(mr.min)), max: Math.ceil(mr.max) };
  }

  function bandFilterDefaultValues(mr, cfg, indexKey) {
    const step = cfg.step != null ? cfg.step : 1;
    if (cfg.filterCol && citiesData.length) {
      const pr = computeColumnPercentiles(
        cfg.filterCol,
        cfg.parseValue,
        0.25,
        0.75,
        null
      );
      if (pr && pr.lo != null && pr.hi != null && Math.abs(pr.hi - pr.lo) >= step) {
        const vmin = cfg.invertScale ? pr.hi : pr.lo;
        const vmax = cfg.invertScale ? pr.lo : pr.hi;
        return {
          valueMin: snapBandFilterStep(vmin, mr.min, mr.max, step),
          valueMax: snapBandFilterStep(vmax, mr.min, mr.max, step),
        };
      }
    }
    const span = mr.max - mr.min;
    const delta =
      cfg.defaultMaxDelta != null
        ? Math.min(cfg.defaultMaxDelta, span)
        : Math.max(step, span * 0.35);
    if (cfg.invertScale) {
      const hi = Math.min(mr.max, mr.min + delta);
      const lo = Math.max(mr.min, mr.max - delta);
      return {
        valueMin: snapBandFilterStep(lo, mr.min, mr.max, step),
        valueMax: snapBandFilterStep(hi, mr.min, mr.max, step),
      };
    }
    const midLo = mr.min + span * 0.3;
    const midHi = mr.min + span * 0.7;
    return {
      valueMin: snapBandFilterStep(midLo, mr.min, mr.max, step),
      valueMax: snapBandFilterStep(midHi, mr.min, mr.max, step),
    };
  }

  function bandValuesNeedFriendlyReset(bandMin, bandMax, mr) {
    if (bandMin == null || bandMax == null) return true;
    if (bandMin === bandMax) return true;
    const span = mr.max - mr.min;
    if (!Number.isFinite(span) || span <= 0) return true;
    if (Math.abs(bandMax - bandMin) < span * 0.08) return true;
    return false;
  }

  function applyBandFilterEnableDefaults(card, force) {
    if (!card || card.getAttribute('data-param-band-filter') !== '1') return;
    const key = getActiveParamKeyFromCard(card);
    if (!key) return;
    const cfg = getBandFilterConfigForDbKey(key);
    if (!cfg) return;
    ensureBandFilterCardReady(card);
    const dataMr = computeBandFilterDataRange(cfg, key);
    const minEl = card.querySelector('[data-param-band-min-for]');
    const maxEl = card.querySelector('[data-param-band-max-for]');
    if (!minEl || !maxEl) return;
    const bandMin = parseNumeric(minEl.value);
    const bandMax = parseNumeric(maxEl.value);
    if (!force && !bandValuesNeedFriendlyReset(bandMin, bandMax, dataMr)) {
      refreshBandDualRangeUi(card);
      return;
    }
    const dv = bandFilterDefaultValues(dataMr, cfg, key);
    minEl.value = String(dv.valueMin);
    maxEl.value = String(dv.valueMax);
    const flexEl = card.querySelector('input[type="range"][data-param-flex-for]');
    if (flexEl) {
      flexEl.value = String(PARAM_BAND_FLEX_DEFAULT);
      flexEl.dispatchEvent(new Event('input', { bubbles: true }));
    }
    refreshBandDualRangeUi(card);
  }

  function refreshBandDualRangeUi(card) {
    const key = getActiveParamKeyFromCard(card);
    if (!key) return;
    const cfg = getBandFilterConfigForDbKey(key);
    if (!cfg) return;
    const dataMr = computeBandFilterDataRange(cfg, key);
    const disp = bandFilterDisplayEndpoints(cfg, dataMr, key);
    const bandBlock = card._bandBlock || card.querySelector('.param-band-slider-block');
    if (!bandBlock) return;
    const wrap = bandBlock.querySelector('.dual-range-wrap');
    if (wrap) {
      wrap.setAttribute('data-scale-min', String(disp.scaleMin));
      wrap.setAttribute('data-scale-max', String(disp.scaleMax));
    }
    const ends = bandBlock.querySelectorAll('.param-range-end');
    if (ends[0] && disp.labelMin) ends[0].textContent = disp.labelMin;
    if (ends[1] && disp.labelMax) ends[1].textContent = disp.labelMax;
    if (wrap && wrap._dualRangeRepaint) wrap._dualRangeRepaint();
  }

  /**
   * Rugalmasság 0–1: effektív [min,max] perc.
   * 0 (laza) = teljes skála → gyakorlatilag nincs perc-korlát; 1 (szigorú) = pontos sáv.
   */
  function effectiveBandMinuteBounds(bandMin, bandMax, flex01, scaleMin, scaleMax) {
    const lo = Math.min(bandMin, bandMax);
    const hi = Math.max(bandMin, bandMax);
    const f = Math.max(0, Math.min(1, flex01));
    const sMin = Number.isFinite(scaleMin) ? scaleMin : 0;
    const sMax = Number.isFinite(scaleMax) ? scaleMax : Math.max(hi, 240);
    if (f <= 0) return { effMin: sMin, effMax: sMax };
    if (f >= 1) return { effMin: lo, effMax: hi };
    return {
      effMin: sMin + (lo - sMin) * f,
      effMax: sMax + (hi - sMax) * f,
    };
  }

  function bandFilterValueForCity(city, pack) {
    if (!pack || pack.mode !== 'band') return null;
    const col = pack.companionKey;
    if (!col) return null;
    const parseValue = pack.parseValue || parseNumeric;
    return parseValue(city[col]);
  }

  /** Hiányzó érték: ezt a mutatót ennél a településnél nem vesszük figyelembe (nem szűr ki). */
  function passesBandFilterForCity(city, pack) {
    if (!pack || pack.mode !== 'band') return true;
    const got = bandFilterValueForCity(city, pack);
    if (got == null) return true;
    const flex =
      pack.flex != null && Number.isFinite(pack.flex)
        ? Math.max(0, Math.min(1, pack.flex))
        : 1;
    let scaleMin = pack.scaleMin;
    let scaleMax = pack.scaleMax;
    if (!Number.isFinite(scaleMin) || !Number.isFinite(scaleMax)) {
      const cfg = getBandFilterConfigForDbKey(pack.indexKey || '');
      const mr = cfg
        ? computeBandFilterDataRange(cfg, pack.indexKey)
        : computeNumericColumnRange(col, parseValue);
      scaleMin = mr.min;
      scaleMax = mr.max;
    }
    const b = effectiveBandMinuteBounds(
      pack.bandMin,
      pack.bandMax,
      flex,
      scaleMin,
      scaleMax
    );
    return got >= b.effMin && got <= b.effMax;
  }

  /** Sáv + rugalmasság: kisebb = jobb; flex növelése szűkebb effektív sávot és erősebb középpont-torzítást. */
  function computeBandFilterFitScore(city, pack) {
    if (!pack || pack.mode !== 'band') return null;
    const got = bandFilterValueForCity(city, pack);
    if (got == null) return null;

    const flex =
      pack.flex != null && Number.isFinite(pack.flex)
        ? Math.max(0, Math.min(1, pack.flex))
        : 1;
    let scaleMin = pack.scaleMin;
    let scaleMax = pack.scaleMax;
    if (!Number.isFinite(scaleMin) || !Number.isFinite(scaleMax)) {
      const cfg = getBandFilterConfigForDbKey(pack.indexKey || '');
      const mr = cfg
        ? computeBandFilterDataRange(cfg, pack.indexKey)
        : computeNumericColumnRange(col, parseValue);
      scaleMin = mr.min;
      scaleMax = mr.max;
    }
    const b = effectiveBandMinuteBounds(
      pack.bandMin,
      pack.bandMax,
      flex,
      scaleMin,
      scaleMax
    );
    const lo = Math.min(pack.bandMin, pack.bandMax);
    const hi = Math.max(pack.bandMin, pack.bandMax);
    const mid = (lo + hi) / 2;
    const span = Math.max(1, hi - lo, scaleMax - scaleMin);

    let outside = 0;
    if (got < b.effMin) outside = b.effMin - got;
    else if (got > b.effMax) outside = got - b.effMax;

    const centerDist = Math.abs(got - mid);
    const preferHigh = pack.scorePrefer === 'higher';
    const indexRank = preferHigh ? -got : got;
    const strictPart = (outside / span) * (5 + flex * 95) + (centerDist / span) * flex * 40;
    const looseWeight = 1 - flex;
    return indexRank * (0.15 + looseWeight * 0.85) + strictPart;
  }

  var DEFAULT_WEIGHT_SLIDER_UI = {
    weightLabel: 'Fontosság a keresésben',
    weightLeftHint: 'Nem számít',
    weightRightHint: 'Maximális',
  };

  /**
   * Nem sávos (index + fontosság) mutatók: alcím, értékcsúszka cím + szélső feliratok.
   * @returns {{ intro?: string, valueLabel?: string, leftHint?: string, rightHint?: string,
   *             weightLabel?: string, weightLeftHint?: string, weightRightHint?: string } | null}
   */
  function getValueSliderUiConfig(uiParamId) {
    if (!uiParamId || isUiParamDisabled(uiParamId)) return null;
    const base = Object.assign({}, DEFAULT_WEIGHT_SLIDER_UI);
    switch (uiParamId) {
      case 'forest_index':
        return Object.assign(base, {
          intro:
            'Kívánt erdőlefedettségi index (3 km). Szűrés: index; a szélső értékek: átlagos erdőarány (%).',
          valueLabel: 'Kívánt index',
          leftHint: 'Kevesebb erdő',
          rightHint: 'Több erdő',
        });
      case 'water_index':
        return Object.assign(base, {
          intro:
            'Kívánt vízfelület-index (3 km). Szűrés: index; a szélső értékek: átlagos vízarány (%).',
          valueLabel: 'Kívánt index',
          leftHint: 'Kevesebb víz',
          rightHint: 'Több víz',
        });
      case 'terrain_index':
        return Object.assign(base, {
          intro:
            'Kívánt hegyvidéki karakter index (3 km). Szűrés: index; a szélső értékek: átlagos lejtés (°).',
          valueLabel: 'Kívánt index',
          leftHint: 'Laposabb',
          rightHint: 'Hegyesebb',
        });
      case 'senior_index':
        return Object.assign(base, {
          intro:
            'Kívánt arány a 65 év felettieknek. Szűrés: index; a szélső értékek: népességarány (%).',
          valueLabel: 'Kívánt index',
          leftHint: 'Fiatalabb',
          rightHint: 'Idősebb',
        });
      case 'sleeping_city_index':
        return Object.assign(base, {
          intro:
            'Kívánt alvóváros index – mennyire kiszolgált a település a környező nagyvárosok felől.',
          valueLabel: 'Kívánt index',
          leftHint: 'Alacsonyabb',
          rightHint: 'Magasabb',
        });
      case 'turism_index':
        return Object.assign(base, {
          intro: 'Kívánt turizmus index (0–100).',
          valueLabel: 'Kívánt index',
          leftHint: 'Alacsonyabb',
          rightHint: 'Magasabb',
        });
      case 'primary_school_proximity_index':
        return Object.assign(base, {
          intro:
            'Kívánt iskolaválaszték index. Szűrés: index; felirat: távolság (km). Válaszd ki az iskola típusát.',
          valueLabel: 'Kívánt index',
          leftHint: 'Távolabb',
          rightHint: 'Közelebb',
        });
      case 'high_school_proximity_index':
        return Object.assign(base, {
          intro:
            'Kívánt gimnázium-elérhetőség index. Szűrés: index; felirat: távolság (km). Válaszd ki az iskola típusát.',
          valueLabel: 'Kívánt index',
          leftHint: 'Távolabb',
          rightHint: 'Közelebb',
        });
      case 'real_estate_price_grow_5yrs_index':
        return Object.assign(base, {
          intro:
            'Kívánt áremelkedés index (5 év). Szűrés: index; felirat: %. Válaszd ki az ingatlan típusát.',
          valueLabel: 'Kívánt index',
          leftHint: 'Alacsonyabb',
          rightHint: 'Magasabb',
        });
      case 'real_estate_price_avg5mth_index':
        return Object.assign(base, {
          intro:
            'Kívánt ingatlanár-szint index. Szűrés: index; felirat: Ft/m². Válaszd ki az ingatlan típusát.',
          valueLabel: 'Kívánt index',
          leftHint: 'Olcsóbb',
          rightHint: 'Drágább',
        });
      default:
        return null;
    }
  }

  function appendParamValueIntro(parent, intro) {
    if (!parent || !intro) return;
    const p = document.createElement('p');
    p.className = 'param-band-intro';
    p.textContent = intro;
    parent.appendChild(p);
  }

  function createParamSliderLabel(text) {
    const span = document.createElement('span');
    span.className = 'param-band-slider-label';
    span.textContent = text;
    return span;
  }

  function mountWeightSliderUi(weightWrap, wStack, sliderUi) {
    const cfg = sliderUi || DEFAULT_WEIGHT_SLIDER_UI;
    weightWrap.insertBefore(createParamSliderLabel(cfg.weightLabel), wStack);
    appendParamRangeHints(wStack, cfg.weightLeftHint, cfg.weightRightHint);
  }

  function appendParamRangeHints(stack, leftHint, rightHint) {
    if (!stack || !leftHint || !rightHint) return;
    stack.classList.add('param-slider-stack--with-hints');
    const hints = document.createElement('div');
    hints.className = 'param-range-hints param-range-hints--below';
    const hLeft = document.createElement('span');
    hLeft.className = 'param-range-hint param-range-hint--min';
    hLeft.textContent = leftHint;
    const hRight = document.createElement('span');
    hRight.className = 'param-range-hint param-range-hint--max';
    hRight.textContent = rightHint;
    hints.appendChild(hLeft);
    hints.appendChild(hRight);
    stack.appendChild(hints);
  }

  /**
   * Egy sáv, két húzható pont (custom thumb). invertScale: bal = nagyobb perc, jobb = 0 perc.
   * @returns {{ stack: HTMLElement, minInput: HTMLInputElement, maxInput: HTMLInputElement }}
   */
  function buildDualRangeSliderStack(opts) {
    const scaleMin = opts.scaleMin;
    const scaleMax = opts.scaleMax;
    const step = opts.step != null ? opts.step : 1;
    const invertScale = !!opts.invertScale;
    let valueLo = opts.valueMin != null ? opts.valueMin : scaleMin;
    let valueHi = opts.valueMax != null ? opts.valueMax : scaleMax;
    if (valueLo > valueHi) {
      const t = valueLo;
      valueLo = valueHi;
      valueHi = t;
    }
    const formatValue = opts.formatValue || formatDurationMinutesForUi;
    const onChange = opts.onChange;
    const span = scaleMax - scaleMin;

    const stack = document.createElement('div');
    stack.className = 'param-slider-stack param-slider-stack--dual-range';

    const row = document.createElement('div');
    row.className = 'param-range-row param-range-row--dual';

    const endLeft = document.createElement('span');
    endLeft.className = 'param-range-end param-range-end--min';
    endLeft.textContent =
      opts.endpointMinText != null
        ? opts.endpointMinText
        : invertScale
          ? formatValue(scaleMax)
          : formatValue(scaleMin);

    const endRight = document.createElement('span');
    endRight.className = 'param-range-end param-range-end--max';
    endRight.textContent =
      opts.endpointMaxText != null
        ? opts.endpointMaxText
        : invertScale
          ? formatValue(scaleMin)
          : formatValue(scaleMax);

    const wrap = document.createElement('div');
    wrap.className = 'slider-wrap param-range-thumb-wrap dual-range-wrap';
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('data-scale-min', String(scaleMin));
    wrap.setAttribute('data-scale-max', String(scaleMax));

    const track = document.createElement('div');
    track.className = 'dual-range-track';

    const fill = document.createElement('div');
    fill.className = 'dual-range-fill';

    const bubbleLo = document.createElement('div');
    bubbleLo.className =
      'slider-bubble param-range-value-bubble dual-range-bubble dual-range-bubble--lo';
    bubbleLo.setAttribute('aria-hidden', 'true');

    const bubbleHi = document.createElement('div');
    bubbleHi.className =
      'slider-bubble param-range-value-bubble dual-range-bubble dual-range-bubble--hi';
    bubbleHi.setAttribute('aria-hidden', 'true');

    const thumbHi = document.createElement('button');
    thumbHi.type = 'button';
    thumbHi.className = 'dual-range-thumb dual-range-thumb--hi';
    thumbHi.setAttribute('aria-label', 'Felső határ');

    const thumbLo = document.createElement('button');
    thumbLo.type = 'button';
    thumbLo.className = 'dual-range-thumb dual-range-thumb--lo';
    thumbLo.setAttribute('aria-label', 'Alsó határ');

    const minInput = document.createElement('input');
    minInput.type = 'hidden';
    minInput.className = 'dual-range-value-input';
    minInput.value = String(valueLo);
    if (opts.minAttrs) {
      Object.keys(opts.minAttrs).forEach(function (ak) {
        minInput.setAttribute(ak, opts.minAttrs[ak]);
      });
    }

    const maxInput = document.createElement('input');
    maxInput.type = 'hidden';
    maxInput.className = 'dual-range-value-input';
    maxInput.value = String(valueHi);
    if (opts.maxAttrs) {
      Object.keys(opts.maxAttrs).forEach(function (ak) {
        maxInput.setAttribute(ak, opts.maxAttrs[ak]);
      });
    }

    wrap.appendChild(track);
    wrap.appendChild(fill);
    wrap.appendChild(bubbleLo);
    wrap.appendChild(bubbleHi);
    wrap.appendChild(thumbHi);
    wrap.appendChild(thumbLo);
    wrap.appendChild(minInput);
    wrap.appendChild(maxInput);

    row.appendChild(endLeft);
    row.appendChild(wrap);
    row.appendChild(endRight);
    stack.appendChild(row);

    if (opts.leftHint != null || opts.rightHint != null) {
      appendParamRangeHints(stack, opts.leftHint || '', opts.rightHint || '');
    }

    function valueToPct(v) {
      if (!Number.isFinite(span) || span <= 0) return 0;
      const t = invertScale ? (scaleMax - v) / span : (v - scaleMin) / span;
      return Math.max(0, Math.min(100, t * 100));
    }

    function pctToValue(pct) {
      const t = Math.max(0, Math.min(100, pct)) / 100;
      const raw = invertScale
        ? scaleMax - t * span
        : scaleMin + t * span;
      return snapToStep(raw, scaleMin, scaleMax, step);
    }

    function thumbLeftPx(pct) {
      const t = Math.max(0, Math.min(100, pct)) / 100;
      const rect = wrap.getBoundingClientRect();
      const thumb = PARAM_RANGE_THUMB_SIZE_PX;
      const width = rect.width;
      if (width <= thumb) return width / 2;
      return thumb / 2 + t * (width - thumb);
    }

    function pctFromClientX(clientX) {
      const rect = wrap.getBoundingClientRect();
      const thumb = PARAM_RANGE_THUMB_SIZE_PX;
      const width = rect.width;
      if (width <= thumb) return 0;
      let tClick;
      if (width <= thumb) {
        tClick = (clientX - rect.left) / width;
      } else {
        tClick = (clientX - rect.left - thumb / 2) / (width - thumb);
      }
      return Math.max(0, Math.min(100, tClick)) * 100;
    }

    function readValues() {
      let lo = parseFloat(minInput.value);
      let hi = parseFloat(maxInput.value);
      if (!Number.isFinite(lo)) lo = scaleMin;
      if (!Number.isFinite(hi)) hi = scaleMax;
      if (lo > hi) {
        const t = lo;
        lo = hi;
        hi = t;
        minInput.value = String(lo);
        maxInput.value = String(hi);
      }
      return { lo: lo, hi: hi };
    }

    function paint() {
      const vals = readValues();
      const pctHi = valueToPct(vals.hi);
      const pctLo = valueToPct(vals.lo);
      const leftPct = Math.min(pctHi, pctLo);
      const rightPct = Math.max(pctHi, pctLo);

      const xHi = thumbLeftPx(pctHi);
      const xLo = thumbLeftPx(pctLo);
      thumbHi.style.left = xHi + 'px';
      thumbLo.style.left = xLo + 'px';

      const xFillL = Math.min(xHi, xLo);
      const xFillR = Math.max(xHi, xLo);
      fill.style.left = xFillL + 'px';
      fill.style.width = Math.max(2, xFillR - xFillL) + 'px';

      bubbleLo.style.left = xLo + 'px';
      bubbleLo.style.transform = 'translateX(-50%)';
      bubbleLo.textContent = formatValue(vals.lo);
      bubbleHi.style.left = xHi + 'px';
      bubbleHi.style.transform = 'translateX(-50%)';
      bubbleHi.textContent = formatValue(vals.hi);

      minInput.setAttribute('aria-valuetext', formatValue(vals.lo));
      maxInput.setAttribute('aria-valuetext', formatValue(vals.hi));
    }

    function emitChange() {
      paint();
      if (onChange) onChange();
    }

    function setValue(which, v) {
      const vals = readValues();
      if (which === 'lo') {
        minInput.value = String(Math.min(v, vals.hi));
      } else {
        maxInput.value = String(Math.max(v, vals.lo));
      }
      emitChange();
    }

    /** Húzás közben az aktív pont buborékja és gombja legyen felül. */
    function setActiveDualThumb(which) {
      const loFront = which === 'lo';
      bubbleLo.style.zIndex = loFront ? '12' : '6';
      bubbleHi.style.zIndex = loFront ? '6' : '12';
      thumbLo.style.zIndex = loFront ? '8' : '5';
      thumbHi.style.zIndex = loFront ? '5' : '8';
      bubbleLo.classList.toggle('dual-range-bubble--front', loFront);
      bubbleHi.classList.toggle('dual-range-bubble--front', !loFront);
      thumbLo.classList.toggle('dual-range-thumb--front', loFront);
      thumbHi.classList.toggle('dual-range-thumb--front', !loFront);
    }

    function startDrag(which, startEvent) {
      startEvent.preventDefault();
      setActiveDualThumb(which);
      const move = function (ev) {
        const clientX = ev.clientX != null ? ev.clientX : 0;
        setValue(which, pctToValue(pctFromClientX(clientX)));
      };
      const end = function () {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', end);
        document.removeEventListener('pointercancel', end);
      };
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', end);
      document.addEventListener('pointercancel', end);
      move(startEvent);
    }

    thumbLo.addEventListener('pointerdown', function (e) {
      startDrag('lo', e);
    });
    thumbHi.addEventListener('pointerdown', function (e) {
      startDrag('hi', e);
    });

    track.addEventListener('pointerdown', function (e) {
      if (e.target !== track && e.target !== fill) return;
      const v = pctToValue(pctFromClientX(e.clientX));
      const vals = readValues();
      const dLo = Math.abs(v - vals.lo);
      const dHi = Math.abs(v - vals.hi);
      startDrag(dLo <= dHi ? 'lo' : 'hi', e);
    });

    window.addEventListener(
      'scroll',
      function () {
        paint();
      },
      true
    );
    window.addEventListener('resize', function () {
      paint();
    });

    wrap._dualRangeRepaint = emitChange;

    requestAnimationFrame(emitChange);

    return { stack: stack, minInput: minInput, maxInput: maxInput, wrap: wrap };
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

  /** SCHOOL_PROXIMITY_INDEX_* oszlop → UI mutató azonosító (nem egyezik a prefix-szabállyal). */
  function schoolUiParamIdForIndexKey(dbKey) {
    if (!dbKey) return null;
    for (let i = 0; i < SCHOOL_PRIMARY_VARIANTS.length; i++) {
      if (SCHOOL_PRIMARY_VARIANTS[i].indexKey === dbKey) {
        return 'primary_school_proximity_index';
      }
    }
    for (let i = 0; i < SCHOOL_GYMNASIUM_VARIANTS.length; i++) {
      if (SCHOOL_GYMNASIUM_VARIANTS[i].indexKey === dbKey) {
        return 'high_school_proximity_index';
      }
    }
    return null;
  }

  function schoolVariantDefForIndexKey(dbKey) {
    if (!dbKey) return null;
    const defs = SCHOOL_PRIMARY_VARIANTS.concat(SCHOOL_GYMNASIUM_VARIANTS);
    for (let i = 0; i < defs.length; i++) {
      if (defs[i].indexKey === dbKey) return defs[i];
    }
    return null;
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
    if (!map || isMobileMapPanelMode()) return;
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
    if (!map || isMobileMapPanelMode()) return;
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
      if (k && guidedParamKeys.indexOf(k) === -1) guidedParamKeys.push(k);
    });
    host.querySelectorAll('.param-item[data-param-band-filter="1"]').forEach(function (card) {
      const minEl = card.querySelector('[data-param-band-min-for]');
      if (!minEl) return;
      const k = minEl.getAttribute('data-param-band-min-for');
      if (k && guidedParamKeys.indexOf(k) === -1) guidedParamKeys.push(k);
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
    if (nowOn && card.getAttribute('data-param-band-filter') === '1') {
      applyBandFilterEnableDefaults(card, true);
    }
    syncHeaderAllParamsToggleBtnUi();
  }

  function getParamItemCards() {
    if (!elements.paramCategoriesHost) return [];
    return Array.from(elements.paramCategoriesHost.querySelectorAll('.param-item'));
  }

  function areAllParamCardsActive() {
    const cards = getParamItemCards();
    if (!cards.length) return false;
    for (let i = 0; i < cards.length; i++) {
      if (cards[i].getAttribute('data-param-active') !== '1') return false;
    }
    return true;
  }

  function setAllParamCardsActive(on) {
    const cards = getParamItemCards();
    const nowOn = !!on;
    for (let i = 0; i < cards.length; i++) {
      setParamCardSwitchOn(cards[i], nowOn);
      if (nowOn && cards[i].getAttribute('data-param-band-filter') === '1') {
        applyBandFilterEnableDefaults(cards[i], true);
      }
    }
    if (!nowOn) setParamSoloKey(null);
    syncHeaderAllParamsToggleBtnUi();
    syncHeaderClearAllSoloBtnUi();
    syncHeatmapWithActiveParams();
    if (sliderAutoSearchActive) scheduleSearchFromSliders();
  }

  /** Aktív sávos kártya: dual range + rejtett értékek (összes bekapcsoláskor is). */
  function ensureBandFilterCardReady(card) {
    if (!card || card.getAttribute('data-param-band-filter') !== '1') return;
    const key = getActiveParamKeyFromCard(card);
    if (!key) return;
    const cfg = getBandFilterConfigForDbKey(key);
    if (!cfg) return;
    const bandBlock = card._bandBlock || card.querySelector('.param-band-slider-block');
    if (!bandBlock) return;
    const hasDual = bandBlock.querySelector('.dual-range-wrap');
    if (!hasDual) {
      const titleEl = card.querySelector('.param-item__title');
      const labelText = titleEl && titleEl.textContent ? titleEl.textContent.trim() : '';
      mountBandDualRangeOnBlock(bandBlock, key, 0, labelText, cfg, function () {
        if (sliderAutoSearchActive) scheduleSearchFromSliders();
      });
    }
  }

  function toggleAllParamCardsActive() {
    setAllParamCardsActive(!areAllParamCardsActive());
  }

  function syncHeaderClearAllSoloBtnUi() {
    const btn = elements.paramClearAllSoloBtn;
    if (!btn) return;
    const hasSolo = !!soloHeatmapParamKey;
    btn.classList.toggle('sidebar-header__cluster-btn--on', hasSolo);
    btn.setAttribute('aria-pressed', hasSolo ? 'true' : 'false');
    btn.disabled = !hasSolo;
    btn.title = hasSolo
      ? 'Összes szóló kikapcsolása'
      : 'Nincs bekapcsolt szóló nézet';
  }

  function syncHeaderAllParamsToggleBtnUi() {
    const btn = elements.paramToggleAllBtn;
    if (!btn) return;
    const allOn = areAllParamCardsActive();
    btn.classList.toggle('sidebar-header__cluster-btn--on', allOn);
    btn.setAttribute('aria-pressed', allOn ? 'true' : 'false');
    const ico = btn.querySelector('.sidebar-header__cluster-ico');
    if (ico) {
      ico.textContent = allOn ? 'toggle_on' : 'toggle_off';
    }
    btn.title = allOn
      ? 'Összes mutató kikapcsolása'
      : 'Összes mutató bekapcsolása';
  }

  function onHeaderClearAllSoloClick() {
    if (!soloHeatmapParamKey) return;
    setParamSoloKey(null);
    refreshHeatmapFromCurrentSliders();
    syncHeaderClearAllSoloBtnUi();
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
      if (isTouchMobileAppStarted()) {
        mobileGeoSetupTurnedOnBySheet = true;
        enterMobileGeoSetup('b');
      }
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
        if (isTouchMobileAppStarted() && shouldAutoOpenMobileGeoSetup('b')) {
          mobileGeoSetupTurnedOnBySheet = true;
          enterMobileGeoSetup('b');
        }
      } else if (mobileGeoAutoOpenSlot === 'a' || shouldAutoOpenMobileGeoSetup('a')) {
        mobileGeoAutoOpenSlot = null;
        tryOpenMobileGeoSetupIfNeeded('a');
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
    if (uiParamId === 'primary_school_proximity_index') {
      const defs = schoolVariantDefsForUiParam(uiParamId);
      for (let si = 0; si < defs.length; si++) {
        if (defs[si].indexKey === dbKey) return true;
      }
      return false;
    }
    if (uiParamId === 'high_school_proximity_index') {
      const defs = schoolVariantDefsForUiParam(uiParamId);
      for (let si = 0; si < defs.length; si++) {
        if (defs[si].indexKey === dbKey) return true;
      }
      return false;
    }

    const pref = uiParamIdToKeyPrefixUpper(uiParamId);
    return k.startsWith(pref);
  }

  function getUiParamEntryForDbKey(dbKey) {
    const schoolUiId = schoolUiParamIdForIndexKey(dbKey);
    if (schoolUiId) return getUiParamEntryById(schoolUiId);
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
      if (isUiParamDisabled(e.id)) continue;
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
      if (isUiParamDisabled(e.id)) continue;
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

  /** @type {{ winningCity: object, targets: object, finalScore: number, maxPossible: number, matchPercent: number | null } | null} */
  let lastSearchFeedbackMeta = null;
  /** @type {'search-details' | 'winner-info' | null} */
  let rightPanelMode = null;

  function openRightPanel() {
    const panel = elements.feedbackPanel;
    if (!panel) return;
    panel.removeAttribute('hidden');
    panel.classList.remove('feedback-panel--collapsed');
    const fbBtn = document.getElementById('feedback-collapse-btn');
    if (fbBtn) {
      fbBtn.setAttribute('aria-expanded', 'true');
      const g = fbBtn.querySelector('.feedback-panel__edge-tab-glyph');
      if (g) g.textContent = '›';
    }
    if (map) setTimeout(function () { map.resize(); }, 80);
  }

  function syncWinnerInfoToggleUi() {
    const btn = document.getElementById('winner-info-toggle-btn');
    if (!btn) return;
    const hasMeta = !!lastSearchFeedbackMeta;
    btn.disabled = !hasMeta;
    const active = hasMeta && rightPanelMode === 'search-details';
    btn.classList.toggle('feedback-panel__edge-tab--on', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    btn.title = hasMeta
      ? active
        ? 'Tökéletes hely mutatói vissza a panelben'
        : 'Találat részletei megnyitása'
      : 'Találat részletei (előbb keress)';
  }

  function renderWinnerInfoInRightPanel(city, matchPercent) {
    const inner = elements.feedbackPanelInner;
    if (!inner || !city) return;
    rightPanelMode = 'winner-info';
    syncWinnerInfoToggleUi();
    const pct =
      matchPercent != null
        ? matchPercent
        : lastSearchFeedbackMeta && lastSearchFeedbackMeta.matchPercent != null
          ? lastSearchFeedbackMeta.matchPercent
          : null;
    fillWinnerInfoContainer(inner, city, pct);
    if (isTouchMobileAppStarted()) {
      renderMobileWinnerSheet(city, pct);
      return;
    }
    openRightPanel();
  }

  function showSearchDetailsInRightPanel() {
    const meta = lastSearchFeedbackMeta;
    if (!meta) return;
    renderFeedbackPanel(
      meta.winningCity,
      meta.targets,
      meta.finalScore,
      meta.maxPossible,
      meta.matchPercent
    );
  }

  function toggleWinnerInfoInRightPanel() {
    if (!lastSearchFeedbackMeta) return;
    if (rightPanelMode === 'search-details') {
      renderWinnerInfoInRightPanel(lastSearchFeedbackMeta.winningCity);
    } else {
      showSearchDetailsInRightPanel();
    }
  }

  function hideFeedbackPanel() {
    rightPanelMode = null;
    syncWinnerInfoToggleUi();
    hideMobileWinnerSheet();
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
      if (!pack) continue;

      if (pack.mode === 'band') {
        const filterCol = pack.companionKey || key;
        const parseValue = pack.parseValue || parseNumeric;
        const bandCfg = getBandFilterConfigForDbKey(key);
        const displayModel = bandCfg
          ? createBandFilterDisplayModel(key, bandCfg)
          : null;
        const fmtUi = function (v) {
          return formatBandFilterUiValue(
            v,
            bandCfg,
            key,
            pack.scaleMax,
            displayModel
          );
        };
        const gotIndex = filterCol ? parseValue(winningCity[filterCol]) : null;
        const dispInfo = findCompanionInfoForIndexKey(key);
        let gotText = '–';
        if (dispInfo && dispInfo.pair) {
          const parseFn = dispInfo.pair.parse || parseNumeric;
          gotText = dispInfo.pair.formatPair(
            parseFn(winningCity[dispInfo.pair.a]),
            parseFn(winningCity[dispInfo.pair.b])
          );
        } else if (dispInfo && dispInfo.companionKey && dispInfo.format) {
          const parseFn = dispInfo.parse || parseNumeric;
          const dv = parseFn(winningCity[dispInfo.companionKey]);
          gotText = dv != null ? dispInfo.format(dv) : '–';
        } else if (gotIndex != null) {
          gotText = fmtUi(gotIndex);
        }
        const flex =
          pack.flex != null && Number.isFinite(pack.flex)
            ? Math.max(0, Math.min(1, pack.flex))
            : 1;
        const eff = effectiveBandMinuteBounds(
          pack.bandMin,
          pack.bandMax,
          flex,
          pack.scaleMin,
          pack.scaleMax
        );
        const inBand =
          gotIndex != null && gotIndex >= eff.effMin && gotIndex <= eff.effMax;
        const diffText =
          gotIndex == null ? 'nincs adat' : inBand ? 'a sávban' : 'kívül';
        rows.push({
          key: key,
          isBand: true,
          wantText: fmtUi(pack.bandMin) + ' – ' + fmtUi(pack.bandMax),
          got: gotIndex,
          gotText: gotText,
          diffText: diffText,
          weight: flex,
          wdiff: 0,
        });
        continue;
      }

      if (pack.value == null) continue;
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
        isBand: false,
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
      td1.textContent = row.isBand
        ? row.wantText
        : String(Math.round(row.want * 1000) / 1000);

      const td2 = document.createElement('td');
      td2.className = 'feedback-table__num';
      td2.textContent = row.isBand
        ? row.gotText
        : row.got != null
          ? String(Math.round(row.got * 1000) / 1000)
          : '–';

      const td3 = document.createElement('td');
      td3.className = 'feedback-table__num';
      td3.textContent = row.isBand
        ? row.diffText
        : row.diff != null
          ? String(Math.round(row.diff * 1000) / 1000)
          : '–';

      const td4 = document.createElement('td');
      td4.className = 'feedback-table__num';
      td4.textContent =
        row.weight != null && Number.isFinite(row.weight)
          ? String(Math.round(row.weight * PARAM_WEIGHT_SLIDER_MAX))
          : '–';

      const td5 = document.createElement('td');
      td5.className = 'feedback-table__num';
      td5.textContent = row.isBand
        ? '–'
        : row.wdiff != null
          ? String(Math.round(row.wdiff * 1000) / 1000)
          : '–';

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

    rightPanelMode = 'search-details';
    syncWinnerInfoToggleUi();
    openRightPanel();
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
    scopeEl.querySelectorAll('[data-param-band-min-for]').forEach(function (el) {
      el.setAttribute('data-baseline-band-min', String(el.value));
    });
    scopeEl.querySelectorAll('[data-param-band-max-for]').forEach(function (el) {
      el.setAttribute('data-baseline-band-max', String(el.value));
    });
    scopeEl.querySelectorAll('input[type="range"][data-param-flex-for]').forEach(function (el) {
      el.setAttribute('data-baseline-flex', String(el.value));
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
      scopeEl.querySelectorAll('[data-param-band-min-for]').forEach(function (el) {
        const b = el.getAttribute('data-baseline-band-min');
        if (b == null || b === '') return;
        el.value = b;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });
      scopeEl.querySelectorAll('[data-param-band-max-for]').forEach(function (el) {
        const b = el.getAttribute('data-baseline-band-max');
        if (b == null || b === '') return;
        el.value = b;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });
      scopeEl.querySelectorAll('.dual-range-wrap').forEach(function (wrap) {
        if (typeof wrap._dualRangeRepaint === 'function') wrap._dualRangeRepaint();
      });
      scopeEl.querySelectorAll('input[type="range"][data-param-flex-for]').forEach(function (el) {
        const b = el.getAttribute('data-baseline-flex');
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
        if (card && card.getAttribute('data-param-band-filter') === '1') return;
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
      scopeEl.querySelectorAll('.param-item[data-param-band-filter="1"]').forEach(function (card) {
        if (card.getAttribute('data-param-active') === '0') return;
        const minEl = card.querySelector('[data-param-band-min-for]');
        const maxEl = card.querySelector('[data-param-band-max-for]');
        const dualWrap = card.querySelector('.dual-range-wrap');
        if (!minEl || !maxEl) return;
        const lo = dualWrap
          ? parseFloat(dualWrap.getAttribute('data-scale-min'))
          : parseFloat(minEl.min);
        const hi = dualWrap
          ? parseFloat(dualWrap.getAttribute('data-scale-max'))
          : parseFloat(maxEl.max);
        if (!Number.isFinite(lo) || !Number.isFinite(hi)) return;
        const span = hi - lo;
        if (span <= 0) return;
        const bandW = span * (0.15 + Math.random() * 0.35);
        const start = lo + Math.random() * (span - bandW);
        const a = snapToStep(start, lo, hi, 1);
        const b = snapToStep(start + bandW, lo, hi, 1);
        minEl.value = String(Math.min(a, b));
        maxEl.value = String(Math.max(a, b));
        minEl.dispatchEvent(new Event('input', { bubbles: true }));
        maxEl.dispatchEvent(new Event('input', { bubbles: true }));
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
    appendParamHeadSoloAndInfo(
      headRow,
      uiParamId,
      variantMap[defaultVariantId].indexKey
    );
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
        if (!nowOn) clearSoloIfMatchesParamKey(getActiveParamKeyFromCard(wrap));
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

    const variantSliderUi = getValueSliderUiConfig(uiParamId);
    if (variantSliderUi && variantSliderUi.intro) {
      appendParamValueIntro(itemBody, variantSliderUi.intro);
    }

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
      updateParamSoloButtonKey(card, key);
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
    weightWrap.appendChild(wStack);
    mountWeightSliderUi(weightWrap, wStack, variantSliderUi);

    if (variantSliderUi && variantSliderUi.valueLabel) {
      itemBody.insertBefore(createParamSliderLabel(variantSliderUi.valueLabel), stack);
    }
    if (variantSliderUi) {
      appendParamRangeHints(stack, variantSliderUi.leftHint, variantSliderUi.rightHint);
    }
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

  function appendBandFilterFlexBlock(itemBody, key, sliderIdNum, labelText, flexTitle) {
    const weightWrap = document.createElement('div');
    weightWrap.className = 'param-item__weight';

    const flexLabel = document.createElement('span');
    flexLabel.className = 'param-band-slider-label';
    flexLabel.textContent = 'Rugalmasság';

    const flexInput = document.createElement('input');
    flexInput.type = 'range';
    flexInput.className = 'slider param-weight-slider';
    flexInput.id = 'param-flex-' + sliderIdNum;
    flexInput.setAttribute('data-param-flex-for', key);
    flexInput.setAttribute('aria-label', 'Rugalmasság: ' + labelText);
    flexInput.title = flexTitle;
    flexInput.min = '0';
    flexInput.max = String(PARAM_WEIGHT_SLIDER_MAX);
    flexInput.step = '1';
    flexInput.value = String(PARAM_BAND_FLEX_DEFAULT);

    const flexStack = buildParamRangeRowWithExtrema(flexInput, 1, 0, PARAM_WEIGHT_SLIDER_MAX);
    appendParamRangeHints(flexStack, 'Laza', 'Szigorú');

    weightWrap.appendChild(flexLabel);
    weightWrap.appendChild(flexStack);
    itemBody.appendChild(weightWrap);
    bindParamRangeTrackSeek(flexInput);
    function onBandFlexChange() {
      if (!citiesData.length) return;
      if (heatmapEnabled) {
        refreshHeatmapFromCurrentSliders();
      }
      if (sliderAutoSearchActive) {
        scheduleSearchFromSliders();
      }
    }
    flexInput.addEventListener('input', onBandFlexChange);
    flexInput.addEventListener('change', onBandFlexChange);
    return flexInput;
  }

  function mountBandDualRangeOnBlock(
    bandBlock,
    indexKey,
    sliderIdNum,
    labelText,
    cfg,
    onChange
  ) {
    const dataMr = computeBandFilterDataRange(cfg, indexKey);
    const disp = bandFilterDisplayEndpoints(cfg, dataMr, indexKey);
    const dv = bandFilterDefaultValues(dataMr, cfg, indexKey);
    const displayModel = disp.displayModel;
    const fmtUi = function (v) {
      return formatBandFilterUiValue(v, cfg, indexKey, disp.scaleMax, displayModel);
    };
    const dual = buildDualRangeSliderStack({
      scaleMin: disp.scaleMin,
      scaleMax: disp.scaleMax,
      endpointMinText: disp.labelMin,
      endpointMaxText: disp.labelMax,
      step: cfg.step,
      valueMin: dv.valueMin,
      valueMax: dv.valueMax,
      invertScale: cfg.invertScale,
      formatValue: fmtUi,
      leftHint: cfg.leftHint,
      rightHint: cfg.rightHint,
      minAttrs: {
        id: 'param-band-min-' + sliderIdNum + '-' + indexKey,
        'data-param-band-min-for': indexKey,
        'data-param-key': indexKey,
        'aria-label': labelText + ' — alsó határ',
      },
      maxAttrs: {
        id: 'param-band-max-' + sliderIdNum + '-' + indexKey,
        'data-param-band-max-for': indexKey,
        'aria-label': labelText + ' — felső határ',
      },
      onChange: onChange,
    });
    const sliderLabel = bandBlock.querySelector('.param-band-slider-label');
    bandBlock.innerHTML = '';
    if (sliderLabel) bandBlock.appendChild(sliderLabel);
    else {
      const bandLabel = document.createElement('span');
      bandLabel.className = 'param-band-slider-label';
      bandLabel.textContent = cfg.bandLabel;
      bandBlock.appendChild(bandLabel);
    }
    bandBlock.appendChild(dual.stack);
    return dual;
  }

  /**
   * Sávos szűrő kártya: elfogadható tartomány (dual range) + rugalmasság.
   */
  function createBandFilterParamCard(key, sliderIdNum) {
    const cfg = getBandFilterConfigForDbKey(key);
    if (!cfg || !cfg.filterCol) return createParamItemCard(key, sliderIdNum);

    paramCategoryUid++;
    const bodyId = 'param-item-body-' + paramCategoryUid;
    const labelText = paramLabelForDbKey(key);

    const wrap = document.createElement('div');
    wrap.className = 'control-group param-item param-item--band-filter';
    wrap.setAttribute('data-param-active', '0');
    wrap.setAttribute('data-param-band-filter', '1');
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
    appendParamHeadSoloAndInfo(headRow, key, key);
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
        if (!nowOn) clearSoloIfMatchesParamKey(key);
        if (nowOn) applyBandFilterEnableDefaults(wrap, true);
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

    const bandIntro = document.createElement('p');
    bandIntro.className = 'param-band-intro';
    bandIntro.textContent = cfg.intro;
    itemBody.appendChild(bandIntro);

    const bandBlock = document.createElement('div');
    bandBlock.className = 'param-band-slider-block';
    const bandLabel = document.createElement('span');
    bandLabel.className = 'param-band-slider-label';
    bandLabel.textContent = cfg.bandLabel;
    bandBlock.appendChild(bandLabel);
    itemBody.appendChild(bandBlock);

    const onBandChange = function () {
      if (sliderAutoSearchActive) scheduleSearchFromSliders();
    };
    mountBandDualRangeOnBlock(bandBlock, key, sliderIdNum, labelText, cfg, onBandChange);

    appendBandFilterFlexBlock(itemBody, key, sliderIdNum, labelText, cfg.flexTitle);

    wrap.appendChild(headRow);
    wrap.appendChild(itemBody);

    toggle.addEventListener('click', function () {
      preserveSidebarScrollAnchor(headRow, function () {
        const nowCollapsed = wrap.classList.toggle('param-item--collapsed');
        toggle.setAttribute('aria-expanded', nowCollapsed ? 'false' : 'true');
      });
    });

    return wrap;
  }

  /**
   * Sávos szűrő + típusváltó (iskola, ingatlan).
   */
  function createBandFilterVariantParamCard(uiParamId, matchingKeys, sliderIdNum) {
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
    let itemExtraClass = 'param-item--ingatlan-variant param-item--band-filter';
    let segmentAriaLabel = 'Ingatlan típus: telek, lakás, ház';
    let defaultVariantId = 'haz';

    if (isSchool) {
      variantMap = buildSchoolVariantMap(uiParamId);
      labelDefs = schoolVariantDefsForUiParam(uiParamId);
      segmentOrder = SCHOOL_SEGMENT_ORDER;
      segmentIndexMap = SCHOOL_SEGMENT_INDEX;
      segmentCols = 2;
      itemExtraClass = 'param-item--school-variant param-item--band-filter';
      segmentAriaLabel = 'Iskola típus: állami, alternatív';
      defaultVariantId = variantMap.allami ? 'allami' : 'alternativ';
    } else {
      if (!matchingKeys || !matchingKeys.length) return null;
      const isGrow = uiParamId === 'real_estate_price_grow_5yrs_index';
      const variantDefs = isGrow ? INGATLAN_GROW_VARIANTS : INGATLAN_AVG_VARIANTS;
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

    const wrap = document.createElement('div');
    wrap.className = 'control-group param-item ' + itemExtraClass;
    wrap.setAttribute('data-param-active', '0');
    wrap.setAttribute('data-param-band-filter', '1');
    wrap.classList.add('param-item--inactive');
    wrap.classList.add('param-item--collapsed');
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
    appendParamHeadSoloAndInfo(
      headRow,
      uiParamId,
      variantMap[defaultVariantId].indexKey
    );
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
        if (!nowOn) clearSoloIfMatchesParamKey(getActiveParamKeyFromCard(wrap));
        if (nowOn) applyBandFilterEnableDefaults(wrap, true);
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

    const bandIntro = document.createElement('p');
    bandIntro.className = 'param-band-intro';
    const bandBlock = document.createElement('div');
    bandBlock.className = 'param-band-slider-block';
    wrap._bandBlock = bandBlock;
    wrap._bandIntro = bandIntro;

    function applyVariantBand(card, variantId, segmentBtns, segTrackEl, segIdxMap) {
      const vm = card._ingVariantMap[variantId];
      if (!vm) return;
      const indexKey = vm.indexKey;
      const cfg = getBandFilterConfigForDbKey(indexKey);
      if (!cfg) return;

      card._ingActiveVariant = variantId;
      const segIdx = segIdxMap[variantId];
      if (segTrackEl != null && Number.isFinite(segIdx)) {
        segTrackEl.style.setProperty('--seg-idx', String(segIdx));
      }
      Object.keys(segmentBtns).forEach(function (id) {
        const btn = segmentBtns[id];
        if (!btn) return;
        const on = id === variantId;
        btn.classList.toggle('param-variant-segment__btn--active', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      });

      if (card._bandIntro) card._bandIntro.textContent = cfg.intro;

      const flexEl = card.querySelector('input[data-param-flex-for]');
      if (flexEl) flexEl.setAttribute('data-param-flex-for', indexKey);

      mountBandDualRangeOnBlock(
        card._bandBlock,
        indexKey,
        sliderIdNum,
        labelText,
        cfg,
        function () {
          if (sliderAutoSearchActive) scheduleSearchFromSliders();
        }
      );
      updateParamSoloButtonKey(card, indexKey);
    }

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
        applyVariantBand(wrap, segId, segmentBtns, segTrack, segmentIndexMap);
        if (sliderAutoSearchActive) scheduleSearchFromSliders();
      });
    }
    segmentWrap.appendChild(segTrack);
    itemBody.appendChild(segmentWrap);
    itemBody.appendChild(bandIntro);
    itemBody.appendChild(bandBlock);

    const firstCfg = getBandFilterConfigForDbKey(variantMap[defaultVariantId].indexKey);
    appendBandFilterFlexBlock(
      itemBody,
      variantMap[defaultVariantId].indexKey,
      sliderIdNum,
      labelText,
      firstCfg ? firstCfg.flexTitle : ''
    );

    applyVariantBand(wrap, defaultVariantId, segmentBtns, segTrack, segmentIndexMap);

    wrap.appendChild(headRow);
    wrap.appendChild(itemBody);
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
    appendParamHeadSoloAndInfo(headRow, key, key);
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
        if (!nowOn) clearSoloIfMatchesParamKey(key);
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

    const uiParamEnt = getUiParamEntryForDbKey(key);
    const sliderUi = uiParamEnt ? getValueSliderUiConfig(uiParamEnt.id) : null;
    if (sliderUi && sliderUi.intro) {
      appendParamValueIntro(itemBody, sliderUi.intro);
    }

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
    if (sliderUi && sliderUi.valueLabel) {
      itemBody.appendChild(createParamSliderLabel(sliderUi.valueLabel));
    }
    itemBody.appendChild(valueStack);
    if (sliderUi) {
      appendParamRangeHints(valueStack, sliderUi.leftHint, sliderUi.rightHint);
    }

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
    weightWrap.appendChild(wStack);
    mountWeightSliderUi(weightWrap, wStack, sliderUi);
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
        li.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          applyGeoSlotFromCity(slot, city, null);
          list.hidden = true;
          syncGeoSuggestOverflow();
          window.setTimeout(function () {
            inp.blur();
          }, 0);
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
      const nowOn = activeSwitch.getAttribute('aria-checked') === 'true';
      refreshGeoFilterWarning();
      scheduleSearchFromSliders();
      updateImportantPlaceCircles();
      if (isTouchMobileAppStarted()) {
        if (nowOn) {
          mobileGeoSetupTurnedOnBySheet = turningOn;
          enterMobileGeoSetup(slot);
        } else if (mobileGeoSetupSlot === slot) {
          exitMobileGeoSetup(false);
        }
      }
    });

    if (slot === 'b') {
      wrap.classList.add('param-item--collapsed');
      collapseToggle.setAttribute('aria-expanded', 'false');
    }

    bindMobileGeoCardEditorTriggers(wrap, slot, inp, pickBtn, rInput);

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
    soloHeatmapParamKey = null;
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
        const card = isBandFilterUiParamId(item.uiParamId)
          ? createBandFilterVariantParamCard(item.uiParamId, item.keys, sliderIndex)
          : createVariantSegmentParamCard(item.uiParamId, item.keys, sliderIndex, item.preset);
        if (card) groupBody.appendChild(card);
        sliderIndex++;
      } else if (item.type === 'slider' && groupBody) {
        const card = isBandFilterParamKey(item.key)
          ? createBandFilterParamCard(item.key, sliderIndex)
          : createParamItemCard(item.key, sliderIndex);
        if (card) groupBody.appendChild(card);
        sliderIndex++;
      }
    }
    captureParamSlidersBaseline(root);
    rebuildGuidedParamKeysFromDom();
    guidedFlowUnlocked = false;
    guidedFlowParamIndex = 0;
    syncHeaderAllParamsToggleBtnUi();
    syncHeaderClearAllSoloBtnUi();
  }

  function collectSliderTargets() {
    /** @type {Record<string, { value?: number, weight?: number, mode?: string, bandMin?: number, bandMax?: number, flex?: number, companionKey?: string }>} */
    const targets = {};
    if (!elements.paramCategoriesHost) return targets;

    const bandCards = elements.paramCategoriesHost.querySelectorAll(
      '.param-item[data-param-band-filter="1"]'
    );
    bandCards.forEach(function (card) {
      if (card.getAttribute('data-param-active') === '0') return;
      const key = getActiveParamKeyFromCard(card);
      if (!key) return;
      const minEl = card.querySelector('[data-param-band-min-for]');
      const maxEl = card.querySelector('[data-param-band-max-for]');
      const flexEl = card.querySelector('input[type="range"][data-param-flex-for]');
      if (!minEl || !maxEl) return;
      const bandMin = parseNumeric(minEl.value);
      const bandMax = parseNumeric(maxEl.value);
      if (bandMin == null || bandMax == null) return;
      const cfg = getBandFilterConfigForDbKey(key);
      let scaleMin = 0;
      let scaleMax = 240;
      if (cfg && cfg.filterCol) {
        const cfgScale = computeBandFilterDataRange(cfg, key);
        scaleMin = cfgScale.min;
        scaleMax = cfgScale.max;
      }
      let flex = PARAM_BAND_FLEX_DEFAULT / PARAM_WEIGHT_SLIDER_MAX;
      if (flexEl) {
        const fw = parseFloat(flexEl.value);
        if (Number.isFinite(fw)) {
          flex =
            Math.max(0, Math.min(PARAM_WEIGHT_SLIDER_MAX, Math.round(fw))) /
            PARAM_WEIGHT_SLIDER_MAX;
        }
      }
      targets[key] = {
        mode: 'band',
        indexKey: key,
        bandMin: bandMin,
        bandMax: bandMax,
        flex: flex,
        scaleMin: scaleMin,
        scaleMax: scaleMax,
        companionKey: cfg ? cfg.filterCol : bandFilterCompanionKey(key),
        parseValue: cfg ? cfg.parseValue : parseNumeric,
        formatValue: cfg ? cfg.formatValue : formatDurationMinutesForUi,
        scorePrefer: cfg ? cfg.scorePrefer : 'lower',
      };
    });

    const sliders = elements.paramCategoriesHost.querySelectorAll('input[type="range"][data-param-key]');
    sliders.forEach(function (el) {
      const key = el.getAttribute('data-param-key');
      if (!key || targets[key]) return;
      const card = el.closest('.param-item');
      if (card && card.getAttribute('data-param-band-filter') === '1') return;
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

  function cityPassesActiveBandFilters(city, targets) {
    for (const key in targets) {
      if (!Object.prototype.hasOwnProperty.call(targets, key)) continue;
      const pack = targets[key];
      if (!pack || pack.mode !== 'band') continue;
      if (!passesBandFilterForCity(city, pack)) return false;
    }
    return true;
  }

  function computeWeightedIndexDiffSum(city, targets) {
    let sum = 0;
    let used = 0;
    for (const key in targets) {
      if (!Object.prototype.hasOwnProperty.call(targets, key)) continue;
      const pack = targets[key];
      if (!pack || pack.mode === 'band') continue;
      if (pack.value == null) continue;
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
    return { sum: sum, used: used };
  }

  /** Keresési összpont: _index eltérések; sáv-only: rugalmasság + sáv illeszkedés. */
  function computeCitySearchScore(city, targets) {
    const scored = computeWeightedIndexDiffSum(city, targets);
    if (scored.used > 0) {
      return { sum: scored.sum, used: scored.used };
    }
    let bandSum = 0;
    let bandUsed = 0;
    for (const key in targets) {
      if (!Object.prototype.hasOwnProperty.call(targets, key)) continue;
      const pack = targets[key];
      if (!pack || pack.mode !== 'band') continue;
      const fit = computeBandFilterFitScore(city, pack);
      if (fit == null || !Number.isFinite(fit)) continue;
      bandSum += fit;
      bandUsed++;
    }
    if (bandUsed > 0) {
      return { sum: bandSum, used: bandUsed };
    }
    return { sum: Infinity, used: 0 };
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

  function getActiveParamKeyFromCard(card) {
    if (!card) return null;
    const minEl = card.querySelector('[data-param-band-min-for]');
    if (minEl) {
      const bk = minEl.getAttribute('data-param-band-min-for');
      if (bk) return bk;
    }
    if (card._ingVariantMap && card._ingActiveVariant) {
      const vm = card._ingVariantMap[card._ingActiveVariant];
      if (vm && vm.indexKey) return vm.indexKey;
    }
    const sl = card.querySelector('input[type="range"][data-param-key]');
    if (sl) {
      const sk = sl.getAttribute('data-param-key');
      if (sk) return sk;
    }
    return null;
  }

  function clearAllParamSoloButtons() {
    document.querySelectorAll('.param-solo-btn[aria-pressed="true"]').forEach(function (btn) {
      btn.classList.remove('param-solo-btn--on');
      btn.setAttribute('aria-pressed', 'false');
    });
  }

  function setParamSoloKey(key) {
    soloHeatmapParamKey = key || null;
    clearAllParamSoloButtons();
    if (key) {
      document.querySelectorAll('.param-solo-btn[data-param-solo-for]').forEach(function (btn) {
        if (btn.getAttribute('data-param-solo-for') !== key) return;
        btn.classList.add('param-solo-btn--on');
        btn.setAttribute('aria-pressed', 'true');
      });
    }
    syncHeaderClearAllSoloBtnUi();
  }

  function clearSoloIfMatchesParamKey(key) {
    if (!key || soloHeatmapParamKey !== key) return;
    setParamSoloKey(null);
  }

  function updateParamSoloButtonKey(card, paramKey) {
    const btn = card ? card.querySelector('.param-solo-btn') : null;
    if (!btn || !paramKey) return;
    const wasOn = btn.getAttribute('aria-pressed') === 'true';
    btn.setAttribute('data-param-solo-for', paramKey);
    if (wasOn) {
      soloHeatmapParamKey = paramKey;
      refreshHeatmapFromCurrentSliders();
    }
  }

  function applySoloFilterToTargets(targets) {
    if (!soloHeatmapParamKey || !targets) return targets;
    const pack = targets[soloHeatmapParamKey];
    if (!pack) return targets;
    const out = {};
    out[soloHeatmapParamKey] = pack;
    return out;
  }

  /** Nincs aktív mutató → hőtérkép ki + state törlés; egyébként frissítés ha be van kapcsolva. */
  function syncHeatmapWithActiveParams() {
    const targets = collectSliderTargets();
    if (Object.keys(targets).length === 0) {
      clearHeatmapFeatureStates();
      if (heatmapEnabled) {
        setHeatmapEnabled(false);
      }
      return;
    }
    if (heatmapEnabled && citiesData.length) {
      updateHeatmapFromTargets(targets);
    }
  }

  function refreshHeatmapFromCurrentSliders() {
    syncHeatmapWithActiveParams();
  }

  function onParamSoloButtonClick(btn) {
    if (!sliderAutoSearchActive) {
      btn.title = 'Előbb futtasd a „Tökéletes hely keresése” funkciót.';
      return;
    }
    const card = btn.closest('.param-item');
    const key = getActiveParamKeyFromCard(card);
    if (!key) return;
    if (card && card.getAttribute('data-param-active') !== '1') return;

    const wasOn = btn.getAttribute('aria-pressed') === 'true';
    if (wasOn) {
      setParamSoloKey(null);
    } else {
      setParamSoloKey(key);
    }
    refreshHeatmapFromCurrentSliders();
  }

  function createParamSoloButtonWrap(paramKey) {
    const wrap = document.createElement('div');
    wrap.className = 'param-solo-wrap param-solo-wrap--head';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'param-solo-btn param-solo-btn--head';
    btn.setAttribute('data-param-solo-for', paramKey || '');
    btn.setAttribute('aria-label', 'Szóló nézet: csak ez a mutató a térképen');
    btn.setAttribute('aria-pressed', 'false');
    btn.title =
      'Szóló: csak ennek a mutatónak az eredményei a térképen (előbb keresés)';
    btn.textContent = 'S';
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      e.preventDefault();
      onParamSoloButtonClick(btn);
    });
    wrap.appendChild(btn);
    return wrap;
  }

  function appendParamHeadSoloAndInfo(headRow, infoKey, paramKey) {
    headRow.appendChild(createParamSoloButtonWrap(paramKey));
    headRow.appendChild(createParameterInfoWrapForKey(infoKey));
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
    if (isMobileMapPanelMode()) return;
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

  function unbindMapPickInteraction() {
    if (map && mapClickHandler) {
      map.off('click', mapClickHandler);
      mapClickHandler = null;
    }
    if (elements.mapContainer && mapTouchPickHandler) {
      elements.mapContainer.removeEventListener('touchend', mapTouchPickHandler);
      mapTouchPickHandler = null;
    }
  }

  function bindMapPickInteraction() {
    unbindMapPickInteraction();
    if (!map) return;

    mapClickHandler = function (ev) {
      if (Date.now() < mapPickTouchDedupeUntil) return;
      onMapPickClick(ev);
    };
    map.on('click', mapClickHandler);

    if (!elements.mapContainer) return;
    mapTouchPickHandler = function (ev) {
      if (!pickMode || !map) return;
      const canvas = map.getCanvas && map.getCanvas();
      if (!canvas) return;
      const touches = ev.changedTouches;
      if (!touches || !touches.length) return;
      const rect = canvas.getBoundingClientRect();
      const t = touches[0];
      const x = t.clientX - rect.left;
      const y = t.clientY - rect.top;
      if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;
      const lngLat = map.unproject([x, y]);
      mapPickTouchDedupeUntil = Date.now() + 450;
      onMapPickClick({ lngLat: lngLat, originalEvent: ev });
      ev.preventDefault();
    };
    elements.mapContainer.addEventListener('touchend', mapTouchPickHandler, {
      passive: false,
    });
  }

  function endPick() {
    unbindMapPickInteraction();
    pickMode = null;
    document.documentElement.classList.remove('map-picking');
    if (elements.mapContainer) elements.mapContainer.classList.remove('map-picking-cursor');
    if (elements.mapPickingBanner) elements.mapPickingBanner.hidden = true;
    updatePickButtonActive();
    if (map) map.resize();
    if (mobileGeoSetupSlot) {
      setMobileMapView(true, { forGeoEditor: true });
      showMobileGeoSheetEl(true);
      syncMobileMapDockButtons();
    }
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
    const slot = mode === 'geoA' ? 'a' : 'b';
    if (pickMode === target) {
      endPick();
      return;
    }
    if (pickMode) endPick();

    if (isTouchMobileAppStarted()) {
      openMobileGeoEditorIfNeeded(slot);
    }

    if (elements.geoCityInputA) elements.geoCityInputA.blur();
    if (elements.geoCityInputB) elements.geoCityInputB.blur();

    if (elements.mapPickingBanner) {
      elements.mapPickingBanner.hidden = false;
      if (elements.mapPickingBannerText)
        elements.mapPickingBannerText.textContent = 'Település-határok betöltése…';
    }
    document.documentElement.classList.add('map-picking');
    if (elements.mapContainer) elements.mapContainer.classList.add('map-picking-cursor');
    window.scrollTo(0, 0);
    if (map) {
      map.resize();
      setTimeout(function () {
        if (map) map.resize();
      }, 80);
      setTimeout(function () {
        if (map) map.resize();
      }, 280);
    }

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
    bindMapPickInteraction();
    updateImportantPlaceCircles();
    syncGeoMarkersFromState();
    if (map) map.resize();
  }

  function computeMaxPossibleDiff(targets) {
    let s = 0;
    for (const k in targets) {
      if (!Object.prototype.hasOwnProperty.call(targets, k)) continue;
      const pack = targets[k];
      if (!pack || pack.mode === 'band' || pack.value == null) continue;
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
   * Összegzi a w·|user − city| súlyozott eltéréseket (_index); sávos mutatók csak szűrnek (A modell).
   */
  function findBestMatch(targets) {
    if (!citiesData.length) return null;
    if (!targets || Object.keys(targets).length === 0) return null;

    let best = null;
    let minSum = Infinity;

    for (let i = 0; i < citiesData.length; i++) {
      const city = citiesData[i];
      if (!passesGeoFilter(city)) continue;
      if (!cityPassesActiveBandFilters(city, targets)) continue;
      const scored = computeCitySearchScore(city, targets);
      if (scored.used === 0) continue;
      if (scored.sum < minSum) {
        minSum = scored.sum;
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
    if (id === 'jobs_index') {
      return {
        companionKey: jobsCompanionMunkalehetosegAranyKey(key),
        format: formatForestRatioForUi,
      };
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
  /** Aktív paraméterkártyák index kulcsai (csúszka és sávos tól–ig egyaránt). */
  function collectActiveParamKeysFromDom() {
    const out = [];
    const seen = new Set();
    const host = elements.paramCategoriesHost;
    if (!host) return out;
    host.querySelectorAll('.param-item[data-param-active="1"]').forEach(function (card) {
      const key = getActiveParamKeyFromCard(card);
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push({ key: key, card: card });
    });
    return out;
  }

  function formatCityInfoValueForParamKey(city, key) {
    const info = findCompanionInfoForIndexKey(key);
    if (info && info.pair) {
      const parseFn = info.pair.parse || parseNumeric;
      const a = parseFn(city[info.pair.a]);
      const b = parseFn(city[info.pair.b]);
      return info.pair.formatPair(a, b);
    }
    if (info && info.companionKey && info.format) {
      const parseFn = info.parse || parseNumeric;
      const v = parseFn(city[info.companionKey]);
      return info.format(v);
    }
    const bandCfg = getBandFilterConfigForDbKey(key);
    if (bandCfg && bandCfg.formatValue) {
      const parseFn = bandCfg.parseValue || parseNumeric;
      const col = bandCfg.filterCol;
      const v = col ? parseFn(city[col]) : parseFn(city[key]);
      return bandCfg.formatValue(v);
    }
    const v = parseNumeric(city[key]);
    return v == null ? '–' : String(Math.round(v));
  }

  function buildCityInfoRows(city) {
    const rows = [];
    if (!city || !elements.paramCategoriesHost) return rows;
    const active = collectActiveParamKeysFromDom();
    for (let i = 0; i < active.length; i++) {
      const key = active[i].key;
      const card = active[i].card;
      const titleEl = card ? card.querySelector('.param-item__title') : null;
      const label = titleEl && titleEl.textContent
        ? titleEl.textContent.trim()
        : paramLabelForDbKey(key);
      rows.push({
        label: label,
        value: formatCityInfoValueForParamKey(city, key),
      });
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

    if (!targets || Object.keys(targets).length === 0) {
      clearHeatmapFeatureStates();
      return;
    }

    targets = applySoloFilterToTargets(targets);
    if (Object.keys(targets).length === 0) {
      clearHeatmapFeatureStates();
      if (cityInfoSelectedFeatureId) closeCityInfoPopup();
      return;
    }
    if (soloHeatmapParamKey && Object.keys(targets).length === 0) {
      clearHeatmapFeatureStates();
      if (cityInfoSelectedFeatureId) closeCityInfoPopup();
      return;
    }

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
      if (!cityPassesActiveBandFilters(city, targets)) continue;

      const scored = computeCitySearchScore(city, targets);
      if (scored.used === 0) continue;
      featureSums.push({ id: featureId, sum: scored.sum });
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
      btn.classList.toggle('feedback-panel__edge-tab--on', heatmapEnabled);
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
      clearHeatmapFeatureStates();
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

  function initWinnerInfoToggle() {
    const btn = document.getElementById('winner-info-toggle-btn');
    if (!btn) return;
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      toggleWinnerInfoInRightPanel();
    });
    syncWinnerInfoToggleUi();
  }

  async function fetchAllParameters() {
    lastSearchFeedbackMeta = null;
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
      bestCityFindInsertKeys = null;
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
      bestCityFindInsertKeys = null;
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
    const ticketText = ticketId != null ? ' (#' + ticketId + ' · mentve)' : '';
    let saveFailText = '';
    if (meta && meta.persistError) {
      saveFailText = ' · mentés hiba: ' + meta.persistError;
    } else if (meta && meta.persistFailed) {
      saveFailText = ' · adatbázis mentés sikertelen';
    }
    let paramCount = 0;
    if (meta && meta.paramCount != null && Number.isFinite(meta.paramCount)) {
      paramCount = Math.max(0, Math.round(meta.paramCount));
    } else if (meta && meta.targets && typeof meta.targets === 'object') {
      paramCount = Object.keys(meta.targets).length;
    }
    const paramText = paramCount > 0 ? ' · ' + paramCount + ' bekapcsolt paraméter alapján' : '';
    elements.resultBox.textContent = name + percentText + paramText + ticketText + saveFailText;

    if (meta) {
      lastSearchFeedbackMeta = {
        winningCity: winningCity,
        targets: meta.targets || {},
        finalScore: meta.finalScore != null ? meta.finalScore : 0,
        maxPossible: meta.maxPossible != null ? meta.maxPossible : 1,
        matchPercent: matchPercent,
      };
      syncWinnerInfoToggleUi();
      renderWinnerInfoInRightPanel(winningCity);
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

  function rebuildBestCityFindInsertKeys() {
    bestCityFindInsertKeys = null;
    if (!citiesData.length || !citiesData[0]) return;
    const keys = [];
    for (const key of Object.keys(citiesData[0])) {
      if (!BEST_CITY_FIND_ROW_OMIT.has(key)) keys.push(key);
    }
    bestCityFindInsertKeys = keys;
  }

  function buildBestCityFindRow(winningCity, matchPercent) {
    if (!bestCityFindInsertKeys) rebuildBestCityFindInsertKeys();
    const row = {};
    const keys = bestCityFindInsertKeys || Object.keys(winningCity);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (BEST_CITY_FIND_ROW_OMIT.has(key)) continue;
      if (Object.prototype.hasOwnProperty.call(winningCity, key)) {
        row[key] = winningCity[key];
      }
    }
    row.match_score =
      matchPercent != null && Number.isFinite(Number(matchPercent))
        ? Math.round(Number(matchPercent) * 10) / 10
        : null;
    return row;
  }

  async function saveSearchResult(winningCity, matchPercent) {
    try {
      if (!winningCity || typeof winningCity !== 'object') {
        return { id: null, error: 'nincs nyertes település' };
      }
      const row = buildBestCityFindRow(winningCity, matchPercent);
      const { data, error } = await supabase
        .from(SUPABASE_BEST_CITY_FINDS_TABLE)
        .insert(row)
        .select('id')
        .single();

      if (error) {
        const msg = error.message || String(error);
        console.warn('Találat mentése (' + SUPABASE_BEST_CITY_FINDS_TABLE + '):', msg, error);
        return { id: null, error: msg };
      }
      const savedId = data?.id ?? null;
      if (savedId != null) {
        console.log(
          'Találat mentve:',
          SUPABASE_BEST_CITY_FINDS_TABLE,
          '#' + savedId,
          row.settlement_name || cityName(winningCity)
        );
      }
      return { id: savedId, error: null };
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      console.warn('Találat mentése:', err);
      return { id: null, error: msg };
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
    syncMobileMapDockButtons();
    if (isTouchMobileAppStarted() && isGeoPlaceSwitchOn('a')) {
      mobileGeoAutoOpenSlot = 'a';
    }

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

    if (!citiesData.length) {
      elements.resultBox.textContent = 'Előbb töltsd be az all_parameters adatokat.';
      return;
    }

    const targets = collectSliderTargets();
    const paramCount = Object.keys(targets).length;

    if (paramCount === 0) {
      const noParamMsg =
        'Nincs aktív keresési mutató. Kapcsolj be legalább egyet a bal oldali panelen, és állítsd be a sávot vagy csúszkát.';
      if (elements.resultBox) elements.resultBox.textContent = noParamMsg;
      removeWinningMarker();
      lastSearchFeedbackMeta = null;
      hideFeedbackPanel();
      syncHeatmapWithActiveParams();
      setMobileMapView(false);
      openStrictParamsModal({
        reason: 'none',
        message: noParamMsg,
        suggestions: [],
      });
      return;
    }

    const result = findBestMatch(targets);

    if (heatmapEnabled) {
      updateHeatmapFromTargets(targets);
    } else if (result) {
      try {
        await setHeatmapEnabled(true);
      } catch (e) {
        console.warn('Hőtérkép bekapcsolás keresés után:', e);
      }
    }

    if (result) {
      const maxP = computeMaxPossibleDiff(targets);
      const matchPercent = diffToMatchPercent(result.finalScore, maxP);
      let ticketId = null;
      let persistError = null;
      if (persistToDb) {
        const saved = await saveSearchResult(result.city, matchPercent);
        ticketId = saved && saved.id != null ? saved.id : null;
        persistError = saved && saved.error ? saved.error : null;
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
        persistFailed: persistToDb && ticketId == null,
        persistError: persistError,
      });
      if (showTicket && shouldShowSearchTicketOverlay()) showTicketOverlay(ticketId);
      if (flyMapToResult && isTouchMobileAppStarted()) setMobileMapView(true);
      if (layoutAnchor && scroller && Number.isFinite(anchorY)) {
        applySidebarScrollAnchorAfterLayout(layoutAnchor, scroller, anchorY);
      }
    } else {
      let anchorY = NaN;
      if (layoutAnchor && scroller) {
        anchorY = layoutAnchor.getBoundingClientRect().top;
      }
      showNoSearchResultFeedback(targets);
      removeWinningMarker();
      lastSearchFeedbackMeta = null;
      hideFeedbackPanel();
      if (layoutAnchor && scroller && Number.isFinite(anchorY)) {
        applySidebarScrollAnchorAfterLayout(layoutAnchor, scroller, anchorY);
      }
    }
  }

  async function runMainSearchFromButton() {
    sliderAutoSearchActive = true;
    firstMainSearchClickWithPrompt = false;
    await performSearch({ showTicket: true, persistToDb: true, flyMapToResult: true });
  }

  async function onSearchClick() {
    const inactiveLabels = getInactiveParamCategoryLabels();
    if (firstMainSearchClickWithPrompt && inactiveLabels.length > 0) {
      openFirstSearchHintModal(inactiveLabels);
      return;
    }
    await runMainSearchFromButton();
  }

  /** Csúszka-változás indítson keresést (első gomb után): index, súly, sáv, rugalmasság. */
  function isParamSliderSearchInput(el) {
    if (!el || el.nodeName !== 'INPUT') return false;
    if (el.getAttribute('data-param-flex-for')) return el.type === 'range';
    if (el.getAttribute('data-param-band-min-for') || el.getAttribute('data-param-band-max-for')) {
      return true;
    }
    if (el.getAttribute('data-param-key') || el.getAttribute('data-param-weight-for')) {
      return el.type === 'range';
    }
    return false;
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

  function mountFeedbackPanelForViewport() {
    const panel = elements.feedbackPanel;
    if (!panel) return;
    const desktop = window.matchMedia('(min-width: 920px)').matches;
    const legend = document.getElementById('heatmap-legend');
    if (desktop) {
      if (panel.parentElement !== document.body) {
        if (legend) document.body.insertBefore(panel, legend);
        else document.body.appendChild(panel);
      }
      return;
    }
    const scroll = document.querySelector('.sidebar-scroll');
    if (scroll && panel.parentElement !== scroll) {
      scroll.appendChild(panel);
    }
  }

  function initLayoutDocking() {
    const sidebarDock = document.getElementById('sidebar-dock');
    const sidebarCloseBtn = document.getElementById('sidebar-collapse-btn');
    const sidebarOpenBtn = document.getElementById('sidebar-expand-btn');
    const feedbackBtn = document.getElementById('feedback-collapse-btn');

    mountFeedbackPanelForViewport();
    window.addEventListener('resize', mountFeedbackPanelForViewport);

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
      if (isTouchMobileAppStarted()) {
        const inMap = document.documentElement.classList.contains('mobile-map-view');
        setMobileMapView(!inMap);
        return;
      }
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
        syncWinnerInfoToggleUi();
        resizeMapSoon();
      });
    }
  }

  async function init() {
    initElements();
    initLayoutDocking();
    initHeatmapToggle();
    initWinnerInfoToggle();
    initFirstSearchHintModal();
    initStrictParamsModal();
    initMobileGeoSheet();
    initMobileMapChrome();
    syncMobileMapDockButtons();
    initParamInfoTooltips();
    initMap();
    buildImportantPlacesPanel();
    initImportantPlaceElements();
    bindParamInfoWraps(document.getElementById('sidebar-main'));
    setupGeoAutocomplete('a');
    setupGeoAutocomplete('b');

    elements.searchBtn.addEventListener('click', onSearchClick);

    if (elements.paramCategoriesHost) {
      elements.paramCategoriesHost.addEventListener('click', function (e) {
        if (!e.target.closest('.param-item__ios-switch')) return;
        queueMicrotask(syncHeatmapWithActiveParams);
      });
      elements.paramCategoriesHost.addEventListener('input', function (e) {
        const t = e.target;
        if (!isParamSliderSearchInput(t)) return;
        scheduleSearchFromSliders();
      });
      elements.paramCategoriesHost.addEventListener('change', function (e) {
        onGuidedParamRangeChange(e);
        const t = e.target;
        if (!isParamSliderSearchInput(t)) return;
        scheduleSearchFromSliders();
      });
    }

    if (elements.paramClearAllSoloBtn) {
      elements.paramClearAllSoloBtn.addEventListener('click', function (e) {
        e.preventDefault();
        onHeaderClearAllSoloClick();
      });
      syncHeaderClearAllSoloBtnUi();
    }

    if (elements.paramToggleAllBtn) {
      elements.paramToggleAllBtn.addEventListener('click', function (e) {
        e.preventDefault();
        toggleAllParamCardsActive();
      });
      syncHeaderAllParamsToggleBtnUi();
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
        return;
      }
      if (
        e.key === 'Escape' &&
        elements.strictParamsOverlay &&
        !elements.strictParamsOverlay.hasAttribute('hidden')
      ) {
        e.preventDefault();
        closeStrictParamsModal();
        return;
      }
      if (e.key === 'Escape' && mobileGeoSetupSlot) {
        e.preventDefault();
        onMobileGeoSheetCancel();
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
