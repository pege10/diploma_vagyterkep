-- =============================================================================
-- parameter_info: Élelmiszerüzlet elérhetőség (groceries_index)
-- Futtasd egyszer a Supabase SQL Editorben.
-- =============================================================================

INSERT INTO public.parameter_info AS p (
  parameter_key,
  megnevezes,
  ui_definicio,
  rovid_leiras,
  szlider1_megnevezes,
  szlider1_bal,
  szlider1_jobb,
  szlider2_megnevezes,
  szlider2_bal,
  szlider2_jobb,
  adatforras_ok,
  adatforras_link
)
VALUES (
  'groceries_index',
  'Élelmiszerüzlet elérhetőség',
  'Milyen messze van a legközelebbi nagy élelmiszerlánc üzlete a településről. Adat: OpenStreetMap üzlet-helyek (Aldi, Lidl, Tesco, Spar, Penny, Auchan).

A csúszkán km-ben állítod be az elfogadható távolságot: balra távolabb, jobbra közelebb. A keresés ennek megfelelően szűr; az eredménynél külön látszik, hány különböző üzlet érhető el 5 km-en belül, és melyik a legközelebbi.',
  'Milyen messze van a legközelebbi nagy élelmiszerlánc üzlete (km). Állíts be elfogadható távolságot; az eredménynél az 5 km-en belüli üzletek is látszanak.',
  'Elfogadható távolság',
  'Távolabb',
  'Közelebb',
  'Rugalmasság',
  'Laza',
  'Szigorú',
  'OpenStreetMap üzlet-helyek',
  'https://www.openstreetmap.org'
)
ON CONFLICT (parameter_key) DO UPDATE SET
  megnevezes = EXCLUDED.megnevezes,
  ui_definicio = EXCLUDED.ui_definicio,
  rovid_leiras = EXCLUDED.rovid_leiras,
  szlider1_megnevezes = EXCLUDED.szlider1_megnevezes,
  szlider1_bal = EXCLUDED.szlider1_bal,
  szlider1_jobb = EXCLUDED.szlider1_jobb,
  szlider2_megnevezes = EXCLUDED.szlider2_megnevezes,
  szlider2_bal = EXCLUDED.szlider2_bal,
  szlider2_jobb = EXCLUDED.szlider2_jobb,
  adatforras_ok = EXCLUDED.adatforras_ok,
  adatforras_link = EXCLUDED.adatforras_link;
