-- =============================================================================
-- parameter_info: Helyi munkalehetőségek aránya (jobs_index)
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
  'jobs_index',
  'Helyi munkalehetőségek aránya',
  'Azt mutatja, a helyi lakosokhoz képest mennyi munkahely érhető el a településen. Adat: 2022-es népszámlálás.

Ha a százalék magas, több helyi munkalehetőség van; ha alacsony, kevesebb, és sokan más városba járnak dolgozni.

A csúszkán beállítod az elfogadható tartományt.',
  'Mennyi helyi munkahely jut a település dolgozó lakosaira. Magasabb érték = több lehetőség helyben dolgozni.',
  'Elfogadható tartomány',
  'Gyengébb',
  'Erősebb',
  'Rugalmasság',
  'Laza',
  'Szigorú',
  '2022-es népszámlálás (KSH)',
  'https://nepszamlalas2022.ksh.hu/'
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
