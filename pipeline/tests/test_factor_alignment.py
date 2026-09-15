"""不變式：因子數學只有一份。

前端在兩個地方會重算動能（回測頁的自訂動能窗、盤中/盤後的暫定當日列），
公式與回看窗必須等於 pipeline `factors.py` 的註冊值。這裡直接讀 TypeScript 原始碼比對，
任何一邊改了窗格、少註冊一個因子，這個測試就會紅。
"""

from __future__ import annotations

import re
from pathlib import Path

from twse_pipeline.factors import FACTORS

ROOT = Path(__file__).resolve().parents[2]
MOMENTUM_TS = ROOT / "web" / "src" / "lib" / "momentum.ts"
FACTORS_PY = ROOT / "pipeline" / "src" / "twse_pipeline" / "factors.py"


def _ts_windows() -> dict[str, tuple[int, int]]:
    """解析 momentum.ts 的 MOM_WINDOWS。"""
    src = MOMENTUM_TS.read_text("utf-8")
    block = src.split("MOM_WINDOWS = {", 1)[1].split("} as const", 1)[0]
    return {
        m.group(1): (int(m.group(2)), int(m.group(3)))
        for m in re.finditer(r"(\w+):\s*\{\s*lookback:\s*(\d+),\s*skip:\s*(\d+)\s*\}", block)
    }


def _py_windows() -> dict[str, tuple[int, int]]:
    """解析 factors.py 的 FACTORS 註冊（lambda 的字面參數）。"""
    src = FACTORS_PY.read_text("utf-8")
    block = src.split("FACTORS: dict[str, Callable[[Series], float | None]] = {", 1)[1]
    block = block.split("}", 1)[0]
    return {
        m.group(1): (int(m.group(2)), int(m.group(3) or 0))
        for m in re.finditer(r'"(\w+)": lambda s: total_return\(s, (\d+)(?:, skip=(\d+))?\)', block)
    }


def test_registered_factor_keys_match() -> None:
    assert set(_py_windows()) == set(FACTORS)
    assert set(_ts_windows()) == set(FACTORS)


def test_lookback_and_skip_match() -> None:
    assert _ts_windows() == _py_windows()
