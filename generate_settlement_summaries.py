#!/usr/bin/env python3
"""
Település összefoglaló generátor – adatalapú elemzés
------------------------------------------------------
Az ALL_PARAMETERS CSV adatait értelmezi és ~1000 karakteres
analitikus szöveget generál minden településről.
Stílus: tömör, direkt, geopolitikai + gazdasági + életminőség szemlélet.
"""

import csv, re, json, random
from pathlib import Path

BASE_DIR       = Path(__file__).parent
DATA_DIR       = BASE_DIR / "data"
ALL_PARAMS_CSV = DATA_DIR / "ALL_PARAMETERS_v3_supabase.csv"
OUTPUT_CSV     = DATA_DIR / "settlement_summaries.csv"
PROGRESS_JSON  = DATA_DIR / "settlement_summaries_progress.json"
LOG_FILE       = DATA_DIR / "summaries.log"

MAX_CHARS  = 1000
SAVE_EVERY = 200


# ── Logolás ──────────────────────────────────────────────────────

def log(msg: str):
    print(msg)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(msg + "\n")


# ── Adat-betöltés és normalizálás ────────────────────────────────

def flt(val: str, default=None):
    """Szám kinyerése a mezőből."""
    try:
        return float(str(val).replace("\xa0", "").replace(" ", "").replace(",", ".").replace("%", "").strip())
    except:
        return default


