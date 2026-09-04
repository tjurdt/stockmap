"""Repo 內路徑定位。安裝為 editable (`pip install -e pipeline`) 時，
本檔位於 <repo>/pipeline/src/twse_pipeline/paths.py。"""

from __future__ import annotations

import pathlib
from datetime import timedelta, timezone

TPE = timezone(timedelta(hours=8))  # Asia/Taipei

REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
DATA_DIR = REPO_ROOT / "data"
SCHEMA_DIR = REPO_ROOT / "schema"

LATEST_JSON = DATA_DIR / "latest.json"
PRICES_JSON = DATA_DIR / "prices.json"
HISTORY_DIR = DATA_DIR / "history"

UNIVERSE_SCHEMA = SCHEMA_DIR / "universe.json"
BACKTEST_UNIVERSE = SCHEMA_DIR / "backtest_universe.json"
SNAPSHOT_SCHEMA = SCHEMA_DIR / "snapshot.schema.json"
HISTORY_SCHEMA = SCHEMA_DIR / "history.schema.json"
