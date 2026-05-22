-- =============================================================================
-- parameter_info: rövid leírások (rovid_leiras) — mit jelent az adott mutató?
-- =============================================================================
--
-- Stílus: tegező, egyes szám második személy (pl. „neked”, „állítsd be”, „érsz el”).
-- Referencia (érintetlen): important_place_1 / important_place_2
--
-- Ez a szkript CSAK a rovid_leiras mezőt írja felül. A fontos hely 1 és 2
-- sorok nincsenek benne.
--
-- Futtasd a Supabase SQL Editorben. Újra futtatható.
-- =============================================================================

UPDATE public.parameter_info AS p
SET rovid_leiras = v.rovid_leiras
FROM (
  VALUES
    (
      'forest_index',
      'Mennyire erdős a település környezete (3 km-es kör). Állítsd be, ha fontos neked, mennyi zöld terület veszi körül a választott helyet.'
    ),
    (
      'water_index',
      'Mennyire jelentős a vízfelület a település közelében (3 km): tavak, folyók és egyéb víztestek aránya. Neked szól, ha vízközeli hangulatot keresel.'
    ),
    (
      'terrain_index',
      'A település domborzati jellege (3 km): mennyire dombos vagy sík a környék. Állítsd be, ha neked a hegyvidéki vagy épp a lapos táj a fontos.'
    ),
    (
      'airpollution_index',
      'A település környezetének levegőminősége (3 km). Neked tisztább levegőt jelent a magasabb érték, erősebb szennyezést az alacsonyabb.'
    ),
    (
      'budapest_car_train_index',
      'Mennyi idő alatt érsz el Budapestre autóval és vonattal együtt. Használd, ha neked mindkét közlekedési mód számít a főváros felé.'
    ),
    (
      'internet_index',
      'A település átlagos mobilinternet-sebessége (Mbps). Neked szól, ha otthonról dolgozol, streamelsz vagy gyors netre vágysz.'
    ),
    (
      'urban_mobility_index',
      'Mennyire jól tudsz közlekedni a településen és környékén: járhatóság, elérhetőség, közlekedési lehetőségek egyben.'
    ),
    (
      'transport_frequency_index',
      'Mennyire sűrűn járnak buszok és vonatok a járás székhelyén (járásszékhely és BP kerület nélkül). Neked szól, ha a tömegközlekedés gyakorisága fontos.'
    ),
    (
      'district_seat_access_index',
      'Autóval mennyi idő alatt éred el a járás székhelyét. Állítsd be, ha neked számít a megyei ügyintézés vagy a szolgáltatások közelsége.'
    ),
    (
      'budapest_access_index',
      'Autóval mennyi idő alatt érsz el Budapestre. A keresés a beállított időn belül maradó településeket részesíti előnyben.'
    ),
    (
      'cultural_index',
      'Mennyire pezsgő a kulturális élet: műintézetek, rendezvények, programok a településen. Neked szól, ha fontos a kulturált környezet.'
    ),
    (
      'groceries_index',
      'Milyen messze van tőled a legközelebbi üzlet, és hány különböző márka érhető el 5 km-en belül. Neked a mindennapi bevásárlás kényelmét méri.'
    ),
    (
      'sport_index',
      'Milyen sportágak és létesítmények érhetők el a településen. Állítsd be, ha neked fontos a sport és a szabadidős lehetőségek.'
    ),
    (
      'gastro_index',
      'Mennyi étterem, kávézó és hasonló hely van a településen és környékén. Neked szól, ha a gasztronómia és a vendéglátás jelenléte számít.'
    ),
    (
      'senior_index',
      'A település népességének hány százaléka 65 év felett. Állítsd be, ha neked az számít, mennyire idős vagy fiatal a közösség.'
    ),
    (
      'diploma_index',
      'A lakosság hány százaléka rendelkezik diplomával. Neked akkor releváns, ha fontos, milyen végzettségű a település közössége.'
    ),
    (
      'primary_school_proximity_index',
      'Milyen messze van tőled a legközelebbi állami vagy alternatív általános iskola. Válaszd ki a panelen, melyik iskolatípus számít neked.'
    ),
    (
      'high_school_proximity_index',
      'Milyen messze van tőled a legközelebbi állami vagy alternatív gimnázium. Válaszd ki a panelen, melyik iskolatípus számít neked.'
    ),
    (
      'real_estate_price_grow_5yrs_index',
      'Mennyit emelkedtek az ingatlanárak az elmúlt 5 évben (%). Válaszd ki a panelen, neked a ház, lakás vagy telek mennyire számít.'
    ),
    (
      'real_estate_price_avg5mth_index',
      'Mekkora az aktuális ingatlanár-szint (Ft/m², 2025–2026). Válaszd ki a panelen a neked releváns típust: ház, lakás vagy telek.'
    ),
    (
      'sleeping_city_index',
      'Mennyire „alvóváros” a település: a lakosság mennyire a környező nagyvárosok munkahelyei és szolgáltatásai felé jár. Neked szól, ha ez a jelleg számít.'
    ),
    (
      'jobs_index',
      'Mennyire tudsz a településen vagy annak közelében elhelyezkedni anélkül, hogy messzebb ingáznod kellene. Neked a helyi munkalehetőségek arányát mutatja.'
    ),
    (
      'turism_index',
      'Mennyire turisztikusan aktív a település: vendéglátás, látogatottság, turisztikai infrastruktúra. Neked szól, ha a pezsgő vagy épp a csendesebb turizmus a fontos.'
    )
) AS v(parameter_key, rovid_leiras)
WHERE p.parameter_key = v.parameter_key;

-- Ellenőrzés (fontos helyek változatlanok maradnak):
-- SELECT parameter_key, megnevezes, rovid_leiras
-- FROM public.parameter_info
-- ORDER BY parameter_key;
