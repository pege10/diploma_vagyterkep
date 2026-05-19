"""
Újragenerálja a `data/magyarorszag_telepulesek_kozigazgatasi_hatarai_egyszerusitett.geojson`
fájlt a forrás GeoPackage-ből, amely a budapesti kerületeket is külön
poligonként tartalmazza.

Lépések:
 1. Beolvassa a GeoPackage `margitszigetkulon` layert.
 2. A `telepules_unifikalt` mező alapján dissolve-olja a feature-eket — minden
    egyedi településnévhez egyetlen (multi)polygon kerül.
 3. Eldobja a "Budapest" egészének poligonját, mert a 23 kerület már lefedi,
    és a kettő átfedése a choropleth-en duplikációt okozna.
 4. WGS84-re (EPSG:4326) reprojektálja és Douglas-Peucker-rel egyszerűsíti.
 5. Kiírja kompakt GeoJSON-ba.

Utána futtatandó: `node scripts/build-geo-bundle.cjs`
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import geopandas as gpd
from shapely.geometry import mapping

SRC_GPKG = Path(
    "/Users/perigergogabor/Desktop/FUTO PROJEKTEK/MA2_2/Diploma munka/"
    "03_Feldolgozott_Adat/FONTOS_RETEGEK/"
    "magyarorszag_telepules_hatarai_budapest_kerulet_hatarai.gpkg"
)
LAYER = "margitszigetkulon"
NAME_COL = "telepules_unifikalt"

REPO_ROOT = Path(__file__).resolve().parents[1]
DST_GEOJSON = (
    REPO_ROOT
    / "data"
    / "magyarorszag_telepulesek_kozigazgatasi_hatarai_egyszerusitett.geojson"
)

# Geometriai egyszerűsítés WGS84-ben (~50 m), megőrzi a topológiát.
SIMPLIFY_TOLERANCE_DEG = 0.0005


def main() -> int:
    if not SRC_GPKG.exists():
        print(f"Hiányzó forrás: {SRC_GPKG}", file=sys.stderr)
        return 1

    print(f"Layer betöltése: {SRC_GPKG} :: {LAYER}")
    gdf = gpd.read_file(SRC_GPKG, layer=LAYER)
    print(f"  feature-ek: {len(gdf)}")

    if NAME_COL not in gdf.columns:
        print(f"Hiányzik a {NAME_COL} mező", file=sys.stderr)
        return 1

    # Csak az érvényes telepules_unifikalt értékek
    gdf = gdf[gdf[NAME_COL].notna() & (gdf[NAME_COL].astype(str).str.len() > 0)]
    gdf = gdf.to_crs(4326)

    print("Dissolve…")
    diss = gdf.dissolve(by=NAME_COL, as_index=False)
    print(f"  dissolved: {len(diss)} egyedi név")

    # A 'Budapest' aggregált poligon eldobása — a 23 kerület lefedi.
    before = len(diss)
    diss = diss[diss[NAME_COL] != "Budapest"].reset_index(drop=True)
    print(f"  Budapest aggregált poligon eldobva: {before} → {len(diss)}")

    print(f"Simplify (tolerance={SIMPLIFY_TOLERANCE_DEG}°)…")
    diss["geometry"] = diss["geometry"].simplify(
        tolerance=SIMPLIFY_TOLERANCE_DEG, preserve_topology=True
    )

    features = []
    skipped = 0
    for _, row in diss.iterrows():
        name = str(row[NAME_COL]).strip()
        geom = row.geometry
        if geom is None or geom.is_empty:
            skipped += 1
            continue
        features.append(
            {
                "type": "Feature",
                "properties": {"name": name, "name:hu": name},
                "geometry": mapping(geom),
            }
        )

    print(f"GeoJSON feature-ek: {len(features)} (skipped: {skipped})")
    DST_GEOJSON.parent.mkdir(parents=True, exist_ok=True)
    with DST_GEOJSON.open("w", encoding="utf-8") as f:
        json.dump(
            {"type": "FeatureCollection", "features": features},
            f,
            ensure_ascii=False,
            separators=(",", ":"),
        )
    size_mb = DST_GEOJSON.stat().st_size / (1024 * 1024)
    print(f"OK -> {DST_GEOJSON} ({size_mb:.2f} MB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
