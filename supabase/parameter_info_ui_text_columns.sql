-- =============================================================================
-- parameter_info: új UI oszlopok (rövid leírás + 2× csúszka feliratok)
-- =============================================================================
--
-- MÁR LÉTEZŐ oszlopok — ezeket ez a szkript NEM módosítja:
--   parameter_key, megnevezes, ui_definicio, adatforras_ok, adatforras_link
--
-- ÚJ oszlopok (ADD COLUMN IF NOT EXISTS):
--   rovid_leiras, szlider1_megnevezes, szlider1_bal, szlider1_jobb,
--   szlider2_megnevezes, szlider2_bal, szlider2_jobb
--
-- Kitöltés logika:
--   • Csak a fenti ÚJ mezőkre fut UPDATE.
--   • COALESCE(NULLIF(btrim(mező), ''), alapérték) → ha már van érték, NEM írja felül.
--   • Alapértékek: app.js getValueSliderUiConfig / getBandFilterConfigForDbKey (2026-03).
--
-- Supabase állapot (ellenőrizve): 24 sor, megnevezes + ui_definicio kitöltve;
--   az új oszlopok még nem léteznek → először ALTER, majd seed.
--
-- Futtasd egyszer a Supabase SQL Editorben.
-- =============================================================================

ALTER TABLE public.parameter_info
  ADD COLUMN IF NOT EXISTS rovid_leiras TEXT,
  ADD COLUMN IF NOT EXISTS szlider1_megnevezes TEXT,
  ADD COLUMN IF NOT EXISTS szlider1_bal TEXT,
  ADD COLUMN IF NOT EXISTS szlider1_jobb TEXT,
  ADD COLUMN IF NOT EXISTS szlider2_megnevezes TEXT,
  ADD COLUMN IF NOT EXISTS szlider2_bal TEXT,
  ADD COLUMN IF NOT EXISTS szlider2_jobb TEXT;

COMMENT ON COLUMN public.parameter_info.rovid_leiras IS
  'Rövid alcím a kártya tetején. Hosszú tooltip: ui_definicio (meglévő oszlop).';
COMMENT ON COLUMN public.parameter_info.szlider1_megnevezes IS
  '1. csúszka címke: tartomány / kívánt index.';
COMMENT ON COLUMN public.parameter_info.szlider1_bal IS '1. csúszka bal szélső felirat.';
COMMENT ON COLUMN public.parameter_info.szlider1_jobb IS '1. csúszka jobb szélső felirat.';
COMMENT ON COLUMN public.parameter_info.szlider2_megnevezes IS
  '2. csúszka címke: rugalmasság (sávos) vagy fontosság (index).';
COMMENT ON COLUMN public.parameter_info.szlider2_bal IS '2. csúszka bal szélső felirat.';
COMMENT ON COLUMN public.parameter_info.szlider2_jobb IS '2. csúszka jobb szélső felirat.';

-- ── Alapértékek: csak üres új mezők kitöltése (megnevezes / ui_definicio érintetlen) ──

UPDATE public.parameter_info AS p
SET
  rovid_leiras = COALESCE(NULLIF(btrim(p.rovid_leiras), ''), v.rovid_leiras),
  szlider1_megnevezes = COALESCE(NULLIF(btrim(p.szlider1_megnevezes), ''), v.szlider1_megnevezes),
  szlider1_bal = COALESCE(NULLIF(btrim(p.szlider1_bal), ''), v.szlider1_bal),
  szlider1_jobb = COALESCE(NULLIF(btrim(p.szlider1_jobb), ''), v.szlider1_jobb),
  szlider2_megnevezes = COALESCE(NULLIF(btrim(p.szlider2_megnevezes), ''), v.szlider2_megnevezes),
  szlider2_bal = COALESCE(NULLIF(btrim(p.szlider2_bal), ''), v.szlider2_bal),
  szlider2_jobb = COALESCE(NULLIF(btrim(p.szlider2_jobb), ''), v.szlider2_jobb)
