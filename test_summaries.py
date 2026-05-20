#!/usr/bin/env python3
"""
TESZT: 8 különböző jellegű településre futtatja az adatalapú elemzőt.
"""

import csv, json
from pathlib import Path

# generate_settlement_summaries.py-ból importáljuk a logikát
import sys
sys.path.insert(0, str(Path(__file__).parent))
from generate_settlement_summaries import (
    load_all_rows, compute_percentiles, build_summary, flt, rank
)

DATA_DIR = Path(__file__).parent / "data"
OUTPUT_CSV = DATA_DIR / "test_summaries.csv"

TEST_SETTLEMENTS = [
    "Budapest",
    "Debrecen",
    "Pécs",
    "Győr",
    "Eger",
    "Miskolc",
    "Siófok",
    "Szentendre",
]


def main():
    print("Adatok betöltése...")
    rows = load_all_rows()
    dist = compute_percentiles(rows)
    row_map = {r["settlement_name"]: r for r in rows}

    print("=" * 65)
    print("TESZT – adatalapú elemzés, max 1000 karakter")
    print("=" * 65)

    results = []
    for name in TEST_SETTLEMENTS:
        row = row_map.get(name)
        if row is None:
            print(f"\n[!] Nem található: {name}")
            continue

        summary = build_summary(row, dist)

        # Néhány kulcsindex kinyomtatása referenciaként
        def rv(col): return flt(row.get(col))
        def rr(col, dkey): return rank(rv(col), dist[dkey])

        print(f"\n{'─'*65}")
        print(f"  {name.upper()}  [{row.get('CITYDATA_SettlementType')} | {row.get('CITYDATA_County')}]")
        print(f"  jobs={rv('JOBS_INDEX_jobs_index'):.0f} ({rr('JOBS_INDEX_jobs_index','JOBS_INDEX_jobs_index')}) | "
              f"sleep={rv('SLEEPING_CITY_INDEX_sleeping_city_index'):.0f} ({rr('SLEEPING_CITY_INDEX_sleeping_city_index','SLEEPING_CITY_INDEX_sleeping_city_index')}) | "
              f"bp_auto={rv('BUDAPEST_ACCESS_INDEX_budapest_auto_index'):.0f} ({rr('BUDAPEST_ACCESS_INDEX_budapest_auto_index','BUDAPEST_ACCESS_INDEX_budapest_auto_index')}) | "
              f"house={rv('INGATLANPIAC_house_avg_index'):.0f} ({rr('INGATLANPIAC_house_avg_index','INGATLANPIAC_house_avg_index')}) | "
              f"forest={rv('FOREST_INDEX_forest_index'):.0f} ({rr('FOREST_INDEX_forest_index','FOREST_INDEX_forest_index')})")
        print(f"{'─'*65}")

        # Szöveg tördelve
        words, line, lines = summary.split(), [], []
        for w in words:
            if sum(len(x)+1 for x in line) + len(w) > 63:
                lines.append(' '.join(line)); line = [w]
            else:
                line.append(w)
        if line: lines.append(' '.join(line))
        for l in lines:
            print(f"  {l}")
        print(f"\n  [{len(summary)} karakter]")

        results.append({"settlement_name": name, "summary": summary, "char_count": len(summary)})

    with open(OUTPUT_CSV, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["settlement_name", "summary", "char_count"])
        writer.writeheader()
        writer.writerows(results)

    print(f"\n{'='*65}")
    print(f"Kimenet: {OUTPUT_CSV}")
    print("=" * 65)


if __name__ == "__main__":
    main()
