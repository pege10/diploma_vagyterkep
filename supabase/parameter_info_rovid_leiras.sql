-- =============================================================================
-- parameter_info: panel alcímek (rovid_leiras) — mit mér + mit mutat a csúszka
-- =============================================================================
--
-- Megegyezik az app.js BUILTIN_PARAM_UI_COPY intro szövegeivel.
-- Futtasd a Supabase SQL Editorben. Újra futtatható.
-- =============================================================================

UPDATE public.parameter_info AS p
SET rovid_leiras = v.rovid_leiras
FROM (
  VALUES
    (
      'forest_index',
      'Mennyire erdős a környék (3 km). Földfedettségi térképek alapján; a csúszkán az átlagos erdőarány (%) látszik.'
    ),
    (
      'water_index',
      'Mennyire van víz a közelben (3 km). Térképi víztestek alapján; a csúszkán az átlagos vízarány (%) látszik.'
    ),
    (
      'terrain_index',
      'Mennyire dombos a környék (3 km). Domborzati modell alapján; a csúszkán az átlagos lejtés (°) látszik.'
    ),
    (
      'airpollution_index',
      'Elfogadható levegőminőség (3 km). Légminőség-modell alapján; magasabb = tisztább levegő.'
    ),
    (
      'budapest_car_train_index',
      'Elfogadható összidő Budapestre (autó + vonat). Menetrend alapján; a csúszkán percben látszik.'
    ),
    (
      'internet_index',
      'Elfogadható internet sebesség. Valós felhasználói mérések alapján; a csúszkán Mbps látszik.'
    ),
    (
      'urban_mobility_index',
      'Elfogadható városi mobilitás. Menetrend és településméret alapján; 0–100 skálán.'
    ),
    (
      'transport_frequency_index',
      'Elfogadható járatsűrűség a járásszékhely felé. Busz- és vonatmenetrend alapján; a csúszkán napi járatok száma látszik.'
    ),
    (
      'district_seat_access_index',
      'Elfogadható autós idő a járásszékhelyre. Közlekedési felmérés alapján; a csúszkán percben látszik.'
    ),
    (
      'budapest_access_index',
      'Elfogadható autós idő Budapestre. Közlekedési felmérés alapján; a csúszkán percben látszik.'
    ),
    (
      'cultural_index',
      'Elfogadható kulturális élet. Statisztikai adatok: mozi, színház, könyvtár, rendezvény.'
    ),
    (
      'groceries_index',
      'Elfogadható bevásárlási ellátás. Üzletláncház helyei alapján; a csúszkán km és üzletszám látszik.'
    ),
    (
      'sport_index',
      'Elfogadható sportlehetőség. Sportegyesületek és térképi létesítmények alapján.'
    ),
    (
      'gastro_index',
      'Elfogadható vendéglátó kínálat. Éttermek és kávézók térképi adatai alapján; a csúszkán helyszám látszik.'
    ),
    (
      'senior_index',
      'Preferált arány 65 év felett. Népességszámlálás alapján; a csúszkán a népességarány (%) látszik.'
    ),
    (
      'diploma_index',
      'Preferált diplomás arány. Népességszámlálás alapján; a csúszkán a végzettségarány (%) látszik.'
    ),
    (
      'primary_school_proximity_index',
      'Elfogadható iskolaközelség. Iskolatörzs és útvonal-adatok alapján; a csúszkán távolság (km) látszik. Válaszd ki az iskola típusát.'
    ),
    (
      'high_school_proximity_index',
      'Elfogadható gimnázium-közelség. Iskolatörzs és útvonal-adatok alapján; a csúszkán távolság (km) látszik. Válaszd ki az iskola típusát.'
    ),
    (
      'real_estate_price_grow_5yrs_index',
      'Elfogadható áremelkedés (5 év). Ingatlanpiaci statisztika alapján; a csúszkán % látszik. Válaszd ki az ingatlan típusát.'
    ),
    (
      'real_estate_price_avg5mth_index',
      'Elfogadható árszint. Ingatlanpiaci statisztika alapján; a csúszkán Ft/m² látszik. Válaszd ki az ingatlan típusát.'
    ),
    (
      'sleeping_city_index',
      'Preferált alvóváros jelleg. Népességszámlálás alapján; magasabb = többen ingáznak el dolgozni.'
    ),
    (
      'jobs_index',
      'Elfogadható helyi munkalehetőség. Népességszámlálás alapján; a csúszkán a helyi munkahely/lakos arány (%) látszik.'
    ),
    (
      'turism_index',
      'Preferált turisztikai aktivitás. Idegenforgalmi adó bevétele lakosonként; 0–100 skálán.'
    )
) AS v(parameter_key, rovid_leiras)
WHERE p.parameter_key = v.parameter_key;
