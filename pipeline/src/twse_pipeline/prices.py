"""還原權值價格序列 store。

prices.json 結構：
  {"2330": {"dates": [...], "adj": [...], "raw": [...]}, ...}
  dates 由舊到新；raw = 原始收盤；adj = 除權息還原後收盤。
除權息當日：把該股過去所有 adj 乘上還原因子 (= 參考價 / 除權息前收盤價)，讓序列連續。
"""

from __future__ import annotations

import json
from pathlib import Path

CAP = 400  # 只保留最近 N 個交易日


class PriceHistory:
    def __init__(self, data: dict[str, dict[str, list]] | None = None) -> None:
        self._d: dict[str, dict[str, list]] = data or {}

    # ── 載入 / 儲存 ────────────────────────────────────────────
    @classmethod
    def load(cls, path: Path) -> PriceHistory:
        if path.exists():
            return cls(json.loads(path.read_text("utf-8")))
        return cls({})

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(self._d, ensure_ascii=False, separators=(",", ":")), "utf-8")

    # ── 查詢 ──────────────────────────────────────────────────
    def adj_series(self, code: str) -> list[float]:
        return list(self._d.get(code, {}).get("adj", []))

    def series(self, code: str) -> tuple[list[str], list[float], list[float]]:
        """回傳 (dates, adj, raw)，三者等長、由舊到新。"""
        h = self._d.get(code, {})
        return list(h.get("dates", [])), list(h.get("adj", [])), list(h.get("raw", []))

    def codes(self) -> list[str]:
        return list(self._d)

    def last_date(self, code: str) -> str | None:
        dates = self._d.get(code, {}).get("dates", [])
        return dates[-1] if dates else None

    def max_len(self) -> int:
        return max((len(v["adj"]) for v in self._d.values()), default=0)

    def to_dict(self) -> dict[str, dict[str, list]]:
        return self._d

    def capped(self, n: int) -> PriceHistory:
        """回傳每檔只留最近 n 個交易日的新 PriceHistory（不改動自己）。"""
        return PriceHistory(
            {code: {k: v[k][-n:] for k in ("dates", "adj", "raw")} for code, v in self._d.items()}
        )

    # ── 更新 ──────────────────────────────────────────────────
    def set_series(self, code: str, dates: list[str], adj: list[float], raw: list[float]) -> None:
        """整段覆寫某股的序列（歷史回填用）。"""
        self._d[code] = {"dates": list(dates), "adj": list(adj), "raw": list(raw)}

    def prune(self, keep: set[str]) -> None:
        """移除不在 keep 內的代號（被踢出名單的股票），控制檔案大小。"""
        for code in [c for c in self._d if c not in keep]:
            del self._d[code]

    def record(
        self,
        code: str,
        date: str,
        close: float,
        *,
        adj_factor: float | None = None,
        cap: int = CAP,
    ) -> bool:
        """記錄某股某交易日的收盤。回傳 True 表示有寫入，False 表示略過。

        略過條件：date 不晚於序列現有的最後一天（同日重跑，或回填資料比 TWSE 端點更新）。
        """
        h = self._d.setdefault(code, {"dates": [], "adj": [], "raw": []})
        if h["dates"] and date <= h["dates"][-1]:
            return False

        if adj_factor and h["adj"]:  # 除權息當日：回補歷史還原價
            h["adj"] = [round(p * adj_factor, 6) for p in h["adj"]]

        h["dates"].append(date)
        h["raw"].append(close)
        h["adj"].append(close)

        for k in ("dates", "adj", "raw"):
            h[k] = h[k][-cap:]
        return True
