-- =============================================================================
-- parameter_info: közérthető UI definíciók (ui_definicio) — i-gomb tooltip
-- =============================================================================
--
-- Stílus: rövid, tegező; mit mér + milyen adatból + hogyan használd a csúszkát.
-- A technikai parameter_tabla.csv szövegeket felülírja.
--
-- Futtasd a Supabase SQL Editorben. Újra futtatható.
-- =============================================================================

UPDATE public.parameter_info AS p
SET ui_definicio = v.ui_definicio
FROM (
  VALUES
    (
      'forest_index',
      'A település lakott területe körüli 3 km-es zónában mért erdőborítottság. Adat: Copernicus földfedettségi térkép és OpenStreetMap erdői.

A csúszkán beállítod a preferált erdőarányt; a paraméter a település tényleges értékét mutatja százalékban.'
    ),
    (
      'water_index',
      'Mennyi része érint víz közelében a település lakott területének (tavak, folyók). Adat: OpenStreetMap víz-felületek, 3 km-es zónában.

A csúszkán a kívánt vízarányt állítod be; a paraméter a település tényleges arányát mutatja.'
    ),
    (
      'terrain_index',
      'A település körüli 3 km-es zónában mért átlagos lejtőszög. Adat: Copernicus domborzati modell (30 m).

Magasabb érték = hegyesebb környék, alacsonyabb = síkabb táj. A paraméter a tényleges lejtést mutatja fokban.'
    ),
    (
      'airpollution_index',
      'A település 3 km-es körzetének levegőminősége (por, nitrogén-dioxid, porszemcsék). Adat: Copernicus légminőség-újraelemzés.

A sáv jelöli az elfogadható tartományt. Jobbra tisztább, balra szennyezettebb levegő; a csúszka magasabb indexe jobb minőséget jelent.'
    ),
    (
      'budapest_car_train_index',
      'Reggeli csúcsidőben mennyi idő alatt érsz el Budapestre: autó a legközelebbi állomásra, majd vonat. Adat: MÁV menetrend és útvonal-számítás.

A sáv az elfogadható összidőt jelöli. Jobbra rövidebb, balra hosszabb utazás.'
    ),
    (
      'internet_index',
      'A település körüli 3 km-es zónában mért átlagos letöltési sebesség. Adat: Ookla Speedtest mérések (nem hirdetett lefedettség).

A sáv jelöli, milyen sebességet fogadsz el; a paraméter a tényleges Mbps-értéket mutatja.'
    ),
    (
      'urban_mobility_index',
      'Mennyire jól lehet közlekedni és bejárni a települést. Adat: helyi buszmenetrendek (GTFS), KSH közlekedési statisztika és a lakott terület mérete.

A sáv az elfogadható tartományt jelöli; magasabb érték = jobb tömegközlekedés vagy kompaktabb, gyalogosan járható település.'
    ),
    (
      'transport_frequency_index',
      'Hány járat köti össze naponta a települést a járás székhelyével. Adat: Volánbusz és MÁV menetrend (Budapest kerületei külön kezelve).

A sáv az elfogadható tartományt jelöli; a paraméter a napi járatok számát mutatja.'
    ),
    (
      'district_seat_access_index',
      'Mennyi idő autóval a járás székhelyére (közigazgatás, egészségügy, boltok). Adat: KSH TEIR közlekedési felmérés (2022).

A sáv az elfogadható menetidőt jelöli; jobbra rövidebb, balra hosszabb utazás.'
    ),
    (
      'budapest_access_index',
      'Mennyi idő autóval Budapestre a leggyorsabb útvonalon. Adat: KSH TEIR közlekedési felmérés (2022).

A sáv az elfogadható menetidőt jelöli; jobbra rövidebb, balra hosszabb utazás.'
    ),
    (
      'cultural_index',
      'A település kulturális kínálata és aktivitása. Adat: KSH TEIR – mozitermek, színházak, könyvtárak száma és rendszeres kulturális programokon résztvevők.

A sáv az elfogadható tartományt jelöli; magasabb érték = gazdagabb kulturális élet.'
    ),
    (
      'groceries_index',
      'Milyen messze van a legközelebbi nagy élelmiszerlánc üzlete, és hány különböző lánc érhető el 5 km-en belül. Adat: OpenStreetMap üzlet-helyek.

A sáv az elfogadható ellátást jelöli; a paraméter távolságot (km) és üzletszámot mutat.'
    ),
    (
      'sport_index',
      'Milyen sportágak érhetők el szervezett formában, és mennyi sportlétesítmény van 3 km-en belül. Adat: Nemzeti Sportinformációs Rendszer és OpenStreetMap.

A sáv az elfogadható tartományt jelöli; magasabb érték = több és változatosabb sportlehetőség.'
    ),
    (
      'gastro_index',
      'Hány vendéglátóhely (étterem, kávézó, bár stb.) van a település lakott területén. Adat: OpenStreetMap.

A sáv az elfogadható kínálatot jelöli; a paraméter a helyek számát mutatja.'
    ),
    (
      'senior_index',
      'A településen élők hány százaléka 65 év felett. Adat: 2022-es népszámlálás.

A csúszkán beállítod a preferált arányt; a paraméter a település tényleges értékét mutatja.'
    ),
    (
      'diploma_index',
      'A 7 év feletti lakosok hány százaléka rendelkezik diplomával. Adat: 2022-es népszámlálás.

A csúszkán beállítod, mennyire fontos ez a keresésben; magasabb arány = több diplomás a közösségben.'
    ),
    (
      'primary_school_proximity_index',
      'Milyen messze van a legközelebbi általános iskola (állami vagy alternatív). Adat: Oktatási Hivatal intézménytörzs és közúti távolság-számítás.

A sáv az elfogadható közelséget jelöli; válaszd ki a panelen a neked számító iskolatípust.'
    ),
    (
      'high_school_proximity_index',
      'Milyen messze van a legközelebbi gimnázium (állami vagy alternatív). Adat: Oktatási Hivatal intézménytörzs és közúti távolság-számítás.

A sáv az elfogadható közelséget jelöli; válaszd ki a panelen a neked számító iskolatípust.'
    ),
    (
      'real_estate_price_grow_5yrs_index',
      'Mennyit emelkedtek az ingatlanárak 2022 márciusa óta (ház, lakás, telek átlaga). Adat: helyi ingatlanpiaci statisztika.

A sáv az elfogadható emelkedést jelöli; válaszd ki a panelen a neked releváns ingatlantípust.'
    ),
    (
      'real_estate_price_avg5mth_index',
      'Aktuális átlagos négyzetméterár (2025–2026 átlag). Adat: helyi ingatlanpiaci statisztika.

A sáv az elfogadható árszintet jelöli; olcsóbb irány balra, drágább jobbra. Válaszd ki az ingatlantípust a panelen.'
    ),
    (
      'sleeping_city_index',
      'A foglalkoztatott lakosok hány százaléka jár el más településre dolgozni. Adat: 2022-es népszámlálás.

Magasabb érték = erősebb alvóváros-jelleg (a lakók többsége máshol dolgozik).'
    ),
    (
      'jobs_index',
      'Mennyi helyi munkahely jut egy foglalkoztatott lakosra. Adat: 2022-es népszámlálás.

Magasabb érték = több helyi munkalehetőség; az 1,0 körüli arány egyensúlyt jelent.'
    ),
    (
      'turism_index',
      'Mennyire turisztikusan aktív a település. Adat: települési idegenforgalmi adó (IFA) bevétele lakosonként (2024).

Magasabb érték = erősebb turizmus és vendéglátás.'
    ),
    (
      'important_place_1',
      'Szubjektív távolságkorlát: megadsz egy települést és egy sugarat (km). A keresés csak azokat a helyeket tartja meg, amelyek a körön belül vannak.

Nincs külső adatforrás – a te preferenciád alapján szűr.'
    ),
    (
      'important_place_2',
      'Szubjektív távolságkorlát: megadsz egy települést és egy sugarat (km). A keresés csak azokat a helyeket tartja meg, amelyek a körön belül vannak.

Nincs külső adatforrás – a te preferenciád alapján szűr.'
    )
) AS v(parameter_key, ui_definicio)
WHERE p.parameter_key = v.parameter_key;

-- Ellenőrzés:
-- SELECT parameter_key, left(ui_definicio, 80) AS elso_sor
-- FROM public.parameter_info
-- ORDER BY parameter_key;
