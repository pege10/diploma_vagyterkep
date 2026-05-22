#!/usr/bin/env python3
"""
Wikipedia alapú 3-mondatos leírás generátor
--------------------------------------------
Minden magyarországi településhez lekéri a Wikipedia cikk szövegét,
majd az első ~5 mondatból 3 mondatot válogat ki, ami lefedi:
  1. Elhelyezkedés / geográfiai kontextus
  2. Történelmi vagy kulturális háttér
  3. Fontosság / egyéb jellemző

Kimenet: data/settlement_wikipedia_descriptions.csv
Résumable: progress cache-t használ, megszakítás esetén folytatható.
"""

import csv
import json
import re
import ssl
import time
import urllib.parse
import urllib.request
import urllib.error
from pathlib import Path

# macOS SSL tanúsítvány fix
ssl._create_default_https_context = ssl._create_unverified_context

# --- Útvonalak ---
BASE_DIR      = Path(__file__).parent
DATA_DIR      = BASE_DIR / "data"
IMAGE_CACHE   = DATA_DIR / "settlement_wikipedia_images.csv"
ALL_PARAMS    = DATA_DIR / "ALL_PARAMETERS_v3_supabase.csv"
OUTPUT_CSV    = DATA_DIR / "settlement_wikipedia_descriptions.csv"
PROGRESS_JSON = DATA_DIR / "wiki_descriptions_progress.json"
LOG_FILE      = DATA_DIR / "wiki_descriptions.log"

# --- Beállítások ---
DELAY         = 0.4       # mp API hívások között
MAX_RETRIES   = 3
SAVE_EVERY    = 100       # ennyi feldolgozás után ment
MAX_SENTENCES = 15        # ennyi mondatot kérünk a Wikipedia API-tól
TARGET_CHARS  = 400       # cél hossz karakterben (~3 mondat)
MIN_CHARS     = 250       # ennél rövidebb → teljes cikket is megpróbálja

HEADERS = {"User-Agent": "WikiDescriptionFetcher/1.0 (diploma project; p.gege9@gmail.com)"}


# ── Segédfüggvények ─────────────────────────────────────────────────

def log(msg: str):
    print(msg)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(msg + "\n")


