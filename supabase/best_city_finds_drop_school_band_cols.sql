-- =============================================================================
-- best_city_finds: School Proximity Index sávos távolság-oszlopok eltávolítása
--
-- Megtartva (mindegyik variánsnál):
--   *_legkozelebbi_km   — legközelebbi iskola km távolsága
--   *_legkozelebbi_nev  — legközelebbi iskola neve
--
-- Eldobva: 0–50 km-es sávszámok + neveik, valamint a normalizált _index oszlopok
-- Futtatható többször (IF NOT EXISTS).
-- =============================================================================

-- ── Állami általános iskola (alt_sima) ───────────────────────────────────────
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_alt_sima_0km";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_alt_sima_0km_nevek";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_alt_sima_5km";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_alt_sima_5km_nevek";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_alt_sima_10km";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_alt_sima_10km_nevek";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_alt_sima_15km";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_alt_sima_15km_nevek";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_alt_sima_20km";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_alt_sima_20km_nevek";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_alt_sima_25km";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_alt_sima_25km_nevek";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_alt_sima_30km";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_alt_sima_30km_nevek";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_alt_sima_35km";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_alt_sima_35km_nevek";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_alt_sima_40km";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_alt_sima_40km_nevek";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_alt_sima_45km";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_alt_sima_45km_nevek";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_alt_sima_50km";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_alt_sima_50km_nevek";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_alt_sima_index";

-- ── Alternatív általános iskola (alt_alt) ────────────────────────────────────
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_alt_alt_0km";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_alt_alt_0km_nevek";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_alt_alt_5km";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_alt_alt_5km_nevek";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_alt_alt_10km";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_alt_alt_10km_nevek";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_alt_alt_15km";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_alt_alt_15km_nevek";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_alt_alt_20km";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_alt_alt_20km_nevek";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_alt_alt_25km";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_alt_alt_25km_nevek";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_alt_alt_30km";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_alt_alt_30km_nevek";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_alt_alt_35km";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_alt_alt_35km_nevek";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_alt_alt_40km";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_alt_alt_40km_nevek";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_alt_alt_45km";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_alt_alt_45km_nevek";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_alt_alt_50km";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_alt_alt_50km_nevek";

-- ── Állami gimnázium (gim_sima) ──────────────────────────────────────────────
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_gim_sima_0km";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_gim_sima_0km_nevek";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_gim_sima_5km";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_gim_sima_5km_nevek";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_gim_sima_10km";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_gim_sima_10km_nevek";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_gim_sima_15km";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_gim_sima_15km_nevek";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_gim_sima_20km";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_gim_sima_20km_nevek";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_gim_sima_25km";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_gim_sima_25km_nevek";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_gim_sima_30km";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_gim_sima_30km_nevek";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_gim_sima_35km";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_gim_sima_35km_nevek";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_gim_sima_40km";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_gim_sima_40km_nevek";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_gim_sima_45km";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_gim_sima_45km_nevek";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_gim_sima_50km";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_gim_sima_50km_nevek";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_gim_sima_index";

-- ── Alternatív gimnázium (gim_alt) ───────────────────────────────────────────
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_gim_alt_0km";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_gim_alt_0km_nevek";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_gim_alt_5km";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_gim_alt_5km_nevek";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_gim_alt_10km";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_gim_alt_10km_nevek";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_gim_alt_15km";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_gim_alt_15km_nevek";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_gim_alt_20km";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_gim_alt_20km_nevek";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_gim_alt_25km";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_gim_alt_25km_nevek";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_gim_alt_30km";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_gim_alt_30km_nevek";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_gim_alt_35km";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_gim_alt_35km_nevek";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_gim_alt_40km";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_gim_alt_40km_nevek";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_gim_alt_45km";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_gim_alt_45km_nevek";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_gim_alt_50km";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_gim_alt_50km_nevek";
ALTER TABLE public.best_city_finds DROP COLUMN IF EXISTS "SCHOOL_PROXIMITY_INDEX_gim_alt_index";

-- =============================================================================
-- Ellenőrzés (maradék iskola oszlopok — csak a 8 legközelebbi kell):
-- SELECT column_name FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'best_city_finds'
--   AND column_name LIKE 'SCHOOL_PROXIMITY_INDEX%'
-- ORDER BY column_name;
-- =============================================================================
