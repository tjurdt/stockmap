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

    for name in ("universe", "backtest_universe"):
        f = SCHEMA / f"{name}.json"
        if not f.exists():
            continue
        try:
            jsonschema.validate(_load(f), _load(SCHEMA / f"{name}.schema.json"))
            print(f"ok  {f.relative_to(ROOT)}")
        except jsonschema.ValidationError as e:
            errors.append(f"{f.relative_to(ROOT)}: {e.message} (at {list(e.absolute_path)})")

    plan_example = SCHEMA / "operator_plan.example.json"
    if plan_example.exists():
        try:
            jsonschema.validate(_load(plan_example), _load(SCHEMA / "operator_plan.schema.json"))
            print(f"ok  {plan_example.relative_to(ROOT)}")
        except jsonschema.ValidationError as e:
            errors.append(
                f"{plan_example.relative_to(ROOT)}: {e.message} (at {list(e.absolute_path)})"
            )

    for data_name, schema_name in (("latest", "snapshot"), ("calendar", "calendar")):
        f = DATA / f"{data_name}.json"
        if not f.exists():
            continue
        try:
            jsonschema.validate(_load(f), _load(SCHEMA / f"{schema_name}.schema.json"))
            print(f"ok  {f.relative_to(ROOT)}")
        except jsonschema.ValidationError as e:
            errors.append(f"{f.relative_to(ROOT)}: {e.message} (at {list(e.absolute_path)})")

    jsonl_specs = [
        (_load(SCHEMA / "history.schema.json"), sorted((DATA / "history").glob("factors-*.jsonl"))),
        (_load(SCHEMA / "baselines.schema.json"), [DATA / "baselines.jsonl"]),
    ]
    for schema, files in jsonl_specs:
        for jsonl in files:
            if not jsonl.exists():
                continue
            for i, line in enumerate(jsonl.read_text("utf-8").splitlines(), 1):
                if not line.strip():
                    continue
                try:
                    jsonschema.validate(json.loads(line), schema)
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
