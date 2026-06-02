-- =============================================================================
-- parameter_info: Népességszám (population_2024) — city_data.population_2024 alapján
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
  'population_2024',
  'Népességszám',
  'A település állandó lakónépessége 2024. december 31-én. Adat: KSH település-statisztika; Budapest kerületei TEIR forrásból.

A sáv jelöli, mekkora közösségben szeretnél élni — kisebb falu vagy nagyobb város egyaránt beállítható.',
  'A település lakossága 2024-ben (fő). Állíts be elfogadható tartományt, ha a település mérete számít.',
  'Elfogadható népességtartomány',
  'Kisebb település',
  'Nagyobb település',
  'Rugalmasság',
  'Laza',
  'Szigorú',
  'KSH település-statisztika; Budapest kerületek: TEIR',
  'https://www.ksh.hu/; https://www.teir.hu'
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

-- best_city_finds: népesség érték + param_label oszlop
ALTER TABLE public.best_city_finds ADD COLUMN IF NOT EXISTS population_2024 bigint;
ALTER TABLE public.best_city_finds ADD COLUMN IF NOT EXISTS population_2024_param_label text;
