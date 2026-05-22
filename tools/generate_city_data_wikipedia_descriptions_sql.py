#!/usr/bin/env python3
"""Generate Supabase SQL for Wikipedia panel texts (panel_leiras).

The monolithic import is too large for the Supabase SQL Editor; use the batch
files in supabase/city_data_wikipedia_descriptions_batches/ instead.
"""

from __future__ import annotations

import csv
import math
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CSV = REPO_ROOT / "data" / "settlement_wikipedia_descriptions.csv"
DEFAULT_DB_CSV = REPO_ROOT / "data" / "ALL_PARAMETERS_v3_supabase.csv"
OUT_SQL = REPO_ROOT / "supabase" / "city_data_wikipedia_descriptions_import.sql"
OUT_BATCH_DIR = REPO_ROOT / "supabase" / "city_data_wikipedia_descriptions_batches"
BATCH_COUNT = 4


def sql_str(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def load_db_names(csv_path: Path) -> set[str]:
    import pandas as pd

    ap = pd.read_csv(csv_path, usecols=["settlement_name"], encoding="utf-8-sig")
    return set(ap["settlement_name"].astype(str))


def load_descriptions(path: Path) -> list[tuple[str, str]]:
    rows: list[tuple[str, str]] = []
    with path.open(encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            name = (row.get("settlement_name") or "").strip()
            desc = (row.get("description") or "").strip()
            if not name or not desc:
                continue
            rows.append((name, desc))
    rows.sort(key=lambda item: item[0].lower())
    return rows


def build_update_block(rows: list[tuple[str, str]]) -> list[str]:
    lines: list[str] = [
        "UPDATE public.city_data AS c",
        "SET panel_leiras = v.panel_leiras",
        "FROM (",
        "  VALUES",
    ]
    value_lines = [f"    ({sql_str(name)}, {sql_str(desc)})" for name, desc in rows]
    lines.append(",\n".join(value_lines))
    lines.extend(
        [
            ") AS v(name, panel_leiras)",
            "WHERE c.name = v.name;",
            "",
        ]
    )
    return lines


def build_setup_sql_lines() -> list[str]:
    return [
        "ALTER TABLE public.city_data",
        "  ADD COLUMN IF NOT EXISTS panel_leiras TEXT;",
        "",
        "UPDATE public.city_data SET panel_leiras = NULL;",
        "",
    ]


def build_batch_sql(
    batch_no: int,
    batch_total: int,
    rows: list[tuple[str, str]],
    *,
    include_setup: bool = False,
) -> str:
    first = rows[0][0]
    last = rows[-1][0]
    lines = [
        "-- =============================================================================",
        f"-- city_data Wikipedia leírások – {batch_no}/{batch_total}. fájl",
        f"-- Települések: {len(rows)} ({first} … {last})",
    ]
    if batch_no == 1:
        lines.append("-- Futtasd sorban: 01 → 02 → 03 → 04 (az 1. fájl tartalmazza a setupot is).")
    else:
        lines.append("-- Futtasd az előző batch(ek) után.")
    lines.extend(
        [
            "-- =============================================================================",
            "",
        ]
    )
    if include_setup:
        lines.extend(build_setup_sql_lines())
    lines.extend(build_update_block(rows))
    lines.append(f"-- {batch_no}/{batch_total}. fájl kész.")
    lines.append("")
    return "\n".join(lines)


def build_monolithic_sql(matched: list[tuple[str, str]], skipped: list[str]) -> str:
    lines: list[str] = []
    lines.append("-- =============================================================================")
    lines.append("-- city_data: Wikipedia rövid leírások → panel_leiras (jobb oldali találat panel)")
    lines.append("-- =============================================================================")
    lines.append("--")
    lines.append("-- FIGYELEM: Ez a fájl túl nagy a Supabase SQL Editorhoz!")
    lines.append("-- Használd helyette:")
    lines.append("--   supabase/city_data_wikipedia_descriptions_batches/01_ … 04_ batch fájlok")
    lines.append("--")
    lines.append(f"-- Forrás: data/settlement_wikipedia_descriptions.csv")
    lines.append(f"-- Települések leírással: {len(matched)}")
    lines.append("-- Generálva: tools/generate_city_data_wikipedia_descriptions_sql.py")
    lines.append("-- =============================================================================")
    lines.append("")
    lines.append("ALTER TABLE public.city_data")
    lines.append("  ADD COLUMN IF NOT EXISTS panel_leiras TEXT;")
    lines.append("")
    lines.append("UPDATE public.city_data SET panel_leiras = NULL;")
    lines.append("")
    lines.extend(build_update_block(matched))

    if skipped:
        lines.append("-- Figyelmeztetés: CSV-ben van, de nincs city_data.name illesztés:")
        for name in skipped[:20]:
            lines.append(f"--   • {name}")
        if len(skipped) > 20:
            lines.append(f"--   … és még {len(skipped) - 20}")
        lines.append("")

    lines.append("-- Ellenőrzés:")
    lines.append(
        "-- SELECT count(*) FILTER (WHERE panel_leiras IS NOT NULL AND btrim(panel_leiras) <> ''), count(*) FROM city_data;"
    )
    lines.append(
        "-- SELECT name, left(panel_leiras, 80) FROM city_data WHERE panel_leiras IS NOT NULL ORDER BY name LIMIT 10;"
    )
    lines.append("")
    return "\n".join(lines)


def write_batches(matched: list[tuple[str, str]], batch_count: int) -> int:
    OUT_BATCH_DIR.mkdir(parents=True, exist_ok=True)

    for old in OUT_BATCH_DIR.glob("*.sql"):
        old.unlink()

    batch_count = max(1, batch_count)
    chunk_size = max(1, math.ceil(len(matched) / batch_count))
    batch_no = 0
    for i in range(0, len(matched), chunk_size):
        batch_no += 1
        chunk = matched[i : i + chunk_size]
        name = f"{batch_no:02d}_batch_{batch_no:03d}.sql"
        (OUT_BATCH_DIR / name).write_text(
            build_batch_sql(
                batch_no,
                batch_count,
                chunk,
                include_setup=(batch_no == 1),
            ),
            encoding="utf-8",
        )

    readme = OUT_BATCH_DIR / "README.txt"
    readme.write_text(
        "\n".join(
            [
                "Wikipedia leírások importálása Supabase-be (4 fájl)",
                "=================================================",
                "",
                "Futtasd sorban a Supabase SQL Editorban:",
                "  01_batch_001.sql  (setup + 1. negyed)",
                "  02_batch_002.sql",
                "  03_batch_003.sql",
                "  04_batch_004.sql",
                "",
                "Ellenőrzés:",
                "  SELECT count(*) FILTER (WHERE panel_leiras IS NOT NULL), count(*) FROM city_data;",
                "",
                f"Összes település leírással: {len(matched)}",
                "",
            ]
        ),
        encoding="utf-8",
    )
    return batch_no


def main() -> int:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_CSV
    db_csv = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_DB_CSV
    batch_count = BATCH_COUNT
    if len(sys.argv) > 3:
        batch_count = max(1, int(sys.argv[3]))

    if not src.is_file():
        print(f"Hiányzó CSV: {src}", file=sys.stderr)
        return 1
    if not db_csv.is_file():
        print(f"Hiányzó településlista: {db_csv}", file=sys.stderr)
        return 1

    db_names = load_db_names(db_csv)
    rows = load_descriptions(src)
    skipped = [name for name, _ in rows if name not in db_names]
    matched = [(name, desc) for name, desc in rows if name in db_names]

    OUT_SQL.write_text(build_monolithic_sql(matched, skipped), encoding="utf-8")
    batch_count = write_batches(matched, batch_count)

    print(f"Wrote {OUT_SQL} ({len(matched)} leírás, túl nagy az Editorhoz)")
    print(f"Wrote {batch_count} batch file(s) in {OUT_BATCH_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
