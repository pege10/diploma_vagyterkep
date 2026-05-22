-- parameter_info: tooltip + panel szövegek (parameter_info tábla a kliensben).
-- CSV import a Supabase-ben: csak ASCII fejléc (szóköz nélkül).
--
-- Meglévő (production) oszlopok: parameter_key, megnevezes, ui_definicio,
--   adatforras_ok, adatforras_link — ezeket parameter_info_ui_text_columns.sql NEM írja felül.
-- Új oszlopok (ALTER): rovid_leiras, szlider1_*, szlider2_* — lásd parameter_info_ui_text_columns.sql

CREATE TABLE IF NOT EXISTS public.parameter_info (
  parameter_key TEXT PRIMARY KEY,
  megnevezes TEXT,
  ui_definicio TEXT,
  rovid_leiras TEXT,
  szlider1_megnevezes TEXT,
  szlider1_bal TEXT,
  szlider1_jobb TEXT,
  szlider2_megnevezes TEXT,
  szlider2_bal TEXT,
  szlider2_jobb TEXT,
  adatforras_ok TEXT,
  adatforras_link TEXT
);

COMMENT ON TABLE public.parameter_info IS
  'parameter_key = pl. forest_index; megnevezes = kártyacím; rovid_leiras + szlider* = panel szövegek; tooltip: ui_definicio + forrás link.';
COMMENT ON COLUMN public.parameter_info.megnevezes IS 'Paraméter felirat a UI-ban (megnevezés oszlop).';
COMMENT ON COLUMN public.parameter_info.ui_definicio IS 'Tooltip: hosszú UI definíció (i gomb).';
COMMENT ON COLUMN public.parameter_info.rovid_leiras IS 'Rövid alcím a kártya tetején.';
COMMENT ON COLUMN public.parameter_info.szlider1_megnevezes IS '1. csúszka címke (tartomány / kívánt index).';
COMMENT ON COLUMN public.parameter_info.szlider1_bal IS '1. csúszka bal szélső felirat.';
COMMENT ON COLUMN public.parameter_info.szlider1_jobb IS '1. csúszka jobb szélső felirat.';
COMMENT ON COLUMN public.parameter_info.szlider2_megnevezes IS '2. csúszka címke (rugalmasság / fontosság).';
COMMENT ON COLUMN public.parameter_info.szlider2_bal IS '2. csúszka bal szélső felirat.';
COMMENT ON COLUMN public.parameter_info.szlider2_jobb IS '2. csúszka jobb szélső felirat.';
COMMENT ON COLUMN public.parameter_info.adatforras_ok IS 'Tooltip: szöveges adatforrás.';
COMMENT ON COLUMN public.parameter_info.adatforras_link IS 'Tooltip: következő sor, forrás URL(ek).';

-- =============================================================================
-- RLS: a böngészőben az alkalmazás az „anon” kulccsal kéri le ezt a táblát.
-- Ha ez lezárva van, a REST [] üres tömböt ad vissza — a tooltipek üresek maradnak.
-- Futtasd egyszer a Supabase SQL Editorben (vagy hagyd ki, ha már létezik a policy):
-- =============================================================================

ALTER TABLE public.parameter_info ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "parameter_info_select_anon" ON public.parameter_info;
CREATE POLICY "parameter_info_select_anon"
  ON public.parameter_info
  FOR SELECT
  TO anon
  USING (true);

-- Opcionálisan bejelentkezett felhasználóknak is (ha később auth van):
-- DROP POLICY IF EXISTS "parameter_info_select_authenticated" ON public.parameter_info;
-- CREATE POLICY "parameter_info_select_authenticated"
--   ON public.parameter_info FOR SELECT TO authenticated USING (true);
