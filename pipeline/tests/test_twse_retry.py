"""證交所 client 的暫時性錯誤重試。

排程本身每 30 分鐘會再跑一次，但那要等半小時；一次 5xx / 逾時不該讓當天的抓取整個掛掉。
"""

from __future__ import annotations

import io
import json
import urllib.error

import pytest

from twse_pipeline.sources import twse


class _Resp(io.BytesIO):
    """夠像 urlopen 回傳值的最小替身（支援 with）。"""

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()
        return False


def _payload() -> _Resp:
    return _Resp(json.dumps([{"Code": "2330"}]).encode("utf-8"))


@pytest.fixture(autouse=True)
def _no_sleep(monkeypatch):
    monkeypatch.setattr(twse.time, "sleep", lambda _s: None)


def _fake_urlopen(outcomes: list):
    calls = {"n": 0}

    def open_(req, timeout=0):  # noqa: ARG001
        i = calls["n"]
        calls["n"] += 1
        out = outcomes[min(i, len(outcomes) - 1)]
        if isinstance(out, Exception):
            raise out
        return out()

    return open_, calls


def test_retries_transient_http_error(monkeypatch):
    err = urllib.error.HTTPError("u", 503, "busy", {}, None)  # type: ignore[arg-type]
    open_, calls = _fake_urlopen([err, _payload])
    monkeypatch.setattr(twse.urllib.request, "urlopen", open_)

    assert twse.fetch_day_all() == [{"Code": "2330"}]
    assert calls["n"] == 2  # 第一次 503、第二次成功


def test_retries_timeout(monkeypatch):
    open_, calls = _fake_urlopen([TimeoutError("timed out"), TimeoutError("timed out"), _payload])
    monkeypatch.setattr(twse.urllib.request, "urlopen", open_)

    assert twse.fetch_valuation_all() == [{"Code": "2330"}]
    assert calls["n"] == 3


def test_gives_up_after_max_attempts(monkeypatch):
    open_, calls = _fake_urlopen([urllib.error.URLError("boom")])
    monkeypatch.setattr(twse.urllib.request, "urlopen", open_)

    with pytest.raises(urllib.error.URLError):
        twse.fetch_day_all()
    assert calls["n"] == twse._RETRIES


def test_does_not_retry_client_error(monkeypatch):
    """404 之類不是暫時性問題，重試只是浪費時間。"""
    err = urllib.error.HTTPError("u", 404, "nope", {}, None)  # type: ignore[arg-type]
    open_, calls = _fake_urlopen([err])
    monkeypatch.setattr(twse.urllib.request, "urlopen", open_)

    with pytest.raises(urllib.error.HTTPError):
        twse.fetch_day_all()
    assert calls["n"] == 1
