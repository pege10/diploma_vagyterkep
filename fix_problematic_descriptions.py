#!/usr/bin/env python3
"""
Problémás leírások javítása
----------------------------
Megkeresi és újragenerálja:
  1. Üres / hiányzó leírásokat
  2. 550+ karakteres leírásokat (túl hosszúak)
  3. Polgármester-felsorolást tartalmazó leírásokat
  4. Budapesti kerületeket (különleges Wikipedia-cím kezelés)

Futtatás:
    python3 fix_problematic_descriptions.py
"""

import csv
import json
import re
import ssl
import time
from pathlib import Path

ssl._create_default_https_context = ssl._create_unverified_context

import sys
sys.path.insert(0, str(Path(__file__).parent))
from generate_wikipedia_descriptions import (
    get_description, load_settlement_names,
    save_progress, save_output, log,
    DATA_DIR, OUTPUT_CSV, PROGRESS_JSON,
    fetch_extract, clean_extract, pick_description, remove_foreign_names,
    strip_settlement_type, SKIP_RE
)
import re as _re

# ── Budapest kerület névmapping ────────────────────────────────────────

ROMAN = r'(?:X{0,3})(?:IX|IV|V?I{0,3})'
DISTRICT_RE = re.compile(
    r'^(' + ROMAN + r')\.\s+kerület$',
    re.IGNORECASE
)


def budapest_wiki_titles(name: str) -> list[str]:
    m = DISTRICT_RE.match(name)
    if not m:
        return []
    roman = m.group(1)
    return [
        f"Budapest {roman}. kerülete",
        f"Budapest {roman}. kerület",
        f"{roman}. kerület (Budapest)",
    ]


# ── Problémás sorok azonosítása ────────────────────────────────────────

MIN_OK_CHARS   = 200    # ennél rövidebb → újragenerálás (apró falvak realista határa)
MAX_OK_CHARS   = 550    # ennél hosszabb → újragenerálás
POLGARMESTER_RE = re.compile(r'polgármester|\d{4}[–\-]\d{4}\s*:', re.IGNORECASE)


def is_problematic(row: dict) -> bool:
    desc = row.get("description", "").strip()
    if not desc:
        return True
    if len(desc) < MIN_OK_CHARS:
        return True
    if len(desc) > MAX_OK_CHARS:
        return True
    if POLGARMESTER_RE.search(desc):
        return True
    return False


# ── Segédfüggvény: nagy extract (8000 karakter) ───────────────────────

import urllib.parse, urllib.request, urllib.error, ssl as _ssl

_HEADERS = {"User-Agent": "WikiDescriptionFetcher/1.0 (diploma project; p.gege9@gmail.com)"}

def _fetch_big(title: str) -> str | None:
    """8000 karakteres Wikipedia lekérés rövid cikkekhez."""
    encoded = urllib.parse.quote(title)
    url = (
        f"https://hu.wikipedia.org/w/api.php?action=query"
        f"&titles={encoded}&prop=extracts&exchars=8000"
        f"&explaintext=1&format=json&utf8=1"
    )
    try:
        req = urllib.request.Request(url, headers=_HEADERS)
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = __import__('json').loads(resp.read().decode("utf-8"))
        pages = data.get("query", {}).get("pages", {})
        if not pages:
            return None
        page = next(iter(pages.values()))
        if page.get("missing") is not None:
            return None
        return page.get("extract", "") or None
    except Exception:
        return None


# ── Fő logika ──────────────────────────────────────────────────────────

