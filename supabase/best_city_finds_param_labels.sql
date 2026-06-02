-- =============================================================================
-- best_city_finds: param_label oszlopok hozzáadása
-- Minden aktív paraméterhez egy TEXT oszlop, ami a megnevezes szöveget tárolja.
-- Futtatható többször (IF NOT EXISTS).
-- =============================================================================

-- Természet / Környezet
ALTER TABLE public.best_city_finds ADD COLUMN IF NOT EXISTS "FOREST_INDEX_param_label"            text;
ALTER TABLE public.best_city_finds ADD COLUMN IF NOT EXISTS "WATER_INDEX_param_label"             text;
ALTER TABLE public.best_city_finds ADD COLUMN IF NOT EXISTS "TERRAIN_INDEX_param_label"           text;
ALTER TABLE public.best_city_finds ADD COLUMN IF NOT EXISTS "AIRPOLLUTION_INDEX_param_label"      text;

-- Közlekedés / Elérhetőség
ALTER TABLE public.best_city_finds ADD COLUMN IF NOT EXISTS "BUDAPEST_CAR_TRAIN_INDEX_param_label"    text;
ALTER TABLE public.best_city_finds ADD COLUMN IF NOT EXISTS "INTERNET_INDEX_param_label"              text;
ALTER TABLE public.best_city_finds ADD COLUMN IF NOT EXISTS "URBAN_MOBILITY_INDEX_param_label"        text;
ALTER TABLE public.best_city_finds ADD COLUMN IF NOT EXISTS "TRANSPORT_FREQUENCY_INDEX_param_label"   text;
ALTER TABLE public.best_city_finds ADD COLUMN IF NOT EXISTS "DISTRICT_SEAT_ACCESS_INDEX_param_label"  text;
ALTER TABLE public.best_city_finds ADD COLUMN IF NOT EXISTS "BUDAPEST_ACCESS_INDEX_param_label"       text;

-- Közszolgáltatások / Életminőség
ALTER TABLE public.best_city_finds ADD COLUMN IF NOT EXISTS "CULTURAL_INDEX_param_label"          text;
ALTER TABLE public.best_city_finds ADD COLUMN IF NOT EXISTS "GROCERIES_INDEX_param_label"         text;
ALTER TABLE public.best_city_finds ADD COLUMN IF NOT EXISTS "SPORT_INDEX_param_label"             text;
ALTER TABLE public.best_city_finds ADD COLUMN IF NOT EXISTS "GASTRO_INDEX_param_label"            text;
ALTER TABLE public.best_city_finds ADD COLUMN IF NOT EXISTS "SENIOR_INDEX_param_label"            text;
ALTER TABLE public.best_city_finds ADD COLUMN IF NOT EXISTS "DIPLOMA_INDEX_param_label"           text;

-- Iskola (két param osztja a SCHOOL_PROXIMITY_INDEX_ prefixet → külön alprefix)
ALTER TABLE public.best_city_finds ADD COLUMN IF NOT EXISTS "SCHOOL_PROXIMITY_INDEX_alt_param_label"  text;
ALTER TABLE public.best_city_finds ADD COLUMN IF NOT EXISTS "SCHOOL_PROXIMITY_INDEX_gim_param_label"  text;

-- Ingatlan (két param osztja az INGATLANPIAC_ prefixet → külön alprefix)
ALTER TABLE public.best_city_finds ADD COLUMN IF NOT EXISTS "INGATLANPIAC_grow_param_label"  text;
ALTER TABLE public.best_city_finds ADD COLUMN IF NOT EXISTS "INGATLANPIAC_avg_param_label"   text;

-- Gazdaság / Demográfia
ALTER TABLE public.best_city_finds ADD COLUMN IF NOT EXISTS "population_2024" bigint;
ALTER TABLE public.best_city_finds ADD COLUMN IF NOT EXISTS "population_2024_param_label" text;
ALTER TABLE public.best_city_finds ADD COLUMN IF NOT EXISTS "SLEEPING_CITY_INDEX_param_label"  text;
ALTER TABLE public.best_city_finds ADD COLUMN IF NOT EXISTS "JOBS_INDEX_param_label"           text;
ALTER TABLE public.best_city_finds ADD COLUMN IF NOT EXISTS "TURISM_INDEX_param_label"         text;

-- =============================================================================
-- Ellenőrzés:
-- SELECT column_name FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'best_city_finds'
--   AND column_name LIKE '%param_label%'
-- ORDER BY column_name;
-- =============================================================================