FROM (
  VALUES
    -- Index + fontosság (2 csúszka: kívánt index + fontosság)
    (
      'forest_index',
      'Kívánt erdőlefedettségi index (3 km). Szűrés: index; a szélső értékek: átlagos erdőarány (%).',
      'Kívánt index', 'Kevesebb erdő', 'Több erdő',
      'Fontosság a keresésben', 'Nem számít', 'Maximális'
    ),
    (
      'water_index',
      'Kívánt vízfelület-index (3 km). Szűrés: index; a szélső értékek: átlagos vízarány (%).',
      'Kívánt index', 'Kevesebb víz', 'Több víz',
      'Fontosság a keresésben', 'Nem számít', 'Maximális'
    ),
    (
      'terrain_index',
      'Kívánt hegyvidéki karakter index (3 km). Szűrés: index; a szélső értékek: átlagos lejtés (°).',
      'Kívánt index', 'Laposabb', 'Hegyesebb',
      'Fontosság a keresésben', 'Nem számít', 'Maximális'
    ),
    (
      'senior_index',
      'Kívánt arány a 65 év felettieknek. Szűrés: index; a szélső értékek: népességarány (%).',
      'Kívánt index', 'Fiatalabb', 'Idősebb',
      'Fontosság a keresésben', 'Nem számít', 'Maximális'
    ),
    (
      'sleeping_city_index',
      'Kívánt alvóváros index – mennyire kiszolgált a település a környező nagyvárosok felől.',
      'Kívánt index', 'Alacsonyabb', 'Magasabb',
      'Fontosság a keresésben', 'Nem számít', 'Maximális'
    ),
    (
      'turism_index',
      'Kívánt turizmus index (0–100).',
      'Kívánt index', 'Alacsonyabb', 'Magasabb',
      'Fontosság a keresésben', 'Nem számít', 'Maximális'
    ),
    -- Sávos szűrő: tartomány + rugalmasság (Laza–Szigorú)
    (
      'airpollution_index',
      'Elfogadható légszennyezettségi index (3 km). Szűrés: index pont; magasabb index = erősebb szennyezés.',
      'Elfogadható tartomány', 'Tisztább', 'Szennyezettebb',
      'Rugalmasság', 'Laza', 'Szigorú'
    ),
    (
      'budapest_access_index',
      'Elfogadható utazási idő Budapestre (percben). Balra hosszabb, jobbra rövidebb idő.',
      'Elfogadható időtartam', 'Legtöbb idő', 'Jobb (0 perc)',
      'Rugalmasság', 'Laza', 'Szigorú'
    ),
    (
      'budapest_car_train_index',
      'Elfogadható összidő Budapestre, autó + vonat (percben). Balra hosszabb, jobbra rövidebb.',
      'Elfogadható időtartam', 'Legtöbb idő', 'Jobb (0 perc)',
      'Rugalmasság', 'Laza', 'Szigorú'
    ),
    (
      'district_seat_access_index',
      'Elfogadható utazási idő a járásszékhelyre (percben). Balra hosszabb, jobbra rövidebb idő.',
      'Elfogadható időtartam', 'Legtöbb idő', 'Legkevesebb idő',
      'Rugalmasság', 'Laza', 'Szigorú'
    ),
    (
      'internet_index',
      'Elfogadható internet index. Szűrés: pont; felirat: Mbps.',
      'Elfogadható sebesség', 'Gyengébb', 'Erősebb',
      'Rugalmasság', 'Laza', 'Szigorú'
    ),
    (
      'transport_frequency_index',
      'Elfogadható tömegközlekedési index (0–100). Szűrés: pont; a felirat a pontszinthez tartozó legjobb járatszám (járásszékhely és BP kerület nélkül).',
      'Elfogadható tartomány', 'Gyengébb', 'Erősebb',
      'Rugalmasság', 'Laza', 'Szigorú'
    ),
    (
      'urban_mobility_index',
      'Elfogadható index tartomány. Balra az alacsonyabb, jobbra a magasabb érték.',
      'Elfogadható tartomány', 'Alacsonyabb', 'Magasabb',
      'Rugalmasság', 'Laza', 'Szigorú'
    ),
    (
      'cultural_index',
      'Elfogadható index tartomány. Balra az alacsonyabb, jobbra a magasabb érték.',
      'Elfogadható tartomány', 'Alacsonyabb', 'Magasabb',
      'Rugalmasság', 'Laza', 'Szigorú'
    ),
    (
      'sport_index',
      'Elfogadható index tartomány. Balra az alacsonyabb, jobbra a magasabb érték.',
      'Elfogadható tartomány', 'Alacsonyabb', 'Magasabb',
      'Rugalmasság', 'Laza', 'Szigorú'
    ),
    (
      'groceries_index',
      'Elfogadható kisker index. Szűrés: pont; felirat: km és üzletszám.',
      'Elfogadható ellátás', 'Gyengébb', 'Erősebb',
      'Rugalmasság', 'Laza', 'Szigorú'
    ),
    (
      'gastro_index',
      'Elfogadható gasztronómia index. Szűrés: pont; felirat: helyszám.',
      'Elfogadható kínálat', 'Kevesebb', 'Több',
      'Rugalmasság', 'Laza', 'Szigorú'
    ),
    (
      'jobs_index',
      'Elfogadható helyi munkalehetőség index (0–100). Szűrés: pont; felirat: munkalehetőség aránya (%).',
      'Elfogadható tartomány', 'Gyengébb', 'Erősebb',
      'Rugalmasság', 'Laza', 'Szigorú'
    ),
    (
      'primary_school_proximity_index',
      'Elfogadható iskolaválaszték index. Szűrés: pont; felirat: távolság (km).',
      'Elfogadható közelség', 'Távolabb', 'Közelebb',
      'Rugalmasság', 'Laza', 'Szigorú'
    ),
    (
      'high_school_proximity_index',
      'Elfogadható iskolaválaszték index. Szűrés: pont; felirat: távolság (km).',
      'Elfogadható közelség', 'Távolabb', 'Közelebb',
      'Rugalmasság', 'Laza', 'Szigorú'
    ),
    (
      'real_estate_price_grow_5yrs_index',
      'Elfogadható áremelkedés index. Szűrés: pont; felirat: %.',
      'Elfogadható emelkedés', 'Alacsonyabb', 'Magasabb',
      'Rugalmasság', 'Laza', 'Szigorú'
    ),
    (
      'real_estate_price_avg5mth_index',
      'Elfogadható ingatlanár index. Szűrés: pont; felirat: Ft/m².',
      'Elfogadható árszint', 'Olcsóbb', 'Drágább',
      'Rugalmasság', 'Laza', 'Szigorú'
    ),
    -- Csak fontosság-csúszka (nincs külön intro az appban)
    (
      'diploma_index',
      NULL, NULL, NULL, NULL,
      'Fontosság a keresésben', 'Nem számít', 'Maximális'
    )
) AS v(
  parameter_key,
  rovid_leiras,
  szlider1_megnevezes,
  szlider1_bal,
  szlider1_jobb,
  szlider2_megnevezes,
  szlider2_bal,
  szlider2_jobb
)
WHERE p.parameter_key = v.parameter_key;

-- telepules_nev_egysegesites: meta sor, nincs csúszka — szándékosan nincs a VALUES listában.

-- Ellenőrzés (megnevezes / ui_definicio változatlan maradt):
-- SELECT parameter_key, megnevezes,
--        left(ui_definicio, 40) AS ui_definicio_elso,
--        rovid_leiras, szlider1_megnevezes, szlider1_bal, szlider1_jobb,
--        szlider2_megnevezes, szlider2_bal, szlider2_jobb
-- FROM public.parameter_info
-- ORDER BY parameter_key;
