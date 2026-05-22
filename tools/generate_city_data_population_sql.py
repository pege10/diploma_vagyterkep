#!/usr/bin/env python3
"""Generate supabase/city_data_population_2024_import.sql from KSH + TEIR population sources."""

from __future__ import annotations

import re
import sys
from pathlib import Path

import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_XLSX = (
    REPO_ROOT.parent.parent
    / "02_Nyers_Adat"
    / "nepesseg_varosonkent.xlsx"
)
DEFAULT_TEIR_XLSX = REPO_ROOT / "data" / "budapest_kerulet_nepesseg_2024_teir.xlsx"
DEFAULT_CSV = REPO_ROOT / "data" / "ALL_PARAMETERS_v3_supabase.csv"
OUT_SQL = REPO_ROOT / "supabase" / "city_data_population_2024_import.sql"

BP_ROMAN = [
    "",
    "I",
    "II",
    "III",
    "IV",
    "V",
    "VI",
    "VII",
    "VIII",
    "IX",
    "X",
    "XI",
    "XII",
    "XIII",
    "XIV",
    "XV",
    "XVI",
    "XVII",
    "XVIII",
    "XIX",
    "XX",
    "XXI",
    "XXII",
    "XXIII",
]


def fmt_pop(n: int) -> str:
    return f"{n:,}".replace(",", " ")


