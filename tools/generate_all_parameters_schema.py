#!/usr/bin/env python3
"""
Reads ALL_PARAMETERS_v3.csv (EU decimal comma, optional Ft in averages).
Writes:
  - supabase/all_parameters_schema.sql  (CREATE TABLE public.all_parameters)
  - data/ALL_PARAMETERS_v3_supabase.csv (normalized for Postgres COPY / Supabase import)

Usage:
  python3 tools/generate_all_parameters_schema.py [path/to/ALL_PARAMETERS_v3.csv]
"""

from __future__ import annotations

import csv
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CSV = (
    Path.home()
    / "Desktop/FUTO PROJEKTEK/MA2_2/Diploma munka/14_Parameter_Adatok/ALL_PARAMETERS_v3.csv"
)


def try_int(s: str) -> bool:
    s = (s or "").strip()
    if not s:
        return False
    return bool(re.fullmatch(r"-?\d+", s))


def try_float(s: str) -> bool:
    s = (s or "").strip()
    if not s:
        return False
    t = s.replace(",", ".").replace("\u00a0", "").replace(" ", "")
    t = re.sub(r"ft$", "", t, flags=re.I).strip()
    try:
        float(t)
        return True
    except ValueError:
        return False


def is_forced_text(col: str) -> bool:
    cl = col.lower()
    if cl == "name":
        return True
    if col in ("CITYDATA_County", "CITYDATA_SettlementType"):
        return True
    if "_nevek" in cl:
        return True
    if "_note" in cl:
        return True
    if "_lista" in cl:
        return True
    if "_modszer" in cl:
        return True
    if "forrás" in col:
        return True
    if "nearest_station" in cl:
        return True
    if "jaras_szekhelye" in cl:
        return True
    if "transport_frequency_index_megye" in cl:
        return True
    if "legkozelebbi_brand" in cl:
        return True
    if "brandek_5km_lista" in cl:
        return True
    if "legkozelebbi_nev" in cl:
        return True
    if col == "CULTURAL_INDEX_kod":
        return True
    if "ingatlan" in cl and "atlag" in cl:
        return True
    return False


def infer_type(col: str, rows: list[dict[str, str]]) -> str:
    if is_forced_text(col):
        return "text"
    non_empty = [(r.get(col) or "").strip() for r in rows]
    non_empty = [v for v in non_empty if v]
    if not non_empty:
        return "text"
    sample = non_empty[:2500]
    if all(try_int(s) for s in sample):
        return "bigint"
    if all(try_float(s) for s in sample):
        return "double precision"
    return "text"


def pg_quote_ident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def db_column_name(source_col: str) -> str:
    """Postgres: avoid column name `name` (catalog type / tooling quirks)."""
    if source_col == "name":
        return "settlement_name"
    return source_col


def ascii_pg_identifier(source_col: str) -> str:
    """
    Supabase CSV import: headers should be ASCII (no accents). Also keeps
    Postgres / Table Editor from mis-aligning columns.
    """
    base = db_column_name(source_col)
    stripped = "".join(
        c for c in unicodedata.normalize("NFKD", base) if not unicodedata.combining(c)
    )
    out: list[str] = []
    for ch in stripped:
        if ch.isascii() and (ch.isalnum() or ch in "_-"):
            out.append(ch)
        elif ch.isspace():
            out.append("_")
    s = "".join(out)
    if not s:
        raise ValueError(f"Cannot derive ASCII column name from {source_col!r}")
    if s[0].isdigit():
        return "_" + s
    return s


def fill_missing_ids(rows: list[dict[str, str]], id_col: str = "ID") -> None:
    """Source has 23 Budapest kerület rows with empty ID; PK requires a value."""
    seen: list[int] = []
    for r in rows:
        v = (r.get(id_col) or "").strip()
        if v:
            seen.append(int(v))
    nxt = max(seen) + 1 if seen else 1
    for r in rows:
        if not (r.get(id_col) or "").strip():
            r[id_col] = str(nxt)
            nxt += 1


def normalize_cell(pg_type: str, raw: str) -> str:
    s = raw if raw is not None else ""
    if pg_type == "bigint":
        t = s.strip()
        return "" if t == "" else str(int(t))
    if pg_type == "double precision":
        t = s.strip()
        if t == "":
            return ""
        t = t.replace("\u00a0", "").replace(" ", "")
        t = t.replace(",", ".")
        t = re.sub(r"ft$", "", t, flags=re.I).strip()
        return t
    return s


def main() -> int:
    csv_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_CSV
    if not csv_path.is_file():
        print(f"CSV not found: {csv_path}", file=sys.stderr)
        return 1

    with csv_path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        cols = list(reader.fieldnames or [])
        data_rows = list(reader)

    fill_missing_ids(data_rows)

    inference_rows = data_rows[: min(3000, len(data_rows))]
    types = {c: infer_type(c, inference_rows) for c in cols}
    print("Column type distribution:", Counter(types.values()), file=sys.stderr)

    schema_path = REPO_ROOT / "supabase" / "all_parameters_schema.sql"
    schema_path.parent.mkdir(parents=True, exist_ok=True)

    lines: list[str] = []
    lines.append("-- Generated by tools/generate_all_parameters_schema.py")
    lines.append("-- Import: data/ALL_PARAMETERS_v3_supabase.csv (Studio: empty cells -> NULL).")
    lines.append("-- URBAN_MOBILITY_INDEX_tkv_forrás -> ..._tkv_forras (ASCII header for Supabase).")
    lines.append("")
    lines.append("create table if not exists public.all_parameters (")
    col_defs = []
    for c in cols:
        t = types[c]
        db = ascii_pg_identifier(c)
        if db == "settlement_name":
            ident = "settlement_name"
        else:
            ident = pg_quote_ident(db)
        if c == cols[0] and c.upper() == "ID":
            col_defs.append(f"  {ident} {t} primary key")
        else:
            col_defs.append(f"  {ident} {t}")
    col_defs.append("  created_at timestamptz not null default now()")
    lines.append(",\n".join(col_defs))
    lines.append(");")
    lines.append("")
    lines.append(
        "create index if not exists all_parameters_settlement_name_idx "
        "on public.all_parameters (settlement_name);"
    )
    lines.append("")
    lines.append("-- After import: enable RLS and add policies for your app (anon key safety).")
    lines.append("-- alter table public.all_parameters enable row level security;")
    lines.append("")
    lines.append("-- If you already have column \"name\" from an older schema:")
    lines.append("-- alter table public.all_parameters rename column \"name\" to settlement_name;")
    schema_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {schema_path}", file=sys.stderr)

    out_dir = REPO_ROOT / "data"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_csv = out_dir / "ALL_PARAMETERS_v3_supabase.csv"

    out_fields = [ascii_pg_identifier(c) for c in cols]
    with out_csv.open("w", encoding="utf-8", newline="") as out:
        writer = csv.DictWriter(
            out,
            fieldnames=out_fields,
            lineterminator="\n",
            quoting=csv.QUOTE_MINIMAL,
        )
        writer.writeheader()
        for r in data_rows:
            out_row = {
                ascii_pg_identifier(c): normalize_cell(types[c], r.get(c, ""))
                for c in cols
            }
            writer.writerow(out_row)

    print(f"Wrote {out_csv} ({len(data_rows)} rows)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