def load_settlement_names() -> list:
    names = []
    with open(ALL_PARAMS, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            name = row.get("settlement_name", "").strip()
            if name:
                names.append(name)
    return names


def load_image_cache() -> dict:
    """Visszaadja a {settlement_name: wikipedia_title} dict-et."""
    cache = {}
    if not IMAGE_CACHE.exists():
        return cache
    with open(IMAGE_CACHE, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            title = row.get("wikipedia_title", "").strip()
            if title:
                cache[row["settlement_name"]] = title
    return cache


def load_progress() -> dict:
    if PROGRESS_JSON.exists():
        with open(PROGRESS_JSON, encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_progress(progress: dict):
    with open(PROGRESS_JSON, "w", encoding="utf-8") as f:
        json.dump(progress, f, ensure_ascii=False, indent=2)


def save_output(progress: dict, names: list):
    fieldnames = ["settlement_name", "wikipedia_title", "description", "fetch_status"]
    with open(OUTPUT_CSV, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for name in names:
            if name in progress:
                writer.writerow(progress[name])


# ── Wikipedia API ────────────────────────────────────────────────────

def fetch_extract(title: str, intro_only: bool = True) -> str | None:
    """Lekéri a Wikipedia cikk kivonatát.
    intro_only=True: csak a bevezető (gyors, de kis cikkeknél kevés)
    intro_only=False: teljes cikk első N mondata (kis falvakhoz)
    """
    encoded = urllib.parse.quote(title)
    if intro_only:
        limit_param = f"&exsentences={MAX_SENTENCES}&exintro=1"
    else:
        # exchars garantálja hogy szekciótartalmat is visszakap, nem csak az intrót
        limit_param = "&exchars=3000"
    url = (
        f"https://hu.wikipedia.org/w/api.php"
        f"?action=query"
        f"&titles={encoded}"
        f"&prop=extracts"
        f"{limit_param}"
        f"&explaintext=1"
        f"&format=json"
        f"&utf8=1"
    )
    for attempt in range(MAX_RETRIES):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            pages = data.get("query", {}).get("pages", {})
            if not pages:
                return None
            page = next(iter(pages.values()))
            if page.get("missing") is not None:
                return None
            return page.get("extract", "") or None
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = 5 * (2 ** attempt)
                log(f"    429 – várakozás {wait}s")
                time.sleep(wait)
            elif attempt == MAX_RETRIES - 1:
                return None
            else:
                time.sleep(1)
        except Exception as ex:
            if attempt == MAX_RETRIES - 1:
                log(f"    Hiba: {ex}")
                return None
            time.sleep(1)
    return None


# ── Szövegfeldolgozás ────────────────────────────────────────────────

# Idegen nyelvi nevek mintája: (németül: Erlau, latinul: Agria, szlovákul: Jáger)
# Ezeket teljes egészében eltávolítjuk a szövegből
FOREIGN_NAMES_RE = re.compile(
    r'\([^)]*(?:németül|latinul|szlovákul|szerbül|horvátul|románul|szlovénül|'
    r'ukránul|törökül|lengyelül|csehül|oroszul|görögül|olaszul|franciául|'
    r'angolul|ruszinul|burgenlandi|vendül|cigányul)[^)]*\)',
    re.IGNORECASE
)

# Mondatszintű kiszűrők (meta, közlekedési, útleírás, polgármester-listák)
SKIP_PATTERNS = [
    r"egyértelműsítő lap",
    r"lap az azonos",
    r"wikip[eé]dia",
    r"a következő",
    r"lásd még",
    r"infobox",
    r"koordin[aá]t",
    r"\b(?:főút|mellékút|bekötőút|közút|autópálya)\b",
    r"\b(?:vasút(?:vonal|állomás)?|vasúti|MÁV)\b",
    r"\b(?:tömegközlekedés|buszvonal|autóbusz(?:járat)?|HÉV)\b",
    r"megközelít",
    r"gépkocsival",
    r"\d+-es\s+(?:sz[aá]m[uú]\s+)?(?:út|főút)",
    r"úton\s+(?:haladva|tovább)",
    # Polgármester-listák és választási szövegek
    r"\d{4}[–\-]\d{4}\s*:",          # "1990–1994: Kovács János (független)"
    r"időközi\s+polgármester",
    r"képviselő-testület",
    r"\bpolgármester-választás",
    # Városrész/kerületnév felsorolások (pl. "33 városrészből áll: Adyliget, Budaliget, ...")
    r"városrész\w*\s+\w*:\s+[A-ZÁÉÍÓÖŐÚÜŰ]",
    r"kerületrész\w*\s+\w*:\s+[A-ZÁÉÍÓÖŐÚÜŰ]",
    # Középkori oklevél-hivatkozások
    r"\bDL\b\s*\d+",
    # Népszámlálás adatsor-szöveg
    r"A\s+település\s+népességének\s+változása",
]
SKIP_RE = re.compile("|".join(SKIP_PATTERNS), re.IGNORECASE)


def has_admin_location(s: str) -> bool:
    """True ha a mondat vármegyét vagy járást említ (bármilyen alakban)."""
    sl = s.lower()
    return "várm" in sl or "járás" in sl

# "Kemence község Pest..." → "Kemence Pest..."
SETTLEMENT_TYPE_RE = re.compile(
    r'^([A-ZÀ-ž][a-zÀ-ž\-]+'
    r'(?:\s[A-ZÀ-ž][a-zÀ-ž\-]+)*)'
    r'\s+(?:megyei\s+jog[uú]\s+v[aá]ros|főv[aá]ros|v[aá]ros'
    r'|nagyk[oö]zs[eé]g|k[oö]zs[eé]g|falu|telep)\b',
)

# Magyar véges igék — ha bármelyik megvan, a mondat nem igétlen
HUNGARIAN_VERB_RE = re.compile(
    r'\b(?:van|volt|[aá]ll|feksz\w+|[eé]l\b|tal[aá]l\w+|rendelkez\w+|sz[aá]m[ií]t\w+|'
    r'ter[uü]l\w+|folyik|h[uú]z[oó]d\w+|emelked\w+|ered\b|vezet\w+|z[aá]rja|hat[aá]rolja|'
    r'k[eé]pezi|alkotja|ny[uú]lik|k[ií]n[aá]l\w+|tartalmaz\w+|ny[uú]jt\w+|[eé]p[uü]l\w+|'
    r'alap[ií]t\w+|jelent\w+|ragad\w+|h[ií]vj[aá]k|nevez\w+|tartoz\w+|'
    r'v[aá]lasztja|adja|[oö]vezi|k[oö]ti|hat[aá]rolja|sz[eé]khelye|'
    r'kapuj[aá]ban)\b'
    r'|\w+(?:j[aá]k|j[uü]k|ott|ett|[oö]tt|unk|[uü]nk)\b',
    re.IGNORECASE
)

# Helyhatározóragra végződő mondat (igétlen helymeghatározás jelzője)
LOCATIVE_END_RE = re.compile(
    r'\w+(?:ban|ben|n[aá]l|n[eé]l|t[oó]l|t[eé]l'
    r'|b[oó]l|b[eé]l|[aá]n|[eé]n|[oó]n|ra|re'
    r'|hoz|hez|h[oő]z|ig)\.$',
    re.IGNORECASE
)


def strip_wiki_headers(text: str) -> str:
    """Soronként eltávolítja a == Fekvése == típusú wiki fejléceket."""
    lines = []
    for line in text.split('\n'):
        if re.match(r'^\s*={2,}[^=]+=+\s*$', line):
            continue
        lines.append(line)
    return '\n'.join(lines)


def fix_abbreviations(text: str) -> str:
    """Rövidítéseket és szimbólumokat kiír teljes szóra."""
    text = re.sub(r'~\s*(\d)', r'körülbelül \1', text)
    text = re.sub(r'(\d+)\s*km\b', r'\1 kilométer', text)
    text = re.sub(r'(\d+)\s*m\b(?!\w)', r'\1 méter', text)
    return text


def remove_foreign_names(text: str) -> str:
    """Eltávolítja az idegen nyelvű névmegfelelőket; wiki fejléceket soronként."""
    text = strip_wiki_headers(text)
    text = FOREIGN_NAMES_RE.sub("", text)
    text = re.sub(r"\(\s*\)", "", text)
    text = fix_abbreviations(text)
    text = re.sub(r"\s{2,}", " ", text)
    return text.strip()


def strip_settlement_type(sentence: str) -> str:
    """'Kemence község ...' → 'Kemence ...'"""
    return SETTLEMENT_TYPE_RE.sub(r'\1', sentence)


def fix_missing_verb(sentence: str) -> str:
    """
    Ha a mondat helyhatározóragra végződik és nincs benne felismerhető ige,
    hozzáfűzi a 'helyezkedik el'-t. Csak nagyon specifikus esetben alkalmaz.
    """
    if not sentence.endswith('.'):
        return sentence
    if HUNGARIAN_VERB_RE.search(sentence):
        return sentence
    if LOCATIVE_END_RE.search(sentence):
        return sentence[:-1] + ' helyezkedik el.'
    return sentence


def split_on_semicolons(sentence: str) -> list[str]:
    """Pontosvesszőn kettébontja a hosszú, összetett mondatokat."""
    parts = [p.strip() for p in sentence.split(';')]
    result = []
    for i, part in enumerate(parts):
        if not part:
            continue
        if i == 0:
            if not part.endswith('.'):
                part += '.'
        else:
            part = part[0].upper() + part[1:]
            if not part.endswith('.'):
                part += '.'
        result.append(part)
    return result


def process_sentence(s: str) -> str:
    """Egy mondaton elvégzi az összes tisztítást."""
    s = strip_settlement_type(s)
    s = fix_missing_verb(s)
    return s.strip()


def clean_extract(text: str) -> list[str]:
    """Wiki fejléceket és idegen neveket kivesz, mondatokra bont, szűr."""
    text = remove_foreign_names(text)
    text = re.sub(r"\s+", " ", text).strip()
    # Csak nagybetűvel kezdődő új mondat előtt vágunk — így a "20. század"
    # típusú számozások nem törik szét a mondatot
    raw_sentences = re.split(r'(?<=[.!?])\s+(?=[A-ZÁÉÍÓÖŐÚÜŰ])', text)
    sentences = []
    for s in raw_sentences:
        s = s.strip()
        if len(s) < 20:
            continue
        if SKIP_RE.search(s):
            continue
        # Pontosvessző-bontás ELŐBB, hogy az "X; Heves vármegye Y" típusú
        # mondatokból a jó rész megmaradjon
        parts = split_on_semicolons(s) if ';' in s else [s]
        for part in parts:
            part = part.strip()
            if len(part) < 20:
                continue
            if SKIP_RE.search(part):
                continue
            # Admin helymeghatározást tartalmazó részt kizárjuk
            if has_admin_location(part):
                continue
            part = process_sentence(part)
            if len(part) >= 20 and len(part) <= 300:
                sentences.append(part)
            elif len(part) > 300 and not SKIP_RE.search(part):
                # Nagyon hosszú mondat: csak akkor fogadjuk el, ha nincs benne
                # listaszerű szerkezet (sok vessző) — egyébként kiszűrjük
                comma_count = part.count(',')
                if comma_count < 5:
                    sentences.append(part)
    return sentences


def pick_description(sentences: list[str]) -> str:
    """
    Cél: 350–420 karakter, soha nem vág el mondatot.
    - Addig fűz mondatokat, amíg el nem éri a 350-et (max 7 mondat).
    - Ha a következő mondat már 420 fölé vinne ÉS már van 350+ karakter, megáll.
    - Ha soha nem éri el a 350-et (kevés tartalom), visszaad amennyit tud.
    - Hard cap: 480 karakter felett soha nem megy (túl hosszú listák ellen).
    """
    TARGET_LOW  = 350
    TARGET_HIGH = 420
    HARD_CAP    = 480   # abszolút felső határ

    if not sentences:
        return ""

    result = []
    total = 0
    for s in sentences[:10]:
        new_len = total + len(s) + (1 if result else 0)
        # Abszolút felső határ — ha már van legalább 1 mondat, megállunk
        if result and new_len > HARD_CAP:
            break
        # Ha már elértük az alsó határt és ez a mondat túllépné a felsőt: stop
        if total >= TARGET_LOW and new_len > TARGET_HIGH:
            break
        result.append(s)
        total = new_len
        # Elértük a célt: stop
        if total >= TARGET_LOW:
            break
        if len(result) == 7:
            break

    return " ".join(result)


# ── Fő logika ────────────────────────────────────────────────────────

DISAMBIGUATION_SUFFIXES = [
    "(település)",
    "(Magyarország)",
    "(község)",
    "(város)",
    "(nagyközség)",
    "(falu)",
    # Vármegye-alapú egyértelműsítés (pl. Kisfalud → Kisfalud (Győr-Moson-Sopron vármegye))
    "(Baranya vármegye)",
    "(Bács-Kiskun vármegye)",
    "(Békés vármegye)",
    "(Borsod-Abaúj-Zemplén vármegye)",
    "(Csongrád-Csanád vármegye)",
    "(Fejér vármegye)",
    "(Győr-Moson-Sopron vármegye)",
    "(Hajdú-Bihar vármegye)",
    "(Heves vármegye)",
    "(Jász-Nagykun-Szolnok vármegye)",
    "(Komárom-Esztergom vármegye)",
    "(Nógrád vármegye)",
    "(Pest vármegye)",
    "(Somogy vármegye)",
    "(Szabolcs-Szatmár-Bereg vármegye)",
    "(Tolna vármegye)",
    "(Vas vármegye)",
    "(Veszprém vármegye)",
    "(Zala vármegye)",
]


def get_description(settlement_name: str, wiki_title: str | None) -> dict:
    """
    Lekéri és feldolgozza a Wikipedia szöveget egy településhez.
    1. Ismert Wikipedia cím (képcache-ből) → intro
    2. Alap név → intro
    3. Ha az intro csak 1 rövid mondat → teljes cikk első N mondata
    4. Suffix-ek (disambiguation feloldás)
    """
    empty = {
        "settlement_name": settlement_name,
        "wikipedia_title": wiki_title or "",
        "description": "",
        "fetch_status": "error",
    }

    # Próbák sorrendje: ismert cím → alap név → suffix-ek
    candidates = []
    if wiki_title and wiki_title != settlement_name:
        candidates.append(wiki_title)
    candidates.append(settlement_name)
    for suf in DISAMBIGUATION_SUFFIXES:
        candidates.append(f"{settlement_name} {suf}")

    for title in candidates:
        # 1. Intro lekérése
        extract = fetch_extract(title, intro_only=True)
        if not extract:
            time.sleep(0.15)
            continue

        sentences = clean_extract(extract)
        description = pick_description(sentences)

        # 2. Ha rövid vagy üres → teljes cikk (exchars=3000, szekciótartalommal)
        if len(description) < MIN_CHARS:
            time.sleep(0.2)
            full_extract = fetch_extract(title, intro_only=False)
            if full_extract:
                full_sentences = clean_extract(full_extract)
                if len(full_sentences) >= len(sentences):
                    description = pick_description(full_sentences)

        if description:
            return {
                "settlement_name": settlement_name,
                "wikipedia_title": title,
                "description": description,
                "fetch_status": "ok",
            }
        time.sleep(0.15)

    # Végső fallback: ha minden szűrés után sem volt jó szöveg, az első
    # elérhető extract legelső mondatát adjuk vissza szűrés nélkül
    # (legalább valami legyen minden településhez)
    for title in candidates[:3]:
        extract = fetch_extract(title, intro_only=False)
        if not extract:
            continue
        # Csak a fejléceket és idegen neveket távolítjuk el, admin szűrés nélkül
        text = remove_foreign_names(extract)
        text = re.sub(r"\s+", " ", text).strip()
        raw = re.split(r'(?<=[.!?])\s+(?=[A-ZÁÉÍÓÖŐÚÜŰ])', text)
        fallback_sentences = []
        for s in raw:
            s = strip_settlement_type(s.strip())
            if len(s) >= 20 and not SKIP_RE.search(s):
                fallback_sentences.append(s)
        if fallback_sentences:
            description = pick_description(fallback_sentences)
            if description:
                return {
                    "settlement_name": settlement_name,
                    "wikipedia_title": title,
                    "description": description,
                    "fetch_status": "ok",
                }
        time.sleep(0.15)

    empty["fetch_status"] = "not_found"
    empty["description"] = ""
    return empty


def main():
    log(f"\n{'='*60}")
    log("Wikipedia leírás-generátor indítása")
    log(f"{'='*60}")

    names      = load_settlement_names()
    wiki_cache = load_image_cache()
    progress   = load_progress()

    log(f"Összes település: {len(names)}")
    log(f"Képcache-ből ismert Wikipedia cím: {len(wiki_cache)}")
    log(f"Már feldolgozva (progress): {len(progress)}")

    todo = [n for n in names if n not in progress]
    log(f"Feldolgozandó: {len(todo)}")

    if not todo:
        log("Nincs tennivaló – minden feldolgozva.")
        save_output(progress, names)
        return

    for i, name in enumerate(todo, 1):
        wiki_title = wiki_cache.get(name)
        log(f"  [{i}/{len(todo)}] {name} (Wikipedia: {wiki_title or 'ismeretlen'})")

        result = get_description(name, wiki_title)
        progress[name] = result

        status = result["fetch_status"]
        chars  = len(result["description"])
        log(f"    → {status} | {chars} kar.")

        time.sleep(DELAY)

        if i % SAVE_EVERY == 0:
            save_progress(progress)
            save_output(progress, names)
            log(f"  ── Mentve ({i} feldolgozva) ──")

    save_progress(progress)
    save_output(progress, names)

    ok       = sum(1 for v in progress.values() if v["fetch_status"] == "ok")
    not_found = sum(1 for v in progress.values() if v["fetch_status"] == "not_found")
    error    = sum(1 for v in progress.values() if v["fetch_status"] == "error")

    log(f"\n{'='*60}")
    log(f"KÉSZ!")
    log(f"  OK:          {ok}")
    log(f"  Nem található: {not_found}")
    log(f"  Hiba:        {error}")
    log(f"  Kimenet: {OUTPUT_CSV}")
    log(f"{'='*60}\n")


if __name__ == "__main__":
    main()