def sql_str(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def panel_line(pop: int) -> str:
    return f"Lakosság (2024. dec. 31.): {fmt_pop(pop)} fő"


def clean_settlement_name(raw: str) -> str:
    return re.sub(r"\s*\*\s*$", "", str(raw).strip())


def load_db_names(csv_path: Path) -> set[str]:
    ap = pd.read_csv(csv_path, usecols=["settlement_name"], encoding="utf-8-sig")
    return set(ap["settlement_name"].astype(str))


def load_telepules_rows(xlsx_path: Path) -> list[tuple[str, int]]:
    df = pd.read_excel(xlsx_path)
    pop_col = "2024 Lakónépesség (dec. 31.) (fő)"
    valid = df[df["kod"].notna() & df[pop_col].notna()].copy()
    rows: list[tuple[str, int]] = []
    for _, r in valid.iterrows():
        name = clean_settlement_name(r["Unnamed: 0"])
        if name == "Budapest":
            continue
        rows.append((name, int(r[pop_col])))
    return rows


def find_population_column(df: pd.DataFrame) -> str:
    for col in df.columns:
        label = str(col).lower()
        if "népesség" in label or "nepesseg" in label:
            return str(col)
    raise ValueError("Nem található népesség oszlop: " + ", ".join(map(str, df.columns)))


def load_budapest_district_rows(teir_path: Path) -> list[tuple[str, int]]:
    df = pd.read_excel(teir_path)
    name_col = df.columns[0]
    pop_col = find_population_column(df)
    valid = df[df["kod"].notna() & df[pop_col].notna()].copy()
    rows: list[tuple[str, int]] = []
    for _, r in valid.iterrows():
        label = clean_settlement_name(r[name_col])
        m = re.match(r"Budapest\s+(\d+)\.\s*ker\.", label)
        if not m:
            continue
        num = int(m.group(1))
        if num < 1 or num > 23:
            continue
        db_name = f"{BP_ROMAN[num]}. kerület"
        rows.append((db_name, int(r[pop_col])))
    if len(rows) != 23:
        raise ValueError(f"TEIR fájlban {len(rows)} kerület sor van, 23 helyett.")
    rows.sort(key=lambda item: item[0])
    return rows


def build_sql(
    rows: list[tuple[str, int]],
    db_names: set[str],
    skipped_notes: list[str],
) -> str:
    matched: list[tuple[str, int]] = []
    skipped: list[tuple[str, int, str]] = []
    seen: set[str] = set()

    for name, pop in rows:
        if name in seen:
            continue
        seen.add(name)
        if name not in db_names:
            skipped.append((name, pop, "Nincs ilyen nevű sor a city_data táblában."))
            continue
        matched.append((name, pop))

    matched.sort(key=lambda item: item[0].lower())

    lines: list[str] = []
    lines.append("-- =============================================================================")
    lines.append("-- city_data: 2024. évi lakónépesség (KSH + TEIR)")
    lines.append("-- =============================================================================")
    lines.append("--")
    lines.append("-- Források:")
    lines.append("--   • nepesseg_varosonkent.xlsx — országos települések (kód + lakónépesség)")
    lines.append("--   • budapest_kerulet_nepesseg_2024_teir.xlsx — Budapest 01.–23. kerület")
    lines.append("--     (TEIR: 2024 BP állandó népesség, dec. 31.) → I. kerület … XXIII. kerület")
    lines.append("--")
    lines.append(f"-- Importált települések: {len(matched)}")
    lines.append(f"-- Kihagyva (nincs city_data.name): {len(skipped)}")
    for note in skipped_notes:
        lines.append(f"--   • {note}")
    for name, pop, reason in skipped:
        lines.append(f"--   • {name} ({fmt_pop(pop)} fő): {reason}")
    lines.append("--")
    lines.append("-- Generálva: tools/generate_city_data_population_sql.py")
    lines.append("-- =============================================================================")
    lines.append("")
    lines.append("ALTER TABLE public.city_data")
    lines.append("  ADD COLUMN IF NOT EXISTS population_2024 bigint,")
    lines.append("  ADD COLUMN IF NOT EXISTS panel_adatok TEXT,")
    lines.append("  ADD COLUMN IF NOT EXISTS panel_rovid_szoveg TEXT,")
    lines.append("  ADD COLUMN IF NOT EXISTS panel_leiras TEXT;")
    lines.append("")
    lines.append("COMMENT ON COLUMN public.city_data.population_2024 IS")
    lines.append("  'Lakónépesség 2024. dec. 31. (fő); BP kerületek: TEIR állandó népesség.';")
    lines.append("COMMENT ON COLUMN public.city_data.panel_adatok IS")
    lines.append("  'Találat panel: rövid adatsorok (soronként egy sor, pl. lakosság).';")
    lines.append("")
    lines.append("UPDATE public.city_data AS c")
    lines.append("SET")
    lines.append("  population_2024 = v.pop,")
    lines.append("  panel_adatok = CASE")
    lines.append("    WHEN NULLIF(btrim(c.panel_adatok), '') IS NULL THEN v.panel_line")
    lines.append("    WHEN c.panel_adatok ~ '^Lakosság \\(2024\\.' THEN")
    lines.append("      regexp_replace(c.panel_adatok, '^Lakosság \\(2024\\.[^\\n]*', v.panel_line)")
    lines.append("    ELSE v.panel_line || E'\\n' || c.panel_adatok")
    lines.append("  END")
    lines.append("FROM (VALUES")

    value_lines = [
        f"  ({sql_str(name)}, {pop}, {sql_str(panel_line(pop))})"
        for name, pop in matched
    ]
    for i, vl in enumerate(value_lines):
        lines.append(vl + ("," if i < len(value_lines) - 1 else ""))

    lines.append(") AS v(name, pop, panel_line)")
    lines.append("WHERE c.name = v.name;")
    lines.append("")
    lines.append("-- Ellenőrzés:")
    lines.append(
        "-- SELECT count(*) FILTER (WHERE population_2024 IS NOT NULL), count(*) FROM city_data;"
    )
    lines.append(
        "-- SELECT name, population_2024 FROM city_data WHERE name LIKE '%. kerület' ORDER BY name;"
    )
    return "\n".join(lines) + "\n"


def main() -> int:
    xlsx_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_XLSX
    teir_path = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_TEIR_XLSX
    csv_path = Path(sys.argv[3]) if len(sys.argv) > 3 else DEFAULT_CSV

    if not xlsx_path.is_file():
        print(f"XLSX not found: {xlsx_path}", file=sys.stderr)
        return 1
    if not teir_path.is_file():
        print(f"TEIR XLSX not found: {teir_path}", file=sys.stderr)
        return 1
    if not csv_path.is_file():
        print(f"CSV not found: {csv_path}", file=sys.stderr)
        return 1

    db_names = load_db_names(csv_path)
    telepules_rows = load_telepules_rows(xlsx_path)
    district_rows = load_budapest_district_rows(teir_path)

    skipped_notes = [
        "Budapest (összesen, KSH lakónépesség): nincs külön sor — helyette I.–XXIII. kerület (TEIR)",
    ]

    all_rows = telepules_rows + district_rows
    sql = build_sql(all_rows, db_names, skipped_notes)
    OUT_SQL.write_text(sql, encoding="utf-8")

    print(f"Wrote {OUT_SQL}")
    print(f"Települések (KSH xlsx, Budapest nélkül): {len(telepules_rows)}")
    print(f"Budapest kerületek (TEIR): {len(district_rows)}")
    print(f"Kerületi összesen: {sum(p for _, p in district_rows):,} fő")
    print(f"File size: {OUT_SQL.stat().st_size // 1024} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
