-- =============================================================================
-- parameter_info: ellenőrzött adatforrás linkek (adatforras_link)
-- =============================================================================
--
-- 2026-03: halott vagy átirányított URL-ek cseréje működő hivatalos forrásokra.
-- Megegyezik az app.js BUILTIN_PARAM_ADATFORRAS_LINKS értékeivel.
--
-- Futtasd a Supabase SQL Editorben. Újra futtatható.
-- =============================================================================

UPDATE public.parameter_info AS p
SET adatforras_link = v.adatforras_link
FROM (
  VALUES
    (
      'forest_index',
      'https://land.copernicus.eu/pan-european/corine-land-cover/clc2018; https://www.openstreetmap.org'
    ),
    ('water_index', 'https://www.openstreetmap.org'),
    ('terrain_index', 'https://dataspace.copernicus.eu/'),
    (
      'airpollution_index',
      'https://ads.atmosphere.copernicus.eu/datasets/cams-europe-air-quality-reanalyses'
    ),
    (
      'budapest_car_train_index',
      'https://www.mavcsoport.hu/mav-start/belfoldi-utazas/menetrend'
    ),
    (
      'internet_index',
      'https://registry.opendata.aws/speedtest-global-performance/; https://www.openstreetmap.org'
    ),
    (
      'urban_mobility_index',
      'https://opendata.bkk.hu/datasets; https://gtfs.kti.hu/; https://www.teir.hu; https://www.openstreetmap.org'
    ),
    (
      'transport_frequency_index',
      'https://gtfs.kti.hu/; https://www.mavcsoport.hu/mav-start/belfoldi-utazas/menetrend; https://www.openstreetmap.org'
    ),
    ('district_seat_access_index', 'https://www.teir.hu'),
    ('budapest_access_index', 'https://www.teir.hu'),
    ('cultural_index', 'https://www.teir.hu'),
    ('groceries_index', 'https://www.openstreetmap.org'),
    ('sport_index', 'https://nsr.gov.hu/; https://www.openstreetmap.org'),
    ('gastro_index', 'https://www.openstreetmap.org'),
    ('senior_index', 'https://nepszamlalas2022.ksh.hu/'),
    ('diploma_index', 'https://nepszamlalas2022.ksh.hu/'),
    (
      'primary_school_proximity_index',
      'https://www.oktatas.hu/kozneveles; https://nominatim.openstreetmap.org/; https://project-osrm.org/'
    ),
    (
      'high_school_proximity_index',
      'https://www.oktatas.hu/kozneveles; https://nominatim.openstreetmap.org/; https://project-osrm.org/'
    ),
    ('sleeping_city_index', 'https://nepszamlalas2022.ksh.hu/'),
    ('jobs_index', 'https://nepszamlalas2022.ksh.hu/')
) AS v(parameter_key, adatforras_link)
WHERE p.parameter_key = v.parameter_key;

-- Ellenőrzés:
-- SELECT parameter_key, adatforras_link FROM public.parameter_info ORDER BY parameter_key;
