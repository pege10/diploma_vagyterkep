-- parameter_info: tooltip szövegek (parameter_info tábla a kliensben).
-- CSV import a Supabase-ben: csak ASCII fejléc (szóköz nélkül), pl. parameter_key és ui_definicio.
--
-- FONTOS: Ha a Table Editor „id bigserial”-t hozott létre, a CSV első oszlopa NE az id legyen.
-- A hiba „invalid input syntax for type bigint: … Természeti…” = az 1. CSV oszlop az id mezőre került,
-- de szöveg (szekciócím) van benne. Megoldás: lásd parameter_info_import_fix.sql

CREATE TABLE IF NOT EXISTS public.parameter_info (
  parameter_key TEXT PRIMARY KEY,
  megnevezes TEXT,
  ui_definicio TEXT,
  adatforras_ok TEXT,
  adatforras_link TEXT
);

COMMENT ON TABLE public.parameter_info IS 'parameter_key = pl. forest_index, geo_important_a; megnevezes = megjelenő név; tooltip: ui_definicio + üres sorok + forrás + link';
COMMENT ON COLUMN public.parameter_info.megnevezes IS 'Paraméter felirat a UI-ban (megnevezés oszlop).';
COMMENT ON COLUMN public.parameter_info.ui_definicio IS 'Tooltip első blokk: UI definíció.';
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
