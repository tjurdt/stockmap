"""純資料轉換小工具。無 I/O、無副作用，方便單元測試。"""

from __future__ import annotations

from collections.abc import Mapping


def num(v: object) -> float | None:
    """把 TWSE 回傳的字串（可能含逗號、空白、'--'）轉成 float，失敗回 None。"""
    try:
        return float(str(v).replace(",", "").strip())
    except (ValueError, AttributeError):
        return None


def roc_to_iso(roc: object) -> str | None:
    """民國日期字串 1150902 -> '2026-09-02'。格式不符回 None。"""
    s = str(roc).strip()
    if len(s) < 7 or not s.isdigit():
        return None
    return f"{int(s[:-4]) + 1911:04d}-{s[-4:-2]}-{s[-2:]}"


def pick(row: Mapping[str, object], *needles: str) -> float | None:
    """TWT49U 的欄位名在中英文之間變動過，用關鍵字模糊比對取第一個命中的數值。"""
    for k, v in row.items():
        if all(n in k for n in needles):
            return num(v)
    return None
