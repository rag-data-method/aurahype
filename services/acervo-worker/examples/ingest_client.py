"""
Exemplo de cliente pra ingerir o output do scraper Lovable no acervo-worker.

Uso:
    export ACERVO_URL="https://triade-acervo.<sub>.workers.dev"
    export ACERVO_TOKEN="<mesmo token que voce setou com wrangler secret put INGEST_TOKEN>"
    python ingest_client.py caminho/do/scraper_output.json

Formato esperado do arquivo scraper_output.json (uma dessas duas formas):

    # forma 1 — lista de sites diretamente
    [ { "source_url": "...", ... }, ... ]

    # forma 2 — dict com chave "sites"
    { "sites": [ { "source_url": "...", ... }, ... ] }

Campos por site (soh source_url eh obrigatorio):
    source_url      (str)   URL original — obrigatoria
    title           (str)
    description     (str)
    html_snippet    (str)   HTML do body ou trecho representativo
    screenshot_url  (str)
    palette_hex     (list[str])   ex: ["#a78bfa","#34d399"]
    hero_kind       (str)   "image"|"video"|"gradient"|"text"
    language        (str)   "pt"|"en"|...
    raw             (any)   payload cru do seu scraper (guardado no D1)
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any
from urllib import request as urlreq
from urllib.error import HTTPError


BATCH_SIZE = 50  # <=100. Mantendo 50 pra caber no timeout do Worker.


def load_sites(path: Path) -> list[dict[str, Any]]:
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    if isinstance(data, list):
        return data
    if isinstance(data, dict) and "sites" in data:
        return data["sites"]  # type: ignore[return-value]
    raise SystemExit("scraper_output.json precisa ser lista ou {sites: [...]}")


def post_batch(url: str, token: str | None, sites: list[dict[str, Any]], classify: bool) -> dict[str, Any]:
    payload = json.dumps({"sites": sites, "classify": classify}).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urlreq.Request(url.rstrip("/") + "/ingest", data=payload, headers=headers, method="POST")
    try:
        with urlreq.urlopen(req, timeout=120) as resp:
            body = resp.read().decode("utf-8")
    except HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        raise SystemExit(f"HTTP {e.code}: {body}") from None
    return json.loads(body)


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2

    url = os.environ.get("ACERVO_URL")
    if not url:
        raise SystemExit("ACERVO_URL nao definida (ex: https://triade-acervo.xxx.workers.dev)")
    token = os.environ.get("ACERVO_TOKEN")
    classify = os.environ.get("ACERVO_CLASSIFY", "0") == "1"

    path = Path(sys.argv[1])
    sites = load_sites(path)
    print(f"Lendo {len(sites)} sites de {path}")

    total_received = 0
    total_embedded = 0
    total_classified = 0
    total_errors = 0

    for i in range(0, len(sites), BATCH_SIZE):
        batch = sites[i : i + BATCH_SIZE]
        print(f"  batch {i // BATCH_SIZE + 1} — {len(batch)} sites...", end=" ", flush=True)
        result = post_batch(url, token, batch, classify)
        total_received += int(result.get("received", 0))
        total_embedded += int(result.get("embedded", 0))
        total_classified += int(result.get("classified", 0))
        errs = result.get("errors") or []
        total_errors += len(errs)
        print(f"embedded={result.get('embedded')} classified={result.get('classified')} errors={len(errs)}")
        for e in errs[:5]:
            print(f"    ! {e.get('source_url')}: {e.get('error')}")

    print()
    print(f"Total: received={total_received} embedded={total_embedded} classified={total_classified} errors={total_errors}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
