-- =============================================================================
-- city_data: település panel szövegek (jobb oldali találat panel, egyezés % alatt)
-- =============================================================================
--
-- ÚJ oszlopok:
--   panel_adatok       — rövid adatsorok (soronként egy tétel, pl. „Vármegye: Pest”)
--   panel_rovid_szoveg — 1–2 mondat bevezető
--   panel_leiras       — hosszabb leírás
--
-- A frontend a city_data betöltésekor mapeli ezeket a mezőket; üres mezők nem jelennek meg.
-- Futtasd egyszer a Supabase SQL Editorben.
-- =============================================================================

ALTER TABLE public.city_data
  ADD COLUMN IF NOT EXISTS panel_adatok TEXT,
  ADD COLUMN IF NOT EXISTS panel_rovid_szoveg TEXT,
  ADD COLUMN IF NOT EXISTS panel_leiras TEXT;

COMMENT ON COLUMN public.city_data.panel_adatok IS
  'Találat panel: rövid adatsorok (soronként egy sor, pl. lakosság, vármegye).';
COMMENT ON COLUMN public.city_data.panel_rovid_szoveg IS
  'Találat panel: rövid bevezető szöveg az egyezés % alatt.';
COMMENT ON COLUMN public.city_data.panel_leiras IS
  'Találat panel: Wikipedia-alapú rövid település-leírás (egyezés % alatt). Üres = nincs ismertető doboz.';
