#!/usr/bin/env python3
"""
Wikipedia képletöltő script
Beolvassa az összes település nevét az ALL_PARAMETERS CSV-ből,
lekéri a Wikipedia képek URL-jeit (cache-ből vagy API-ból),
majd letölti a képeket a wikipedia_images/ mappába.
"""

import csv
import os
import re
import ssl
import time

# macOS SSL tanúsítvány fix
ssl._create_default_https_context = ssl._create_unverified_context
import json
import urllib.request
import urllib.parse
import urllib.error
from pathlib import Path

# --- Útvonalak ---
BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / "data"
ALL_PARAMS_CSV = DATA_DIR / "ALL_PARAMETERS_v3_supabase.csv"
CACHE_CSV = DATA_DIR / "settlement_wikipedia_images.csv"
OUTPUT_DIR = BASE_DIR / "wikipedia_images"
LOG_FILE = DATA_DIR / "wikipedia_download.log"

# --- Beállítások ---
DELAY_BETWEEN_API_CALLS = 0.5   # mp API hívások között
DELAY_BETWEEN_DOWNLOADS = 0.8   # mp letöltések között (Wikimedia policy miatt)
MAX_RETRIES = 3
IMAGE_WIDTH = 800                # kért képszélesség (px)

# Wikimedia bot policy: User-Agent kötelezően tartalmaz elérhetőséget
# https://w.wiki/4wJS
HEADERS = {"User-Agent": "WikiImageDownloader/1.0 (diploma project; p.gege9@gmail.com)"}


def log(msg):
    print(msg)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(msg + "\n")


def safe_filename(name: str) -> str:
    """Fájlnév-biztos változat a település nevéből."""
    name = name.replace(" ", "_")
    name = re.sub(r'[<>:"/\\|?*]', '', name)
    return name


