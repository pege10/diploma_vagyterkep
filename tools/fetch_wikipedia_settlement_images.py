#!/usr/bin/env python3
"""
Lekéri az összes település Wikipédia-képét (hu.wikipedia.org) az ALL_PARAMETERS CSV-ből.

Kimenet:
  - data/settlement_wikipedia_images.csv  → Supabase import (settlement_enrichment)
  - data/settlement_wikipedia_images.json  (opcionális, teljes napló)

Használat:
  python3 tools/fetch_wikipedia_settlement_images.py
  python3 tools/fetch_wikipedia_settlement_images.py --limit 50
  python3 tools/fetch_wikipedia_settlement_images.py --resume
  python3 tools/fetch_wikipedia_settlement_images.py --retry-failed

Wikipedia API: batch (50 cím/kérés), User-Agent kötelező.
"""

from __future__ import annotations

import argparse
import csv
import json
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_INPUT = REPO_ROOT / "data" / "ALL_PARAMETERS_v3_supabase.csv"
OUT_CSV = REPO_ROOT / "data" / "settlement_wikipedia_images.csv"
OUT_JSON = REPO_ROOT / "data" / "settlement_wikipedia_images.json"

API = "https://hu.wikipedia.org/w/api.php"
USER_AGENT = "HolisticSearchEngine/1.0 (diploma thesis; settlement photos batch)"
BATCH_SIZE = 20
THUMB_SIZE = 800
SLEEP_SEC = 1.0
BATCH_RETRY_WAIT_SEC = 30
RATE_LIMIT_COOLDOWN_SEC = 120

CSV_FIELDS = [
    "settlement_name",
    "wikipedia_title",
    "wikipedia_page_id",
    "photo_url",
    "photo_thumb_url",
    "photo_width",
    "photo_height",
    "photo_source",
    "photo_attribution",
    "wikipedia_article_url",
    "fetch_status",
    "fetch_note",
]


