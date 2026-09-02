#!/usr/bin/env python3
"""驗證 repo 內已 commit 的 data/ 檔案符合 schema/。CI 用來擋壞資料進 main。

用法：python schema/validate.py
"""

from __future__ import annotations

import json
import pathlib
import sys

import jsonschema

ROOT = pathlib.Path(__file__).resolve().parent.parent
SCHEMA = ROOT / "schema"
DATA = ROOT / "data"


def _load(p: pathlib.Path) -> dict:
    return json.loads(p.read_text("utf-8"))


def main() -> int:
    errors: list[str] = []

    universe = SCHEMA / "universe.json"
    try:
        jsonschema.validate(_load(universe), _load(SCHEMA / "universe.schema.json"))
        print(f"ok  {universe.relative_to(ROOT)}")
    except jsonschema.ValidationError as e:
        errors.append(f"{universe.relative_to(ROOT)}: {e.message} (at {list(e.absolute_path)})")

    latest = DATA / "latest.json"
    if latest.exists():
        try:
            jsonschema.validate(_load(latest), _load(SCHEMA / "snapshot.schema.json"))
            print(f"ok  {latest.relative_to(ROOT)}")
        except jsonschema.ValidationError as e:
            errors.append(
                f"{latest.relative_to(ROOT)}: {e.message} (at {list(e.absolute_path)})"
            )

    hist_schema = _load(SCHEMA / "history.schema.json")
    for jsonl in sorted((DATA / "history").glob("factors-*.jsonl")):
        for i, line in enumerate(jsonl.read_text("utf-8").splitlines(), 1):
            if not line.strip():
                continue
            try:
                jsonschema.validate(json.loads(line), hist_schema)
            except jsonschema.ValidationError as e:
                errors.append(f"{jsonl.relative_to(ROOT)}:{i}: {e.message}")
        print(f"ok  {jsonl.relative_to(ROOT)}")

    if errors:
        print("\nSCHEMA VALIDATION FAILED:", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