def load_cache(cache_path: Path) -> dict:
    """Betölti a meglévő cache CSV-t {settlement_name: row_dict} formátumban."""
    cache = {}
    if not cache_path.exists():
        return cache
    with open(cache_path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            cache[row["settlement_name"]] = row
    return cache


def load_settlement_names(csv_path: Path) -> list:
    """Beolvassa az összes settlement_name-t az ALL_PARAMETERS CSV-ből."""
    names = []
    with open(csv_path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = row.get("settlement_name", "").strip()
            if name:
                names.append(name)
    return names


# Disambiguation esetén ezekkel a suffixekkel próbálkozunk
DISAMBIGUATION_SUFFIXES = [
    "(település)",
    "(Magyarország)",
    "(község)",
    "(város)",
    "(nagyközség)",
    "(falu)",
]


def _query_wikipedia_page(title: str) -> dict:
    """Egyetlen Wikipedia API hívás egy adott cím alapján."""
    encoded = urllib.parse.quote(title)
    api_url = (
        f"https://hu.wikipedia.org/w/api.php"
        f"?action=query"
        f"&titles={encoded}"
        f"&prop=pageimages|info"
        f"&inprop=url"
        f"&pithumbsize={IMAGE_WIDTH}"
        f"&format=json"
        f"&utf8=1"
    )
    for attempt in range(MAX_RETRIES):
        try:
            req = urllib.request.Request(api_url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            pages = data.get("query", {}).get("pages", {})
            if not pages:
                return {}
            return next(iter(pages.values()))
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = 5 * (2 ** attempt)
                time.sleep(wait)
            elif attempt == MAX_RETRIES - 1:
                return {}
            else:
                time.sleep(1)
        except Exception:
            if attempt == MAX_RETRIES - 1:
                return {}
            time.sleep(1)
    return {}


def _is_disambiguation(page: dict) -> bool:
    """Megállapítja, hogy az oldal egyértelműsítő lap-e."""
    title = page.get("title", "")
    return "(egyértelműsítő" in title.lower()


def _build_result(settlement_name: str, page: dict) -> dict:
    """Összerakja a result dict-et egy kész Wikipedia page objektumból."""
    result = {
        "settlement_name": settlement_name,
        "wikipedia_title": page.get("title", settlement_name),
        "wikipedia_page_id": str(page.get("pageid", "")),
        "photo_url": "",
        "photo_thumb_url": "",
        "photo_width": "",
        "photo_height": "",
        "photo_source": "wikipedia",
        "photo_attribution": f"Wikipédia – {page.get('title', settlement_name)}",
        "wikipedia_article_url": page.get("fullurl", ""),
        "fetch_status": "no_image",
        "fetch_note": "Nincs kép a Wikipedia oldalon",
    }
    thumbnail = page.get("thumbnail")
    if thumbnail:
        thumb_url = thumbnail.get("source", "")
        original_url = re.sub(r'/thumb(/[^/]+/[^/]+/[^/]+)/\d+px-.*', r'\1', thumb_url)
        result["photo_url"] = original_url if original_url != thumb_url else thumb_url
        result["photo_thumb_url"] = thumb_url
        result["photo_width"] = str(thumbnail.get("width", ""))
        result["photo_height"] = str(thumbnail.get("height", ""))
        result["fetch_status"] = "ok"
        result["fetch_note"] = ""
    return result


def fetch_wikipedia_image(settlement_name: str) -> dict:
    """
    Lekéri a Magyar Wikipédiáról a település főképét.
    Ha az alap keresés egyértelműsítő lapot ad, végigpróbálja a
    DISAMBIGUATION_SUFFIXES suffixeket (pl. '(település)', '(Magyarország)').
    """
    empty = {
        "settlement_name": settlement_name,
        "wikipedia_title": "", "wikipedia_page_id": "",
        "photo_url": "", "photo_thumb_url": "",
        "photo_width": "", "photo_height": "",
        "photo_source": "wikipedia", "photo_attribution": "",
        "wikipedia_article_url": "",
        "fetch_status": "error", "fetch_note": "",
    }

    # 1. Alap lekérés
    page = _query_wikipedia_page(settlement_name)
    if not page or page.get("missing") is not None:
        empty["fetch_status"] = "not_found"
        empty["fetch_note"] = "Wikipedia oldal nem létezik"
        return empty

    # 2. Ha egyértelműsítő lap → suffix-próbák
    if _is_disambiguation(page):
        for suffix in DISAMBIGUATION_SUFFIXES:
            time.sleep(0.3)
            candidate = _query_wikipedia_page(f"{settlement_name} {suffix}")
            if candidate and candidate.get("pageid") and candidate.get("missing") is None:
                if not _is_disambiguation(candidate):
                    return _build_result(settlement_name, candidate)
        # Egyik sem jött be
        empty["fetch_status"] = "disambiguation"
        empty["fetch_note"] = f"Egyértelműsítő lap, suffix sem segített"
        return empty

    return _build_result(settlement_name, page)


def download_image(url: str, dest_path: Path) -> bool:
    """Letölt egy képet az adott URL-ről a dest_path helyre."""
    for attempt in range(MAX_RETRIES):
        try:
            req = urllib.request.Request(
                url,
                headers=HEADERS
            )
            with urllib.request.urlopen(req, timeout=20) as resp:
                data = resp.read()
            with open(dest_path, "wb") as f:
                f.write(data)
            return True
        except Exception as e:
            if attempt == MAX_RETRIES - 1:
                log(f"  ✗ Letöltési hiba ({dest_path.name}): {e}")
                return False
            time.sleep(1)
    return False


def image_extension(url: str) -> str:
    """Kép kiterjesztés kinyerése az URL-ből."""
    path = urllib.parse.urlparse(url).path
    ext = os.path.splitext(path)[1].lower()
    if ext in (".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp"):
        return ext
    return ".jpg"


def update_cache_csv(cache_path: Path, rows: list):
    """Felülírja a cache CSV-t a frissített sorokkal."""
    fieldnames = [
        "settlement_name", "wikipedia_title", "wikipedia_page_id",
        "photo_url", "photo_thumb_url", "photo_width", "photo_height",
        "photo_source", "photo_attribution", "wikipedia_article_url",
        "fetch_status", "fetch_note"
    ]
    with open(cache_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def main():
    OUTPUT_DIR.mkdir(exist_ok=True)
    log(f"\n{'='*60}")
    log(f"Wikipedia képletöltő indítása")
    log(f"Kimeneti mappa: {OUTPUT_DIR}")
    log(f"{'='*60}")

    # 1. Betöltés
    settlement_names = load_settlement_names(ALL_PARAMS_CSV)
    log(f"Települések száma (ALL_PARAMETERS): {len(settlement_names)}")

    cache = load_cache(CACHE_CSV)
    log(f"Cache-ben lévő bejegyzések: {len(cache)}")

    # Hibás és disambiguation bejegyzések törlése → újra lekérjük
    retry_names = [n for n, v in cache.items()
                   if v.get("fetch_status") in ("error", "disambiguation")]
    for n in retry_names:
        del cache[n]
    if retry_names:
        log(f"Újra lekérendő (hiba/disambiguation): {len(retry_names)}")

    # 2. Hiányzó URL-ek lekérése Wikipedia API-ról
    missing = [n for n in settlement_names if n not in cache]
    log(f"Hiányzó Wikipedia lekérések: {len(missing)}")

    if missing:
        log(f"\nWikipedia API lekérések...")
        for i, name in enumerate(missing, 1):
            log(f"  [{i}/{len(missing)}] {name}")
            result = fetch_wikipedia_image(name)
            cache[name] = result
            time.sleep(DELAY_BETWEEN_API_CALLS)

            # Mentés minden 50. után
            if i % 50 == 0:
                rows = [cache[n] for n in settlement_names if n in cache]
                update_cache_csv(CACHE_CSV, rows)
                log(f"  → Cache mentve ({i} feldolgozva)")

        # Végső mentés
        rows = [cache[n] for n in settlement_names if n in cache]
        update_cache_csv(CACHE_CSV, rows)
        log(f"Cache frissítve: {CACHE_CSV}")

    # 3. Képek letöltése
    log(f"\nKépek letöltése → {OUTPUT_DIR}")
    ok_entries = [
        cache[n] for n in settlement_names
        if n in cache and cache[n].get("fetch_status") == "ok"
           and cache[n].get("photo_thumb_url")
    ]
    log(f"Letölthető képek: {len(ok_entries)} / {len(settlement_names)}")

    downloaded = 0
    skipped = 0
    failed = 0

    for i, entry in enumerate(ok_entries, 1):
        name = entry["settlement_name"]
        url = entry.get("photo_thumb_url") or entry.get("photo_url")
        if not url:
            continue

        ext = image_extension(url)
        filename = safe_filename(name) + ext
        dest = OUTPUT_DIR / filename

        if dest.exists():
            skipped += 1
            continue

        log(f"  [{i}/{len(ok_entries)}] {name} → {filename}")
        success = download_image(url, dest)
        if success:
            downloaded += 1
        else:
            failed += 1
        time.sleep(DELAY_BETWEEN_DOWNLOADS)

    # 4. Összefoglaló
    no_image = sum(
        1 for n in settlement_names
        if n in cache and cache[n].get("fetch_status") in ("no_image", "not_found")
    )
    log(f"\n{'='*60}")
    log(f"KÉSZ!")
    log(f"  Letöltve (új):       {downloaded}")
    log(f"  Már megvolt:         {skipped}")
    log(f"  Letöltési hiba:      {failed}")
    log(f"  Nincs Wikipedia kép: {no_image}")
    log(f"  Összesen feldolgozva: {len(settlement_names)}")
    log(f"  Képek helye: {OUTPUT_DIR}")
    log(f"{'='*60}\n")


if __name__ == "__main__":
    main()
