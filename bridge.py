"""
Real-time bridge: Supabase talalatok INSERT events -> physical plotter G-code.
Uses official supabase Python package. Run with: python bridge.py
"""

import asyncio
import os

# -----------------------------------------------------------------------------
# Supabase connection (replace with your project URL and anon key)
# -----------------------------------------------------------------------------
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://dubcsyrgrtlzvefxuhni.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_ANON_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR1YmNzeXJncnRsenZlZnh1aG5pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNjQ3MTYsImV4cCI6MjA4ODY0MDcxNn0.rldtsMn7LCqtLtfDFPWTM96Ly0EQEm50LhkbTFey0R4")

# -----------------------------------------------------------------------------
# Plotter canvas (physical size in millimeters)
# -----------------------------------------------------------------------------
PLOTTER_WIDTH_MM = 1000
PLOTTER_HEIGHT_MM = 700

# -----------------------------------------------------------------------------
# Bounding box of Hungary (WGS84)
# -----------------------------------------------------------------------------
MIN_LON = 16.11
MAX_LON = 22.90
MIN_LAT = 45.75
MAX_LAT = 48.58

# Size of the drawn 'X' mark (half-length of each leg in mm)
X_MARK_SIZE_MM = 5


def lat_lng_to_mm(lat: float, lng: float) -> tuple[float, float]:
    """
    Convert WGS84 (lat, lng) to physical plotter coordinates (X, Y) in millimeters.
    Uses percentage within the Hungary bounding box.
    X = 0 at MIN_LON, PLOTTER_WIDTH_MM at MAX_LON.
    Y = 0 at MIN_LAT, PLOTTER_HEIGHT_MM at MAX_LAT.
    """
    if MAX_LON == MIN_LON or MAX_LAT == MIN_LAT:
        return (0.0, 0.0)
    x_pct = (float(lng) - MIN_LON) / (MAX_LON - MIN_LON)
    y_pct = (float(lat) - MIN_LAT) / (MAX_LAT - MIN_LAT)
    x_mm = x_pct * PLOTTER_WIDTH_MM
    y_mm = y_pct * PLOTTER_HEIGHT_MM
    return (x_mm, y_mm)


def gcode_x_mark(x_mm: float, y_mm: float) -> str:
    """
    Generate G-code to draw a small 'X' (two diagonal lines) at (x_mm, y_mm).
    Uses G0 for rapid move, G1 for linear draw, M3 S1000 for pen down, M5 S0 for pen up.
    """
    half = X_MARK_SIZE_MM
    # First diagonal: (x - half, y - half) -> (x + half, y + half)
    # Second diagonal: (x - half, y + half) -> (x + half, y - half)
    lines = [
        f"G0 X{x_mm - half:.3f} Y{y_mm - half:.3f}",
        "M3 S1000",
        f"G1 X{x_mm + half:.3f} Y{y_mm + half:.3f}",
        "M5 S0",
        f"G0 X{x_mm - half:.3f} Y{y_mm + half:.3f}",
        "M3 S1000",
        f"G1 X{x_mm + half:.3f} Y{y_mm - half:.3f}",
        "M5 S0",
    ]
    return "\n".join(lines)


def extract_record(payload: dict) -> dict | None:
    """Extract the inserted row from a postgres_changes INSERT payload."""
    # Realtime can send record at top level or under 'record' / 'new' / data.record
    record = payload.get("record")
    if record is not None:
        return record
    record = payload.get("new")
    if record is not None:
        return record
    data = payload.get("data") or {}
    return data.get("record") or data.get("new")


async def main():
    from supabase import acreate_client

    print("Connecting to Supabase...")
    client = await acreate_client(SUPABASE_URL, SUPABASE_KEY)

    def on_insert(payload: dict):
        record = extract_record(payload)
        if not record:
            print("[WARN] INSERT event with no record:", payload)
            return
        telepules_nev = record.get("telepules_nev") or ""
        try:
            lat = float(record.get("lat"))
        except (TypeError, ValueError):
            lat = 0.0
        try:
            lng = float(record.get("lng"))
        except (TypeError, ValueError):
            lng = 0.0

        x_mm, y_mm = lat_lng_to_mm(lat, lng)
        gcode = gcode_x_mark(x_mm, y_mm)

        print()
        print("=" * 60)
        print("NEW INSERT EVENT (talalatok)")
        print("=" * 60)
        print("  Település (settlement):", telepules_nev)
        print("  GPS (lat, lng):         ({}, {})".format(lat, lng))
        print("  Physical (X, Y) mm:     ({:.3f}, {:.3f})".format(x_mm, y_mm))
        print("  Generated G-code:")
        print("-" * 60)
        for line in gcode.split("\n"):
            print("  ", line)
        print("-" * 60)
        print()

    channel = client.channel("talalatok-plotter")
    channel.on_postgres_changes(
        event="INSERT",
        schema="public",
        table="talalatok",
        callback=on_insert,
    )
    await channel.subscribe()

    print("Listening for INSERT events on table 'talalatok'...")
    print("(Press Ctrl+C to stop)")
    print()

    # Keep the script running
    await asyncio.Event().wait()


if __name__ == "__main__":
    asyncio.run(main())
