Wikipedia leírások importálása Supabase-be (4 fájl)
=================================================

Futtasd sorban a Supabase SQL Editorban:
  01_batch_001.sql  (setup + 1. negyed)
  02_batch_002.sql
  03_batch_003.sql
  04_batch_004.sql

Ellenőrzés:
  SELECT count(*) FILTER (WHERE panel_leiras IS NOT NULL), count(*) FROM city_data;

Összes település leírással: 3090
