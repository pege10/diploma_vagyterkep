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
  '1. csúszka címke: tartomány / preferált érték.';
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
    -- Index + fontosság (2 csúszka: preferált érték + fontosság)
    (
      'forest_index',
      'Mennyire erdős a környék (3 km). Földfedettségi térképek alapján; a csúszkán az átlagos erdőarány (%) látszik.',
      'Preferált érték', 'Kevesebb erdő', 'Több erdő',
      'Fontosság a keresésben', 'Nem számít', 'Maximális'
    ),
    (
      'water_index',
      'Mennyire van víz a közelben (3 km). Térképi víztestek alapján; a csúszkán az átlagos vízarány (%) látszik.',
      'Preferált érték', 'Kevesebb víz', 'Több víz',
      'Fontosság a keresésben', 'Nem számít', 'Maximális'
    ),
    (
      'terrain_index',
      'Mennyire dombos a környék (3 km). Domborzati modell alapján; a csúszkán az átlagos lejtés (°) látszik.',
      'Preferált érték', 'Laposabb', 'Hegyesebb',
      'Fontosság a keresésben', 'Nem számít', 'Maximális'
    ),
    (
      'senior_index',
      'Preferált arány 65 év felett. Népességszámlálás alapján; a csúszkán a népességarány (%) látszik.',
      'Preferált érték', 'Fiatalabb', 'Idősebb',
      'Fontosság a keresésben', 'Nem számít', 'Maximális'
    ),
    (
      'sleeping_city_index',
      'Preferált alvóváros jelleg. Népességszámlálás alapján; magasabb = többen ingáznak el dolgozni.',
      'Preferált érték', 'Alacsonyabb', 'Magasabb',
      'Fontosság a keresésben', 'Nem számít', 'Maximális'
    ),
    (
      'turism_index',
      'Preferált turisztikai aktivitás. Idegenforgalmi adó bevétele lakosonként; 0–100 skálán.',
      'Preferált érték', 'Alacsonyabb', 'Magasabb',
      'Fontosság a keresésben', 'Nem számít', 'Maximális'
    ),
    -- Sávos szűrő: tartomány + rugalmasság (Laza–Szigorú)
    (
      'airpollution_index',
      'Elfogadható levegőminőség (3 km). Légminőség-modell alapján; magasabb = tisztább levegő.',
      'Elfogadható tartomány', 'Szennyezettebb', 'Tisztább',
      'Rugalmasság', 'Laza', 'Szigorú'
    ),
    (
      'budapest_access_index',
      'Elfogadható autós idő Budapestre. Közlekedési felmérés alapján; a csúszkán percben látszik.',
      'Elfogadható időtartam', 'Legtöbb idő', 'Jobb (0 perc)',
      'Rugalmasság', 'Laza', 'Szigorú'
    ),
    (
      'budapest_car_train_index',
      'Elfogadható összidő Budapestre (autó + vonat). Menetrend alapján; a csúszkán percben látszik.',
      'Elfogadható időtartam', 'Legtöbb idő', 'Jobb (0 perc)',
      'Rugalmasság', 'Laza', 'Szigorú'
    ),
    (
      'district_seat_access_index',
      'Elfogadható autós idő a járásszékhelyre. Közlekedési felmérés alapján; a csúszkán percben látszik.',
      'Elfogadható időtartam', 'Legtöbb idő', 'Legkevesebb idő',
      'Rugalmasság', 'Laza', 'Szigorú'
    ),
    (
      'internet_index',
      'Elfogadható internet sebesség. Valós felhasználói mérések alapján; a csúszkán Mbps látszik.',
      'Elfogadható sebesség', 'Gyengébb', 'Erősebb',
      'Rugalmasság', 'Laza', 'Szigorú'
    ),
    (
      'transport_frequency_index',
      'Elfogadható járatsűrűség a járásszékhely felé. Busz- és vonatmenetrend alapján; a csúszkán napi járatok száma látszik.',
      'Elfogadható tartomány', 'Gyengébb', 'Erősebb',
      'Rugalmasság', 'Laza', 'Szigorú'
    ),
    (
      'urban_mobility_index',
      'Elfogadható városi mobilitás. Menetrend és településméret alapján; 0–100 skálán.',
      'Elfogadható tartomány', 'Alacsonyabb', 'Magasabb',
      'Rugalmasság', 'Laza', 'Szigorú'
    ),
    (
      'cultural_index',
      'Elfogadható kulturális élet. Statisztikai adatok: mozi, színház, könyvtár, rendezvény.',
      'Elfogadható tartomány', 'Alacsonyabb', 'Magasabb',
      'Rugalmasság', 'Laza', 'Szigorú'
    ),
    (
      'sport_index',
      'Elfogadható sportlehetőség. Sportegyesületek és térképi létesítmények alapján.',
      'Elfogadható tartomány', 'Alacsonyabb', 'Magasabb',
      'Rugalmasság', 'Laza', 'Szigorú'
    ),
    (
      'groceries_index',
      'Elfogadható bevásárlási ellátás. Üzletláncház helyei alapján; a csúszkán km és üzletszám látszik.',
      'Elfogadható ellátás', 'Gyengébb', 'Erősebb',
      'Rugalmasság', 'Laza', 'Szigorú'
    ),
    (
      'gastro_index',
      'Elfogadható vendéglátó kínálat. Éttermek és kávézók térképi adatai alapján; a csúszkán helyszám látszik.',
      'Elfogadható kínálat', 'Kevesebb', 'Több',
      'Rugalmasság', 'Laza', 'Szigorú'
    ),
    (
      'jobs_index',
      'Elfogadható helyi munkalehetőség. Népességszámlálás alapján; a csúszkán a helyi munkahely/lakos arány (%) látszik.',
      'Elfogadható tartomány', 'Gyengébb', 'Erősebb',
      'Rugalmasság', 'Laza', 'Szigorú'
    ),
    (
      'primary_school_proximity_index',
      'Elfogadható iskolaközelség. Iskolatörzs és útvonal-adatok alapján; a csúszkán távolság (km) látszik. Válaszd ki az iskola típusát.',
      'Elfogadható közelség', 'Távolabb', 'Közelebb',
      'Rugalmasság', 'Laza', 'Szigorú'
    ),
    (
      'high_school_proximity_index',
      'Elfogadható gimnázium-közelség. Iskolatörzs és útvonal-adatok alapján; a csúszkán távolság (km) látszik. Válaszd ki az iskola típusát.',
      'Elfogadható közelség', 'Távolabb', 'Közelebb',
      'Rugalmasság', 'Laza', 'Szigorú'
    ),
    (
      'real_estate_price_grow_5yrs_index',
      'Elfogadható áremelkedés (5 év). Ingatlanpiaci statisztika alapján; a csúszkán % látszik. Válaszd ki az ingatlan típusát.',
      'Elfogadható emelkedés', 'Alacsonyabb', 'Magasabb',
      'Rugalmasság', 'Laza', 'Szigorú'
    ),
    (
      'real_estate_price_avg5mth_index',
      'Elfogadható árszint. Ingatlanpiaci statisztika alapján; a csúszkán Ft/m² látszik. Válaszd ki az ingatlan típusát.',
      'Elfogadható árszint', 'Olcsóbb', 'Drágább',
      'Rugalmasság', 'Laza', 'Szigorú'
    ),
    -- Csak fontosság-csúszka (nincs külön intro az appban)
    (
      'diploma_index',
      'Preferált diplomás arány. Népességszámlálás alapján; a csúszkán a végzettségarány (%) látszik.',
      'Preferált érték', 'Alacsonyabb', 'Magasabb',
      'Fontosság a keresésben', 'Nem számít', 'Maximális'
    ),
    -- Számodra fontos helyek (geo slot a/b — nincs index csúszka, csak település + sugár)
    (
      'important_place_1',
      'Válaszd ki a települést, amitől nem költöznél messzebb egy bizonyos körön belül (pl. család, munkahely).',
      'Település érték', NULL, NULL,
      'Sugár (km)', 'Kisebb kör', 'Nagyobb kör'
    ),
    (
      'important_place_2',
      'Válaszd ki a települést, amitől nem költöznél messzebb egy bizonyos körön belül (pl. család, munkahely).',
      'Település érték', NULL, NULL,
      'Sugár (km)', 'Kisebb kör', 'Nagyobb kör'
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

-- ── Meglévő DB: régi csúszkafeliratok frissítése (COALESCE seed nem írja felül) ──

UPDATE public.parameter_info
SET szlider1_megnevezes = 'Preferált érték'
WHERE szlider1_megnevezes = 'Kívánt index';

UPDATE public.parameter_info
SET
  szlider1_megnevezes = 'Település érték',
  szlider2_megnevezes = 'Sugár (km)'
WHERE parameter_key IN ('important_place_1', 'important_place_2');

UPDATE public.parameter_info
SET
  rovid_leiras = 'Elfogadható levegőminőség (3 km). Légminőség-modell alapján; magasabb = tisztább levegő.',
  szlider1_bal = 'Szennyezettebb',
  szlider1_jobb = 'Tisztább'
WHERE parameter_key = 'airpollution_index';

-- Panel alcímek frissítése (2026-03 — app.js BUILTIN_PARAM_UI_COPY):
-- Futtasd: supabase/parameter_info_rovid_leiras.sql és supabase/parameter_info_ui_definicio.sql

-- telepules_nev_egysegesites: meta sor, nincs csúszka — szándékosan nincs a VALUES listában.

-- Ellenőrzés (megnevezes / ui_definicio változatlan maradt):
-- SELECT parameter_key, megnevezes,
--        left(ui_definicio, 40) AS ui_definicio_elso,
--        rovid_leiras, szlider1_megnevezes, szlider1_bal, szlider1_jobb,
--        szlider2_megnevezes, szlider2_bal, szlider2_jobb
-- FROM public.parameter_info
-- ORDER BY parameter_key;
