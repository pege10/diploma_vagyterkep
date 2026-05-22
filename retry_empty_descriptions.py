#!/usr/bin/env python3
"""
Üres leírások újragenerálása
-----------------------------
Végigolvassa a settlement_wikipedia_descriptions.csv-t,
megkeresi az üres vagy hiányzó leírásokat, és újra megpróbálja
generálni őket.

Budapesti kerületeknél ("VIII. kerület" stb.) automatikusan
a "Budapest VIII. kerülete" Wikipedia-cím formátumot használja.
"""

import csv
import json
import re
import ssl
import time
from pathlib import Path

ssl._create_default_https_context = ssl._create_unverified_context

# A fő script függvényeit importáljuk
import sys
sys.path.insert(0, str(Path(__file__).parent))
from generate_wikipedia_descriptions import (
    get_description, load_settlement_names,
    save_progress, save_output, log,
    DATA_DIR, OUTPUT_CSV, PROGRESS_JSON
)

# ── Budapest kerület névmapping ───────────────────────────────────────

ROMAN = r'(?:X{0,3})(?:IX|IV|V?I{0,3})'   # I–XXIII

DISTRICT_RE = re.compile(
    r'^(' + ROMAN + r')\.\s+kerület$',
    re.IGNORECASE
)


def budapest_wiki_titles(name: str) -> list[str]:
    """
    Ha a név "VIII. kerület" formátumú, visszaadja a lehetséges
    Wikipedia-cím variánsokat Budapest-kerületre.
    """
    m = DISTRICT_RE.match(name)
    if not m:
        return []
    roman = m.group(1)
    return [
        f"Budapest {roman}. kerülete",
        f"Budapest {roman}. kerület",
        f"{roman}. kerület (Budapest)",
    ]


# ── Fő logika ────────────────────────────────────────────────────────

def main():
    log(f"\n{'='*60}")
    log("Üres leírások újragenerálása")
    log(f"{'='*60}")

    # Betöltjük az összes nevet (a sorrend megmarad)
    all_names = load_settlement_names()

    # Betöltjük a progress JSON-t (ez tartalmazza az összes eddigi eredményt)
    progress = {}
    if PROGRESS_JSON.exists():
        with open(PROGRESS_JSON, encoding="utf-8") as f:
            progress = json.load(f)

    # Megkeressük az üres vagy hiányzó leírásokat
    empty = [
        name for name in all_names
        if name not in progress
        or not progress[name].get("description", "").strip()
    ]

    log(f"Összes settlement: {len(all_names)}")
    log(f"Progress-ben van: {len(progress)}")
    log(f"Üres / hiányzó:   {len(empty)}")

    if not empty:
        log("Nincs újragenerálandó leírás.")
        return

    for i, name in enumerate(empty, 1):
        log(f"\n[{i}/{len(empty)}] {name}")

        # Budapest kerületek speciális kezelése
        bp_titles = budapest_wiki_titles(name)
        if bp_titles:
            log(f"  → Budapest kerület, próbálandó Wikipedia-cím: {bp_titles[0]}")
            # get_description-nek adunk egy konkrét wiki_title-t (az első variánst),
            # a többi variánst hozzáadjuk a belső candidates listájához
            # Hack: ideiglenesen átírjuk a wiki_title-t az első BP variánsra
            result = get_description(name, bp_titles[0])
            # Ha az első nem jött be, próbáljuk a többit
            if result["fetch_status"] != "ok":
                for alt in bp_titles[1:]:
                    result = get_description(name, alt)
                    if result["fetch_status"] == "ok":
                        break
        else:
            # Normál eset: az eredeti névvel próbálkozunk
            wiki_title = progress.get(name, {}).get("wikipedia_title") or None
            result = get_description(name, wiki_title)

        progress[name] = result
        log(f"  → {result['fetch_status']} | {len(result['description'])} kar.")
        if result["description"]:
            log(f"  {result['description'][:120]}...")

        time.sleep(0.5)

    # Mentés
    save_progress(progress)
    save_output(progress, all_names)

    ok        = sum(1 for v in progress.values() if v["fetch_status"] == "ok")
    not_found = sum(1 for v in progress.values() if v["fetch_status"] == "not_found")

    log(f"\n{'='*60}")
    log(f"KÉSZ!")
    log(f"  OK összesen:      {ok}")
    log(f"  Nem találhatók:   {not_found}")
    log(f"  Kimenet: {OUTPUT_CSV}")
    log(f"{'='*60}\n")


if __name__ == "__main__":
    main()
