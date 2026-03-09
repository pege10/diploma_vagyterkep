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
  };

  function initElements() {
    elements.mapContainer = document.getElementById('map-container');
    elements.erdoSlider = document.getElementById('erdo_szint');
    elements.kulturaSlider = document.getElementById('kultura_szint');
    elements.erdoValue = document.getElementById('erdo_szint-value');
    elements.kulturaValue = document.getElementById('kultura_szint-value');
    elements.searchBtn = document.getElementById('search-btn');
    elements.resultBox = document.getElementById('result-box');
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
    } catch (err) {
      console.error('Fetch error:', err);
      citiesData = [];
      elements.resultBox.textContent = 'Hiba: nem sikerült csatlakozni az adatbázishoz.';
    }
  }

  function findBestMatch(sliderErdo, sliderKultura) {
    if (!citiesData.length) return null;

    let best = null;
    let minDiff = Infinity;

    for (let i = 0; i < citiesData.length; i++) {
      const city = citiesData[i];
      const erdo = Number(city.erdo_szint) || 0;
      const kultura = Number(city.kultura_szint) || 0;
      const diff =
        Math.abs(sliderErdo - erdo) + Math.abs(sliderKultura - kultura);

      if (diff < minDiff) {
        minDiff = diff;
        best = city;
      }
    }

    return best;
  }

  function removeWinningMarker() {
    if (winningMarker) {
      winningMarker.remove();
      winningMarker = null;
    }
  }

  function showResult(winningCity) {
    elements.resultBox.textContent = 'A te helyed: ' + (winningCity.nev || '–');

    const lng = Number(winningCity.lng);
    const lat = Number(winningCity.lat);

    if (Number.isFinite(lng) && Number.isFinite(lat)) {
      map.flyTo({
        center: [lng, lat],
        zoom: RESULT_ZOOM,
        duration: 1500,
        essential: true,
      });

      removeWinningMarker();
      winningMarker = new maplibregl.Marker({ color: '#4c6ef5' })
        .setLngLat([lng, lat])
        .addTo(map);
    }
  }

  function onSearchClick() {
    const sliderErdo = parseInt(elements.erdoSlider.value, 10) || 0;
    const sliderKultura = parseInt(elements.kulturaSlider.value, 10) || 0;

    const winningCity = findBestMatch(sliderErdo, sliderKultura);

    if (winningCity) {
      showResult(winningCity);
    } else {
      elements.resultBox.textContent = 'Nincs találat. Töltsd be az adatokat, vagy ellenőrizd a kapcsolatot.';
      removeWinningMarker();
    }
  }

  function init() {
    initElements();
    initMap();
    bindSliderDisplay(elements.erdoSlider, elements.erdoValue);
    bindSliderDisplay(elements.kulturaSlider, elements.kulturaValue);

    elements.searchBtn.addEventListener('click', onSearchClick);

    fetchCities();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
