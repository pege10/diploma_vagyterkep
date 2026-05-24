-- =============================================================================
-- best_city_finds: School Proximity _index oszlopok visszaállítása
-- Mind a négy iskolatípushoz hozzáadja a normalizált index oszlopot.
-- Futtatható többször (IF NOT EXISTS).
-- =============================================================================

ALTER TABLE public.best_city_finds
  ADD COLUMN IF NOT EXISTS "SCHOOL_PROXIMITY_INDEX_alt_sima_index" double precision;

ALTER TABLE public.best_city_finds
  ADD COLUMN IF NOT EXISTS "SCHOOL_PROXIMITY_INDEX_alt_alt_index" double precision;

ALTER TABLE public.best_city_finds
  ADD COLUMN IF NOT EXISTS "SCHOOL_PROXIMITY_INDEX_gim_sima_index" double precision;

ALTER TABLE public.best_city_finds
  ADD COLUMN IF NOT EXISTS "SCHOOL_PROXIMITY_INDEX_gim_alt_index" double precision;

-- =============================================================================
-- Ellenőrzés:
-- SELECT column_name FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'best_city_finds'
--   AND column_name LIKE 'SCHOOL_PROXIMITY_INDEX%'
-- ORDER BY column_name;
-- =============================================================================
