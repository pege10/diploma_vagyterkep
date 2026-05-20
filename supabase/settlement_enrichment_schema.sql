-- settlement_enrichment: település kép + később AI összefoglaló (Wikipedia / egyéb forrás)
-- Import: data/settlement_wikipedia_images.csv (tools/fetch_wikipedia_settlement_images.py)

CREATE TABLE IF NOT EXISTS public.settlement_enrichment (
  settlement_name text PRIMARY KEY,
  wikipedia_title text,
  wikipedia_page_id bigint,
  photo_url text,
  photo_thumb_url text,
  photo_width integer,
  photo_height integer,
  photo_source text NOT NULL DEFAULT 'wikipedia',
  photo_attribution text,
  wikipedia_article_url text,
  fetch_status text NOT NULL DEFAULT 'pending',
  fetch_note text,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  summary_hu text,
  summary_generated_at timestamptz
);

COMMENT ON TABLE public.settlement_enrichment IS
  'Település média és szöveg cache; settlement_name = all_parameters.settlement_name.';
COMMENT ON COLUMN public.settlement_enrichment.photo_url IS
  'Nagy felbontású Commons URL (pageimages original), ha van.';
COMMENT ON COLUMN public.settlement_enrichment.photo_thumb_url IS
  'Panelhez ajánlott (~800px széles) thumbnail URL.';
COMMENT ON COLUMN public.settlement_enrichment.fetch_status IS
  'ok | no_page | no_image | disambiguation | error';
COMMENT ON COLUMN public.settlement_enrichment.photo_attribution IS
  'Megjelenítendő forrásszöveg (pl. Wikipédia – Kömlő).';

CREATE INDEX IF NOT EXISTS settlement_enrichment_fetch_status_idx
  ON public.settlement_enrichment (fetch_status);

ALTER TABLE public.settlement_enrichment ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "settlement_enrichment_select_anon" ON public.settlement_enrichment;
CREATE POLICY "settlement_enrichment_select_anon"
  ON public.settlement_enrichment
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- INSERT/UPDATE csak service role / Studio import (batch script), nem anon:
-- Ha később Edge Function tölti, külön policy.
