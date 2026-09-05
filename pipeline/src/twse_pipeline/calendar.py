"""台股休市日曆 → data/calendar.json。

TWSE holidaySchedule 只給當年度。解析出「平日但市場休市」的日期（週末本就非交易日，
不列入），併入 config.KNOWN_HOLIDAYS（手動補的隔年緩衝），供前端算「下一個台股交易日」
與「每月第 N 個交易日」。

  python -m twse_pipeline.calendar
"""

from __future__ import annotations

import json
from datetime import date, datetime

from .config import KNOWN_HOLIDAYS
from .paths import DATA_DIR, TPE
from .sources.twse import Row, fetch_holiday_schedule

CALENDAR_JSON = DATA_DIR / "calendar.json"


def _roc_to_iso(roc: str) -> str | None:
    """民國 YYYMMDD（如 1150101）→ 2026-01-01。"""
    s = roc.strip()
    if not s.isdigit() or len(s) < 7:
        return None
    year = int(s[:-4]) + 1911
    month, day = int(s[-4:-2]), int(s[-2:])
    try:
        return date(year, month, day).isoformat()
    except ValueError:
        return None


def _is_market_closed(row: Row) -> bool:
    """holidaySchedule 的一列是否代表「當天不交易」。

    非休市的只有「XX開始交易日」「XX最後交易日」這種公告；其餘（含「市場無交易，僅辦理
    結算交割作業」與各國定假日）都是休市。
    """
    name = row.get("Name", "")
    return "開始交易" not in name and "最後交易" not in name


def parse_holidays(rows: list[Row]) -> list[str]:
    """回傳排序後、落在平日（週一～五）的休市日 ISO 字串。"""
    out: set[str] = set()
    for r in rows:
        if not _is_market_closed(r):
            continue
        iso = _roc_to_iso(r.get("Date", ""))
        if iso and date.fromisoformat(iso).weekday() < 5:
            out.add(iso)
    return sorted(out)


def build_calendar() -> dict:
    holidays = set(parse_holidays(fetch_holiday_schedule()))
    holidays.update(h for h in KNOWN_HOLIDAYS if date.fromisoformat(h).weekday() < 5)
    years = sorted({int(h[:4]) for h in holidays})
    return {
        "generatedAt": datetime.now(TPE).isoformat(timespec="seconds"),
        "years": years,
        "holidays": sorted(holidays),
    }


def rebuild_calendar() -> int:
    cal = build_calendar()
    CALENDAR_JSON.parent.mkdir(parents=True, exist_ok=True)
    CALENDAR_JSON.write_text(json.dumps(cal, ensure_ascii=False, indent=1) + "\n", "utf-8")
    return len(cal["holidays"])


if __name__ == "__main__":
    print(f"calendar: {rebuild_calendar()} 個休市日 → {CALENDAR_JSON}")