def load_settlement_names(path: Path) -> list[str]:
    names: list[str] = []
    with path.open(encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        if "settlement_name" not in (reader.fieldnames or []):
            raise SystemExit("CSV-ben nincs settlement_name oszlop: " + str(path))
        for row in reader:
            name = (row.get("settlement_name") or "").strip()
            if name:
                names.append(name)
    return names


def _parse_api_response(raw: str) -> dict:
    text = (raw or "").strip()
    if not text:
        raise json.JSONDecodeError("empty body", text, 0)
    low = text.lower()
    if "too many requests" in low or text.startswith("You are making too many"):
        raise RuntimeError("rate_limit_429")
    return json.loads(text)


def api_get(params: dict, retries: int = 6) -> dict:
    """MediaWiki API – POST (hosszú titles lista nem fér GET URL-be)."""
    body = urllib.parse.urlencode(params).encode("utf-8")
    headers = {
        "User-Agent": USER_AGENT,
        "Content-Type": "application/x-www-form-urlencoded",
    }
    last_err: Exception | None = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(API, data=body, method="POST", headers=headers)
            with urllib.request.urlopen(req, timeout=90) as resp:
                if getattr(resp, "status", 200) == 429:
                    raise RuntimeError("rate_limit_429")
                return _parse_api_response(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 429:
                last_err = RuntimeError("rate_limit_429")
            else:
                last_err = e
        except (urllib.error.URLError, json.JSONDecodeError, OSError, RuntimeError) as e:
            last_err = e
        if last_err is not None and "rate_limit_429" not in str(last_err):
            try:
                proc = subprocess.run(
                    [
                        "curl",
                        "-sS",
                        "-w",
                        "\n__HTTP__%{http_code}",
                        "-A",
                        USER_AGENT,
                        "-X",
                        "POST",
                        "-d",
                        body.decode("utf-8"),
                        API,
                    ],
                    capture_output=True,
                    text=True,
                    timeout=120,
                    check=False,
                )
                out = proc.stdout or ""
                if "__HTTP__429" in out or "too many requests" in out.lower():
                    last_err = RuntimeError("rate_limit_429")
                else:
                    body_text = out.split("\n__HTTP__")[0]
                    if body_text.strip():
                        return _parse_api_response(body_text)
                    last_err = RuntimeError(proc.stderr.strip() or "curl empty/failed")
            except (json.JSONDecodeError, RuntimeError) as e2:
                last_err = e2

        if last_err is not None and "rate_limit_429" in str(last_err):
            print(
                f"  Wikipedia rate limit – várakozás {RATE_LIMIT_COOLDOWN_SEC}s…",
                file=sys.stderr,
            )
            time.sleep(RATE_LIMIT_COOLDOWN_SEC)
            continue
        wait = 2.0 * (attempt + 1)
        print(f"  API újrapróbálkozás {attempt + 1}/{retries} ({wait:.0f}s)…", file=sys.stderr)
        time.sleep(wait)
    raise RuntimeError(str(last_err) or "api_get failed")


def empty_row(name: str, status: str, note: str = "") -> dict:
    return {
        "settlement_name": name,
        "wikipedia_title": "",
        "wikipedia_page_id": "",
        "photo_url": "",
        "photo_thumb_url": "",
        "photo_width": "",
        "photo_height": "",
        "photo_source": "wikipedia",
        "photo_attribution": "",
        "wikipedia_article_url": "",
        "fetch_status": status,
        "fetch_note": note,
    }


def row_from_page(name: str, page: dict) -> dict:
    title = page.get("title") or name
    pageid = page.get("pageid", "")
    article_url = "https://hu.wikipedia.org/wiki/" + urllib.parse.quote(
        title.replace(" ", "_"), safe="/:"
    )
    if "missing" in page:
        return empty_row(name, "no_page", "nincs huwiki cikk")

    if page.get("pageprops", {}).get("disambiguation") is not None:
        return empty_row(name, "disambiguation", title)

    thumb = page.get("thumbnail") or {}
    original = page.get("original") or {}
    thumb_url = thumb.get("source") or ""
    photo_url = original.get("source") or thumb_url

    if not photo_url:
        return {
            **empty_row(name, "no_image", title),
            "wikipedia_title": title,
            "wikipedia_page_id": str(pageid),
            "wikipedia_article_url": article_url,
        }

    attribution = f"Wikipédia – {title}"
    return {
        "settlement_name": name,
        "wikipedia_title": title,
        "wikipedia_page_id": str(pageid),
        "photo_url": photo_url,
        "photo_thumb_url": thumb_url,
        "photo_width": str(thumb.get("width") or original.get("width") or ""),
        "photo_height": str(thumb.get("height") or original.get("height") or ""),
        "photo_source": "wikipedia",
        "photo_attribution": attribution,
        "wikipedia_article_url": article_url,
        "fetch_status": "ok",
        "fetch_note": "",
    }


def fetch_batch(titles: list[str]) -> dict[str, dict]:
    """titles[i] = settlement_name, batch query uses same strings as wiki titles first."""
    joined = "|".join(titles)
    data = api_get(
        {
            "action": "query",
            "format": "json",
            "redirects": "1",
            "prop": "pageimages|pageprops",
            "piprop": "thumbnail|original",
            "pithumbsize": str(THUMB_SIZE),
            "titles": joined,
        }
    )
    pages = data.get("query", {}).get("pages", {})
    redirects = data.get("query", {}).get("redirects") or []
    from_map = {r["from"]: r["to"] for r in redirects}

    by_title: dict[str, dict] = {}
    by_title_lower: dict[str, dict] = {}
    for page in pages.values():
        t = page.get("title", "")
        by_title[t] = page
        by_title_lower[t.lower()] = page

    out: dict[str, dict] = {}
    for name in titles:
        resolved = from_map.get(name, name)
        page = by_title.get(resolved) or by_title_lower.get(resolved.lower())
        if page is None:
            out[name] = empty_row(name, "no_page", "batch: nincs találat")
        else:
            out[name] = row_from_page(name, page)
    return out


def opensearch_title(query: str) -> str | None:
    data = api_get(
        {
            "action": "opensearch",
            "format": "json",
            "search": query,
            "limit": 5,
            "namespace": 0,
        }
    )
    if not data or len(data) < 2:
        return None
    titles = data[1]
    if not titles:
        return None
    q = query.lower()
    for t in titles:
        if t.lower() == q:
            return t
    # prefer exact settlement name match or title starting with query
    for t in titles:
        if t.lower().startswith(q):
            return t
    return titles[0]


def resolve_one(name: str) -> dict:
    try:
        batch = fetch_batch([name])
        row = batch[name]
        if row["fetch_status"] == "ok":
            return row
        wiki_title = opensearch_title(name)
        if not wiki_title:
            return row
        time.sleep(SLEEP_SEC)
        batch2 = fetch_batch([wiki_title])
        row2 = batch2.get(wiki_title) or row
        if row2["fetch_status"] == "ok":
            row2["fetch_note"] = (row2.get("fetch_note") or "") + f"; opensearch→{wiki_title}"
            row2["settlement_name"] = name
            return row2
        row2["settlement_name"] = name
        row2["fetch_note"] = f"opensearch→{wiki_title}; " + (row2.get("fetch_note") or "")
        return row2
    except Exception as e:
        return empty_row(name, "error", str(e)[:200])


def load_existing_csv(path: Path) -> dict[str, dict]:
    if not path.is_file():
        return {}
    out: dict[str, dict] = {}
    with path.open(encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            name = (row.get("settlement_name") or "").strip()
            if name:
                out[name] = row
    return out


def write_csv(path: Path, rows: dict[str, dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    ordered = [rows[k] for k in sorted(rows.keys())]
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=CSV_FIELDS, extrasaction="ignore")
        w.writeheader()
        w.writerows(ordered)


def main() -> int:
    parser = argparse.ArgumentParser(description="Wikipedia település-képek batch lekérése")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--out-csv", type=Path, default=OUT_CSV)
    parser.add_argument("--out-json", type=Path, default=OUT_JSON)
    parser.add_argument("--limit", type=int, default=0, help="max település (teszt)")
    parser.add_argument("--resume", action="store_true", help="kihagyja az ok státuszúakat")
    parser.add_argument("--retry-failed", action="store_true", help="újrapróbálja a nem ok sorokat")
    parser.add_argument("--sleep", type=float, default=SLEEP_SEC)
    parser.add_argument(
        "--no-opensearch",
        action="store_true",
        help="nem fut opensearch fallback (gyorsabb első kör)",
    )
    args = parser.parse_args()

    if not args.input.is_file():
        print("Nincs input CSV:", args.input, file=sys.stderr)
        return 1

    names = load_settlement_names(args.input)
    if args.limit > 0:
        names = names[: args.limit]

    existing = load_existing_csv(args.out_csv) if (args.resume or args.retry_failed) else {}
    results: dict[str, dict] = dict(existing)

    if not args.resume and not args.retry_failed:
        results = {}
        todo = list(names)
    else:
        todo = []
        for name in names:
            prev = results.get(name)
            if prev is None:
                todo.append(name)
            elif prev.get("fetch_status") == "ok":
                continue
            elif args.retry_failed or args.resume:
                todo.append(name)

    print(f"Települések összesen: {len(names)}, lekérdezendő: {len(todo)}")
    ok = sum(1 for r in results.values() if r.get("fetch_status") == "ok")

    # --- batch pass ---
    i = 0
    while i < len(todo):
        chunk = todo[i : i + BATCH_SIZE]
        i += BATCH_SIZE
        batch_rows: dict[str, dict] = {}
        for attempt in range(3):
            try:
                batch_rows = fetch_batch(chunk)
                break
            except Exception as e:
                if attempt < 2:
                    print(
                        f"  Batch hiba ({e!s}), várakozás {BATCH_RETRY_WAIT_SEC}s…",
                        file=sys.stderr,
                    )
                    time.sleep(BATCH_RETRY_WAIT_SEC)
                else:
                    print("  Batch végleges hiba, sorok error státusz.", file=sys.stderr)
                    batch_rows = {
                        name: empty_row(name, "error", str(e)[:120]) for name in chunk
                    }
        time.sleep(args.sleep)

        retry_names: list[str] = []
        for name in chunk:
            row = batch_rows.get(name) or empty_row(name, "error", "batch missing")
            results[name] = row
            if not args.no_opensearch and row["fetch_status"] in ("no_page", "no_image"):
                retry_names.append(name)

        for name in retry_names:
            row = resolve_one(name)
            results[name] = row
            time.sleep(max(args.sleep, 0.75))

        ok = sum(1 for r in results.values() if r.get("fetch_status") == "ok")
        print(f"  … {min(i, len(todo))}/{len(todo)} kész, eddig ok: {ok}")
        write_csv(args.out_csv, {n: results[n] for n in names if n in results})

    write_csv(args.out_csv, {n: results[n] for n in names if n in results})
    args.out_json.write_text(
        json.dumps([results[n] for n in names if n in results], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    stats: dict[str, int] = {}
    for n in names:
        st = (results.get(n) or {}).get("fetch_status", "?")
        stats[st] = stats.get(st, 0) + 1

    print("\nKész:", args.out_csv)
    print("Státuszok:", stats)
    print("Import: Supabase → settlement_enrichment → Import CSV")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