def main():
    log(f"\n{'='*60}")
    log("Problémás leírások javítása")
    log(f"{'='*60}")

    all_names = load_settlement_names()

    progress = {}
    if PROGRESS_JSON.exists():
        with open(PROGRESS_JSON, encoding="utf-8") as f:
            progress = json.load(f)

    # Azonosítás
    to_fix = []
    for name in all_names:
        if name not in progress:
            to_fix.append((name, "hiányzó"))
            continue
        row = progress[name]
        if is_problematic(row):
            desc = row.get("description", "").strip()
            if not desc:
                reason = "üres"
            elif len(desc) < MIN_OK_CHARS:
                reason = f"túl rövid ({len(desc)} kar.)"
            elif len(desc) > MAX_OK_CHARS:
                reason = f"túl hosszú ({len(desc)} kar.)"
            else:
                reason = "polgármester-lista"
            to_fix.append((name, reason))

    log(f"Összes settlement: {len(all_names)}")
    log(f"Javítandó sorok:   {len(to_fix)}")

    if not to_fix:
        log("Nincs javítandó sor!")
        return

    # Statisztika a javítandókhoz
    for name, reason in to_fix[:20]:
        log(f"  • {name}: {reason}")
    if len(to_fix) > 20:
        log(f"  ... és még {len(to_fix)-20} db")

    log(f"\nFeldolgozás indul...\n")

    fixed = 0
    failed = 0

    for i, (name, reason) in enumerate(to_fix, 1):
        log(f"[{i}/{len(to_fix)}] {name} ({reason})")

        # Budapest kerület speciális kezelés
        bp_titles = budapest_wiki_titles(name)
        if bp_titles:
            log(f"  → Budapest kerület: {bp_titles[0]}")
            result = get_description(name, bp_titles[0])
            if result["fetch_status"] != "ok":
                for alt in bp_titles[1:]:
                    result = get_description(name, alt)
                    if result["fetch_status"] == "ok":
                        break
        else:
            # Ismert Wikipedia cím megőrzése (ha volt jó, de hosszú)
            old_title = progress.get(name, {}).get("wikipedia_title") or None
            result = get_description(name, old_title)

            # Ha még mindig rövid (<200 kar.), próbálj exchars=8000-rel is
            if len(result.get("description", "")) < MIN_OK_CHARS and result.get("wikipedia_title"):
                found_title = result["wikipedia_title"]
                log(f"  → Rövid eredmény, exchars=8000 próba: {found_title}")
                big_extract = _fetch_big(found_title)
                if big_extract:
                    sentences = clean_extract(big_extract)
                    big_desc = pick_description(sentences)
                    if len(big_desc) > len(result.get("description", "")):
                        result["description"] = big_desc
                        log(f"  → exchars=8000 javított: {len(big_desc)} kar.")

        new_desc  = result.get("description", "").strip()
        old_desc  = progress.get(name, {}).get("description", "").strip()
        is_mayor  = "polgármester-lista" in reason

        # Csak akkor cseréljük, ha az új TÉNYLEGESEN jobb:
        #   - polgármester-listás vagy üres: mindig csere (tartalom-hiba)
        #   - túl hosszú: csere ha az új rövidebb (javult)
        #   - túl rövid: csere csak ha az új HOSSZABB mint a régi
        should_update = False
        if not old_desc:
            should_update = True                            # üres → bármit elfogad
        elif is_mayor or "üres" in reason:
            should_update = True                            # tartalom-hiba → mindig csere
        elif "túl hosszú" in reason:
            should_update = len(new_desc) <= MAX_OK_CHARS  # csak ha megjavult
        elif "túl rövid" in reason:
            should_update = len(new_desc) > len(old_desc)  # csak ha hosszabb lett

        if should_update and new_desc:
            progress[name] = result
            action = "frissítve"
        else:
            action = "megtartva (régi jobb vagy nem javult)"

        chars  = len(new_desc) if should_update else len(old_desc)
        status = result["fetch_status"]
        log(f"  → {status} | {chars} kar. [{action}]")
        if new_desc:
            log(f"     {new_desc[:120]}...")

        if should_update and status == "ok" and new_desc:
            fixed += 1
        elif not should_update:
            fixed += 1   # régi megtartva, de az is OK
        else:
            failed += 1

        time.sleep(0.5)

    # Mentés
    save_progress(progress)
    save_output(progress, all_names)

    log(f"\n{'='*60}")
    log(f"KÉSZ!")
    log(f"  Sikeresen javított: {fixed}")
    log(f"  Nem sikerült:       {failed}")
    log(f"  Kimenet: {OUTPUT_CSV}")
    log(f"{'='*60}\n")

    # Ellenőrzés: maradtak-e problémások?
    still_bad = [
        name for name in all_names
        if name in progress and is_problematic(progress[name])
    ]
    if still_bad:
        log(f"⚠️  Még mindig problémás ({len(still_bad)} db):")
        for name in still_bad[:20]:
            row = progress[name]
            log(f"  • {name} ({len(row.get('description',''))} kar.): {row.get('description','')[:80]}")
    else:
        log("✓ Nincs több problémás sor!")


if __name__ == "__main__":
    main()
