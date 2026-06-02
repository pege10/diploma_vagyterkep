#!/usr/bin/env python3
"""Recalculate kisker_index from legkozelebbi_uzlet_km (0–100) and emit Supabase SQL."""

from __future__ import annotations

import csv
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CSV = (
    REPO_ROOT.parent.parent
    / "14_Parameter_Adatok"
    / "03_Helyi_Szolgaltatasok"
    / "02_Groceries_Index"
    / "final"
    / "groceries_index_FINAL.csv"
)
OUT_SQL = REPO_ROOT / "supabase" / "groceries_index_kisker_recalc.sql"

KM_NEAR = 2.0
KM_FAR = 20.0


def parse_num(raw: str) -> float | None:
    s = str(raw or "").strip().replace(",", ".")
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def kisker_index_from_km(km: float | None) -> int:
    """0–100: ≤2 km → 100, ≥20 km → 0, közte lineáris."""
    if km is None or km > KM_FAR:
        return 0
    if km <= KM_NEAR:
        return 100
    return round(100 * (KM_FAR - km) / (KM_FAR - KM_NEAR))


def main() -> int:
    csv_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_CSV
    if not csv_path.is_file():
        print(f"CSV nem található: {csv_path}", file=sys.stderr)
        return 1

    rows: list[dict[str, str]] = []
    with csv_path.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames or []
        for row in reader:
            km = parse_num(row.get("legkozelebbi_uzlet_km", ""))
            row["kisker_index"] = str(kisker_index_from_km(km))
            rows.append(row)

    with csv_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    lines = [
        "-- =============================================================================",
        "-- groceries_index: kisker_index újraszámolás (csak legkozelebbi_uzlet_km alapján)",
        "-- =============================================================================",
        "--",
        f"-- Forrás: {csv_path.name}",
        f"-- Skála: ≤ {KM_NEAR:g} km → 100, ≥ {KM_FAR:g} km → 0, közte lineáris.",
        f"-- Települések: {len(rows)}",
        "--",
        "-- Generálva: tools/generate_groceries_index_sql.py",
        "-- Futtasd a Supabase SQL Editorben. Újra futtatható.",
        "-- =============================================================================",
        "",
        "UPDATE public.groceries_index AS g",
        "SET kisker_index = v.kisker_index",
        "FROM (VALUES",
    ]

    value_lines: list[str] = []
    for row in rows:
        row_id = int(row["id"])
        idx = int(row["kisker_index"])
        value_lines.append(f"  ({row_id}, {idx})")

    lines.append(",\n".join(value_lines))
    lines.extend(
        [
            ") AS v(id, kisker_index)",
            "WHERE g.id = v.id;",
            "",
        ]
    )

    OUT_SQL.write_text("\n".join(lines), encoding="utf-8")
    print(f"Frissítve: {csv_path} ({len(rows)} sor)")
    print(f"SQL: {OUT_SQL}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
