-- =============================================================================
-- parameter_info: Számodra fontos hely 1 / 2 (important_place_1, important_place_2)
-- =============================================================================
-- Új kulcsok (régi: geo_important_a / geo_important_b).
-- Futtasd egyszer a Supabase SQL Editorben (parameter_info_ui_text_columns.sql után).
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
  szlider2_jobb
)
VALUES
  (
    'important_place_1',
    '1. számodra fontos hely',
    'Válaszd ki azt a települést, amitől nem költöznél egy bizonyos távolságnál messzebb (pl. család, munkahely). A keresés csak a beállított körön belüli településeket veszi figyelembe.',
    'Válaszd ki azt a települést, amitől nem költöznél egy bizonyos távolságnál messzebb (pl. család, munkahely). A keresés csak a beállított körön belüli településeket veszi figyelembe.',
    'Település érték',
    NULL,
    NULL,
    'Sugár (km)',
    'Kisebb kör',
    'Nagyobb kör'
  ),
  (
    'important_place_2',
    '2. számodra fontos hely',
    'Válaszd ki azt a települést, amitől nem költöznél egy bizonyos távolságnál messzebb (pl. család, munkahely). A keresés csak a beállított körön belüli településeket veszi figyelembe.',
    'Válaszd ki azt a települést, amitől nem költöznél egy bizonyos távolságnál messzebb (pl. család, munkahely). A keresés csak a beállított körön belüli településeket veszi figyelembe.',
    'Település érték',
    NULL,
    NULL,
    'Sugár (km)',
    'Kisebb kör',
    'Nagyobb kör'
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
  szlider2_jobb = EXCLUDED.szlider2_jobb;

-- Régi kulcsok eltávolítása (ha még léteznek)
DELETE FROM public.parameter_info
WHERE parameter_key IN ('geo_important_a', 'geo_important_b');

-- Ellenőrzés:
-- SELECT parameter_key, megnevezes, rovid_leiras, szlider1_megnevezes, szlider2_megnevezes
-- FROM public.parameter_info
-- WHERE parameter_key IN ('important_place_1', 'important_place_2')
-- ORDER BY parameter_key;
