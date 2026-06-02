-- =============================================================================
-- parameter_info: Alvóváros index (sleeping_city_index)
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
  'sleeping_city_index',
  'Alvóváros index',
  'A foglalkoztatott lakosok hány százaléka nem a saját településén dolgozik, hanem máshova ingázik. Adat: 2022-es népszámlálás.

Alacsonyabb érték = kevesen mennek el dolgozni, erősebb helyi jellegű település. Magasabb érték = tipikus alvóváros, ahol sokan más településen dolgoznak.

A csúszkán beállítod az elfogadható tartományt.',
  'A foglalkoztatott lakosok hány százaléka jár el más településre dolgozni. Magasabb érték = erősebb alvóváros-jelleg.',
  'Elfogadható kijárási arány',
  'Kevesebb kijáró',
  'Több kijáró',
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