def load_all_rows() -> list[dict]:
    with open(ALL_PARAMS_CSV, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def compute_percentiles(rows: list[dict]) -> dict:
    """
    Minden kulcs-indexhez kiszámolja az összes érték rendezett listáját,
    hogy bármely értékhez percentilis-rangot lehessen rendelni.
    """
    KEYS = [
        "JOBS_INDEX_jobs_index",
        "SLEEPING_CITY_INDEX_sleeping_city_index",
        "BUDAPEST_CAR_TRAIN_INDEX_budapest_car_train_index",
        "BUDAPEST_ACCESS_INDEX_budapest_auto_index",
        "TRANSPORT_FREQUENCY_INDEX_transport_frequency_index",
        "INTERNET_INDEX_internet_index",
        "CULTURAL_INDEX_cultural_index",
        "GROCERIES_INDEX_kisker_index",
        "SPORT_INDEX_sport_index",
        "DIPLOMA_INDEX_diploma_index",
        "FOREST_INDEX_forest_index",
        "INGATLANPIAC_house_avg_index",
        "INGATLANPIAC_haz_emelkedes_pct",
        "TURISM_INDEX_turism_index",
        "AIRPOLLUTION_INDEX_airpollution_index",
        "DISTRICT_SEAT_ACCESS_INDEX_jarasszekhely_auto_index",
        "SENIOR_INDEX_senior_index",
        "URBAN_MOBILITY_INDEX_urban_mobility_index",
        "WATER_INDEX_water_index",
        "GASTRO_INDEX_gasztro_index",
    ]
    dist = {}
    for key in KEYS:
        vals = sorted([v for r in rows if (v := flt(r.get(key, ""))) is not None])
        dist[key] = vals
    return dist


def pct_rank(value, sorted_vals: list) -> float:
    """Visszaadja, hogy value hány százalék alatt van (0–100)."""
    if not sorted_vals or value is None:
        return 50.0
    n = len(sorted_vals)
    idx = sum(1 for v in sorted_vals if v <= value)
    return idx / n * 100


def rank(value, sorted_vals) -> str:
    """Szöveges rang: nagyon_alacsony / alacsony / közepes / magas / kiemelkedő"""
    p = pct_rank(value, sorted_vals)
    if p < 15:  return "nagyon_alacsony"
    if p < 35:  return "alacsony"
    if p < 65:  return "közepes"
    if p < 85:  return "magas"
    return "kiemelkedő"


# ── Szöveg-building-blokkök ──────────────────────────────────────

def block_identity(row: dict, d: dict) -> str:
    """1. bekezdés: geopolitikai helyzet, szerep, alapkarakter."""
    name   = row["settlement_name"]
    stype  = row.get("CITYDATA_SettlementType", "")
    county = row.get("CITYDATA_County", "")

    jobs_r    = rank(flt(row.get("JOBS_INDEX_jobs_index")),            d["JOBS_INDEX_jobs_index"])
    sleep_r   = rank(flt(row.get("SLEEPING_CITY_INDEX_sleeping_city_index")), d["SLEEPING_CITY_INDEX_sleeping_city_index"])
    bp_r      = rank(flt(row.get("BUDAPEST_ACCESS_INDEX_budapest_auto_index")), d["BUDAPEST_ACCESS_INDEX_budapest_auto_index"])
    bp_train  = rank(flt(row.get("BUDAPEST_CAR_TRAIN_INDEX_budapest_car_train_index")), d["BUDAPEST_CAR_TRAIN_INDEX_budapest_car_train_index"])
    turism_r  = rank(flt(row.get("TURISM_INDEX_turism_index")),        d["TURISM_INDEX_turism_index"])
    dipl_r    = rank(flt(row.get("DIPLOMA_INDEX_diploma_index")),      d["DIPLOMA_INDEX_diploma_index"])
    bp_min    = flt(row.get("BUDAPEST_ACCESS_INDEX_budapest_perc") or
                    row.get("BUDAPEST_CAR_TRAIN_INDEX_total_min"), 999)
    nearest   = row.get("BUDAPEST_CAR_TRAIN_INDEX_nearest_station", "")

    turism_v  = flt(row.get("TURISM_INDEX_turism_index"), 0)
    pop_v     = flt(row.get("CULTURAL_INDEX_nepesseg_2024"), 0)
    # Turisztikai jelleg csak ha az index ténylegesen magas (nem csak relatívan)
    is_tourist = turism_r in ("magas", "kiemelkedő") and turism_v >= 20

    # Alaptípus meghatározása
    if stype == "főváros":
        identity = f"{name} Magyarország fővárosa és gazdasági, kulturális gravitációs központja."
    elif stype in ("megyeszékhely", "megyei jogú város"):
        label = "megye székhelye" if stype == "megyeszékhely" else "megyei jogú város"
        if jobs_r in ("magas", "kiemelkedő"):
            identity = f"{name} {county} {label} és önálló regionális gazdasági centrum."
        else:
            identity = f"{name} {county} {label}, erős regionális vonzáskörzettel."
    elif stype == "város":
        if is_tourist:
            identity = f"{name} turisztikai vonzerővel bíró kisváros {county} megyében."
        elif jobs_r in ("magas", "kiemelkedő") and bp_r in ("nagyon_alacsony", "alacsony"):
            identity = f"{name} önálló gazdasági karakterrel bíró vidéki város {county} megyében."
        elif sleep_r in ("magas", "kiemelkedő") and bp_r in ("magas", "kiemelkedő"):
            identity = f"{name} Budapest agglomerációjának tipikus alvóvárosa {county} megyében."
        elif sleep_r in ("magas", "kiemelkedő"):
            identity = f"{name} erős ingázó-karakterű kisváros {county} megyében, ahol az aktív népesség jelentős része máshol dolgozik."
        else:
            identity = f"{name} kisváros {county} megyében."
    elif stype in ("nagyközség", "község"):
        if is_tourist:
            identity = f"{name} turisztikai vonzerővel rendelkező {stype} {county} megyében."
        elif bp_r in ("magas", "kiemelkedő") and sleep_r in ("magas", "kiemelkedő"):
            identity = f"{name} Budapest közelében fekvő agglomerációs {stype}, amely elsősorban lakóhelyi funkciókat lát el."
        else:
            identity = f"{name} {county} megyei {stype}."
    else:
        identity = f"{name} {county} megyei település."

    # Budapest-kapcsolat kiegészítés
    bp_addon = ""
    if stype not in ("főváros",):
        if bp_r in ("nagyon_alacsony", "alacsony") and bp_min and bp_min > 0:
            bp_addon = f" A fővárostól való távolsága és rossz közlekedési kapcsolata periférikus helyzetbe szorítja."
        elif bp_r in ("magas", "kiemelkedő"):
            if bp_train in ("magas", "kiemelkedő"):
                bp_addon = f" Budapesttel mind közúton, mind vasúton viszonylag jó összeköttetésben áll."
            else:
                bp_addon = f" A főváros autóval elérhetően közel van."

    # Képzettség kiegészítés
    dipl_addon = ""
    if dipl_r == "kiemelkedő":
        dipl_addon = " Magasan képzett, szellemi foglalkozású népesség koncentrálódik itt."
    elif dipl_r == "nagyon_alacsony":
        dipl_addon = " A helyi népesség iskolai végzettsége az országos átlag alatt marad."

    return identity + bp_addon + dipl_addon


def block_economy(row: dict, d: dict) -> str:
    """2. bekezdés: munkapiac, gazdasági dinamika, ingázás."""
    name    = row["settlement_name"]
    jobs_r  = rank(flt(row.get("JOBS_INDEX_jobs_index")),             d["JOBS_INDEX_jobs_index"])
    sleep_r = rank(flt(row.get("SLEEPING_CITY_INDEX_sleeping_city_index")), d["SLEEPING_CITY_INDEX_sleeping_city_index"])
    jobs_v  = flt(row.get("JOBS_INDEX_jobs_index"), 0)

    if jobs_r == "kiemelkedő":
        economy = f"Helyi munkaerőpiaca kiemelkedően erős, a munkahelyek száma jóval meghaladja a helyi aktív keresők arányát – ez a környező térség számára is foglalkoztatási vonzerőt jelent."
    elif jobs_r == "magas":
        economy = f"Helyi szinten is érdemi munkalehetőség elérhető, nem kizárólag ingázással biztosítható a megélhetés."
    elif jobs_r == "közepes":
        economy = f"A munkaerőpiaci kínálat közepes – van helyi munkalehetőség, de a jobban fizető pozíciókért sokan ingáznak."
    elif jobs_r == "alacsony":
        economy = f"A helyi munkalehetőségek szűkösek, az aktív keresők többsége ingázásra kényszerül."
    else:
        economy = f"Szinte nincs érdemi helyi foglalkoztatás, a mindennapi munkavégzés szinte teljes mértékben ingázást feltételez."

    # Alvóváros jelleg kiegészítés
    if sleep_r == "kiemelkedő" and jobs_r in ("nagyon_alacsony", "alacsony"):
        economy += f" Az ittlakók döntő többsége naponta elhagyja a települést munkavégzés céljából – {name} funkcionálisan alvótelepülés."
    elif sleep_r in ("magas",) and jobs_r == "közepes":
        economy += " Mérsékelt alvóváros-jelleg is megfigyelhető."

    return economy


def block_realestate(row: dict, d: dict) -> str:
    """3. bekezdés: ingatlanpiac."""
    price_r    = rank(flt(row.get("INGATLANPIAC_house_avg_index")),     d["INGATLANPIAC_house_avg_index"])
    growth_r   = rank(flt(row.get("INGATLANPIAC_haz_emelkedes_pct")),   d["INGATLANPIAC_haz_emelkedes_pct"])
    price_raw  = str(row.get("INGATLANPIAC_haz_atlag", "")).replace("\xa0", " ").strip()
    turism_r   = rank(flt(row.get("TURISM_INDEX_turism_index")),        d["TURISM_INDEX_turism_index"])
    turism_v   = flt(row.get("TURISM_INDEX_turism_index"), 0)
    is_tourist = turism_r in ("magas", "kiemelkedő") and turism_v >= 20

    # Ár leírása
    if price_r == "kiemelkedő":
        price_txt = "Az ingatlanárak az országos átlag többszörösét teszik ki"
    elif price_r == "magas":
        price_txt = "Az ingatlanárak az országos átlag felett mozognak"
    elif price_r == "közepes":
        price_txt = "Az ingatlanárak közel vannak az országos átlaghoz"
    elif price_r == "alacsony":
        price_txt = "Az ingatlanárak az országos átlag alatt maradnak"
    else:
        price_txt = "Az ingatlanárak az ország legolcsóbbjai közé tartoznak"

    # Konkrét ár hozzáfűzése ha van
    if price_raw and "Ft" in price_raw:
        price_txt += f" (átlagos házár: {price_raw}/m²)"
    else:
        price_txt += ""

    # Trend
    if growth_r == "kiemelkedő":
        trend = ", az elmúlt évek áremelkedése kiugró volt."
    elif growth_r == "magas":
        trend = ", és az áremelkedés üteme meghaladja az országos átlagot."
    elif growth_r == "közepes":
        trend = ", az áremelkedés az országos átlagnak megfelelő ütemű."
    elif growth_r == "alacsony":
        trend = ", az értéknövekedés lassú volt az elmúlt években."
    else:
        trend = ", az ingatlanárak az elmúlt években alig emelkedtek vagy csökkentek."

    addon = ""
    if is_tourist:
        addon = " A turisztikai kereslet felfelé húzza az árakat."

    return price_txt + trend + addon


def block_services(row: dict, d: dict) -> str:
    """4. bekezdés: szolgáltatások, infrastruktúra, közlekedés."""
    cult_r    = rank(flt(row.get("CULTURAL_INDEX_cultural_index")),      d["CULTURAL_INDEX_cultural_index"])
    groc_r    = rank(flt(row.get("GROCERIES_INDEX_kisker_index")),       d["GROCERIES_INDEX_kisker_index"])
    sport_r   = rank(flt(row.get("SPORT_INDEX_sport_index")),            d["SPORT_INDEX_sport_index"])
    gastro_r  = rank(flt(row.get("GASTRO_INDEX_gasztro_index")),         d["GASTRO_INDEX_gasztro_index"])
    trans_r   = rank(flt(row.get("TRANSPORT_FREQUENCY_INDEX_transport_frequency_index")),
                     d["TRANSPORT_FREQUENCY_INDEX_transport_frequency_index"])
    mob_r     = rank(flt(row.get("URBAN_MOBILITY_INDEX_urban_mobility_index")),
                     d["URBAN_MOBILITY_INDEX_urban_mobility_index"])
    net_r     = rank(flt(row.get("INTERNET_INDEX_internet_index")),      d["INTERNET_INDEX_internet_index"])
    cinema    = flt(row.get("CULTURAL_INDEX_mozitermek_2024"), 0)
    theater   = flt(row.get("CULTURAL_INDEX_szinhaz_2024"), 0)
    napi_jarat = flt(row.get("TRANSPORT_FREQUENCY_INDEX_napi_jaratok"), 0)

    parts = []

    # Közlekedés
    if mob_r in ("magas", "kiemelkedő"):
        parts.append("városi tömegközlekedéssel rendelkezik")
    elif trans_r in ("nagyon_alacsony", "alacsony"):
        if napi_jarat is not None and napi_jarat < 5:
            parts.append("a közösségi közlekedés gyakorlatilag hiányzik")
        else:
            parts.append("a tömegközlekedési összeköttetés gyenge")
    elif trans_r == "közepes":
        parts.append("közepes sűrűségű tömegközlekedéssel bír")
    else:
        parts.append("rendszeres tömegközlekedési járatokkal rendelkezik")

    # Internet
    if net_r in ("nagyon_alacsony", "alacsony"):
        parts.append("az internetelérhetőség elmaradott")
    elif net_r == "kiemelkedő":
        parts.append("kiváló internet-infrastruktúrával")

    # Bevásárlás
    if groc_r in ("magas", "kiemelkedő"):
        parts.append("a kiskereskedelmi ellátottság jó")
    elif groc_r in ("nagyon_alacsony", "alacsony"):
        parts.append("alapvető bevásárlási lehetőségekért is távolabb kell utazni")

    # Kultúra
    if cult_r in ("magas", "kiemelkedő"):
        extra = []
        if cinema and cinema > 0: extra.append("mozi")
        if theater and theater > 0: extra.append("színház")
        if extra:
            parts.append(f"kulturális kínálata erős ({', '.join(extra)} is működik)")
        else:
            parts.append("kulturális kínálata az átlagot meghaladja")
    elif cult_r in ("nagyon_alacsony", "alacsony"):
        parts.append("kulturális infrastruktúra alig érhető el")

    # Gasztro / sport
    gastro_sport = []
    if gastro_r in ("magas", "kiemelkedő"):
        gastro_sport.append("vendéglátóhelyek")
    if sport_r in ("magas", "kiemelkedő"):
        gastro_sport.append("sportlétesítmények")
    if gastro_sport:
        parts.append(f"az elérhető {' és '.join(gastro_sport)} száma az átlag felett van")

    if not parts:
        return "A helyi szolgáltatások és infrastruktúra az országos átlagnak megfelelő szinten mozog."

    return "Infrastruktúra és szolgáltatások szempontjából: " + "; ".join(parts) + "."


def block_nature(row: dict, d: dict) -> str:
    """5. bekezdés: természeti környezet, levegőminőség."""
    forest_r = rank(flt(row.get("FOREST_INDEX_forest_index")),       d["FOREST_INDEX_forest_index"])
    water_r  = rank(flt(row.get("WATER_INDEX_water_index")),         d["WATER_INDEX_water_index"])
    air_r    = rank(flt(row.get("AIRPOLLUTION_INDEX_airpollution_index")), d["AIRPOLLUTION_INDEX_airpollution_index"])
    elev     = flt(row.get("TERRAIN_INDEX_elev_mean"), 0)

    parts = []

    if forest_r == "kiemelkedő":
        parts.append("kivételesen erdős, természetközeli környezetben helyezkedik el")
    elif forest_r == "magas":
        parts.append("az átlagosnál zöldebb, erdős térségben fekszik")
    elif forest_r in ("nagyon_alacsony", "alacsony") and water_r in ("nagyon_alacsony", "alacsony"):
        parts.append("természetes zöldfelületek és vízfelületek szinte nincsenek a közelében")

    if water_r in ("magas", "kiemelkedő"):
        parts.append("közel van vízfelülethez (tó, folyó vagy egyéb víztest)")

    if air_r == "kiemelkedő":
        parts.append("a levegőminőség kiemelkedően tiszta")
    elif air_r == "magas":
        parts.append("a levegőminőség az átlagnál jobb")
    elif air_r in ("nagyon_alacsony", "alacsony"):
        parts.append("a levegőszennyezettség meghaladja az átlagot")

    if elev and elev > 300:
        parts.append(f"dombos-hegyes terepen, átlagosan {int(elev)} m tengerszint feletti magasságban fekszik")

    if not parts:
        return ""

    return "Természeti adottságai: " + "; ".join(parts) + "."


def block_conclusion(row: dict, d: dict) -> str:
    """Záró értékelés: kinek érdemes, miben erős/gyenge."""
    name    = row["settlement_name"]
    stype   = row.get("CITYDATA_SettlementType", "")
    jobs_r   = rank(flt(row.get("JOBS_INDEX_jobs_index")),             d["JOBS_INDEX_jobs_index"])
    sleep_r  = rank(flt(row.get("SLEEPING_CITY_INDEX_sleeping_city_index")), d["SLEEPING_CITY_INDEX_sleeping_city_index"])
    price_r  = rank(flt(row.get("INGATLANPIAC_house_avg_index")),      d["INGATLANPIAC_house_avg_index"])
    bp_r     = rank(flt(row.get("BUDAPEST_ACCESS_INDEX_budapest_auto_index")), d["BUDAPEST_ACCESS_INDEX_budapest_auto_index"])
    nat_r    = rank(flt(row.get("FOREST_INDEX_forest_index")),         d["FOREST_INDEX_forest_index"])
    turism_r = rank(flt(row.get("TURISM_INDEX_turism_index")),         d["TURISM_INDEX_turism_index"])
    turism_v = flt(row.get("TURISM_INDEX_turism_index"), 0)
    cult_r   = rank(flt(row.get("CULTURAL_INDEX_cultural_index")),     d["CULTURAL_INDEX_cultural_index"])
    is_tourist = turism_r in ("magas", "kiemelkedő") and turism_v >= 20

    pros, cons = [], []

    # Előnyök
    if price_r in ("nagyon_alacsony", "alacsony"):
        pros.append("alacsony ingatlanárak")
    if jobs_r in ("magas", "kiemelkedő"):
        pros.append("erős helyi munkaerőpiac")
    if bp_r in ("magas", "kiemelkedő"):
        pros.append("jó budapesti elérhetőség")
    if nat_r in ("magas", "kiemelkedő"):
        pros.append("természetközeli életmód")
    if cult_r in ("magas", "kiemelkedő"):
        pros.append("gazdag kulturális kínálat")
    if is_tourist:
        pros.append("turisztikai vonzerő")

    # Hátrányok
    if price_r in ("magas", "kiemelkedő"):
        cons.append("magas ingatlanköltség")
    if jobs_r in ("nagyon_alacsony", "alacsony") and sleep_r in ("magas", "kiemelkedő"):
        cons.append("minimális helyi munkalehetőség")
    if bp_r in ("nagyon_alacsony", "alacsony") and stype not in ("főváros", "megyeszékhely"):
        cons.append("gyenge budapesti kapcsolat")
    if cult_r in ("nagyon_alacsony", "alacsony"):
        cons.append("szegényes szolgáltatáskínálat")

    # Összefoglalás
    if stype == "főváros":
        return "Azoknak racionális választás, akik a karriert, a kapcsolati hálót és a szolgáltatások sűrűségét mindennél előbbre sorolják – a cserébe fizetett ár a magas ingatlanköltség és a túlzsúfoltság."

    if pros and cons:
        return (f"Összességében: {'; '.join(pros)} jellemzik, ugyanakkor {'; '.join(cons)} is fennáll. "
                f"Annak érdemes mérlegelni, aki " +
                _for_whom(pros, cons, nat_r, jobs_r, price_r, bp_r) + ".")
    elif pros:
        return (f"Főbb erősségei: {'; '.join(pros)}. "
                f"Annak lehet vonzó, aki " + _for_whom(pros, cons, nat_r, jobs_r, price_r, bp_r) + ".")
    elif cons:
        return f"Korlátai ({'; '.join(cons)}) elsősorban azok számára jelentenek problémát, akik jobb elérhetőséget vagy szélesebb munkalehetőséget keresnek."
    else:
        return f"{name} átlagos adottságú település, amely nem kínál különösen kiemelkedő vagy kifejezetten rossz mutatókat egyetlen dimenzióban sem."


def _for_whom(pros, cons, nat_r, jobs_r, price_r, bp_r) -> str:
    if nat_r in ("magas", "kiemelkedő") and price_r in ("nagyon_alacsony", "alacsony"):
        return "alacsony lakhatási költségek mellett természetközeli életmódot keres"
    if bp_r in ("magas", "kiemelkedő") and price_r in ("alacsony", "közepes"):
        return "a főváros közelségét szeretné kihasználni olcsóbb lakhatás mellett"
    if jobs_r in ("magas", "kiemelkedő"):
        return "helyi karriert épít és nem akar naponta ingázni"
    if price_r in ("nagyon_alacsony", "alacsony"):
        return "minimalizálni akarja a lakhatási kiadásait"
    if nat_r in ("magas", "kiemelkedő"):
        return "a természetközelséget és csendesebb tempót részesíti előnyben a városi pezsgéssel szemben"
    return "tudatosan mérlegeli az elérhetőség, az árak és a helyi lehetőségek egyensúlyát"


# ── Összefoglaló összerakása ──────────────────────────────────────

def build_summary(row: dict, dist: dict) -> str:
    blocks = [
        block_identity(row, dist),
        block_economy(row, dist),
        block_realestate(row, dist),
        block_services(row, dist),
        block_nature(row, dist),
        block_conclusion(row, dist),
    ]
    # Üres blokkokat kihagyjuk
    blocks = [b for b in blocks if b and b.strip()]
    text   = " ".join(blocks)

    if len(text) > MAX_CHARS:
        # Csonkítás mondathatáron
        text = text[:MAX_CHARS].rsplit(".", 1)[0] + "."

    return text.strip()


# ── Haladás-kezelés ───────────────────────────────────────────────

def load_progress() -> dict:
    if PROGRESS_JSON.exists():
        with open(PROGRESS_JSON, encoding="utf-8") as f:
            return json.load(f)
    return {}

def save_progress(progress: dict):
    with open(PROGRESS_JSON, "w", encoding="utf-8") as f:
        json.dump(progress, f, ensure_ascii=False, indent=2)


# ── Főprogram ─────────────────────────────────────────────────────

def main():
    log(f"\n{'='*60}")
    log("Adatalapú település-elemző (max 1000 kar.)")
    log(f"{'='*60}")

    rows     = load_all_rows()
    dist     = compute_percentiles(rows)
    progress = load_progress()

    total = len(rows)
    log(f"Összes: {total} | Kész: {len(progress)} | Hátralévő: {total - len(progress)}\n")

    for i, row in enumerate(rows, 1):
        name = row.get("settlement_name", "").strip()
        if not name or name in progress:
            continue

        summary = build_summary(row, dist)
        progress[name] = summary

        log(f"[{i}/{total}] {name} ({len(summary)} kar.)")

        if i % SAVE_EVERY == 0:
            save_progress(progress)
            log(f"  [Mentve: {len(progress)}/{total}]")

    save_progress(progress)

    with open(OUTPUT_CSV, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["settlement_name", "summary", "char_count"])
        writer.writeheader()
        for row in rows:
            name = row.get("settlement_name", "").strip()
            if name and name in progress:
                s = progress[name]
                writer.writerow({"settlement_name": name, "summary": s, "char_count": len(s)})

    log(f"\nKÉSZ – {len(progress)} összefoglaló → {OUTPUT_CSV}")


if __name__ == "__main__":
    main()
