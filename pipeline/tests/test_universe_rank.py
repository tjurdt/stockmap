from twse_pipeline.universe_rank import names_by_code, rank, shares_by_code

# 30 檔假資料：代號 S00..S29，市值 = 3000 - 100*i（S00 最大）
CODES = [f"{1000 + i}" for i in range(30)]


def _day(prices: dict[str, float]) -> dict[str, dict]:
    return {c: {"ClosingPrice": str(p)} for c, p in prices.items()}


def _shares() -> dict[str, float]:
    return {c: 100.0 for c in CODES}  # 每檔 100 百萬股


def _prices(order: list[str]) -> dict[str, float]:
    # order[0] 市值最大。close = (30-rank)*10，shares 固定 → mcap 隨 rank 遞減
    return {c: (30 - i) * 10 for i, c in enumerate(order)}


NATURAL = CODES[:]  # S00 > S01 > ... > S29
CURRENT = CODES[:20]  # 現任 = 前 20


SHARES_KEY = "已發行普通股數或TDR原股發行股數"


def test_shares_and_names_parsing():
    rows = [
        {"公司代號": "2330", "公司簡稱": "台積電", SHARES_KEY: "25932370067"},
        {"公司代號": "AB12", "公司簡稱": "壞資料", SHARES_KEY: "x"},
        {"公司代號": "2327", "公司簡稱": "國巨*", SHARES_KEY: "500000000"},
    ]
    assert shares_by_code(rows)["2330"] == 25932.370067
    assert "AB12" not in shares_by_code(rows)
    assert names_by_code(rows)["2330"] == "台積電"
    assert names_by_code(rows)["2327"] == "國巨"  # 去掉尾端 *


def test_steady_state_no_churn():
    r = rank(_day(_prices(NATURAL)), _shares(), {}, current=CURRENT)
    assert [c.code for c in r.constituents] == CURRENT
    assert r.added == [] and r.removed == []


def test_rank21_incumbent_stays_rank20_challenger_waits():
    # 交換 S19 與 S20：S20（現任）掉到 rank 21，S20+? 不對——讓 S20 現任落到第 21
    order = NATURAL[:19] + [CODES[20], CODES[19]] + NATURAL[21:]
    # 現在排名：... S18(19), S20(20), S19(21) —— S19 是現任、落到 21
    r = rank(_day(_prices(order)), _shares(), {}, current=CURRENT)
    assert CODES[19] in {c.code for c in r.constituents}  # rank-21 現任留下
    assert CODES[20] not in {c.code for c in r.constituents}  # 非現任沒擠進來
    assert r.added == [] and r.removed == []


def test_incumbent_below_keep_rank_is_dropped():
    # S05（現任）暴跌到 rank 27，S20（非現任）升到 rank 5
    order = [c for c in NATURAL if c != CODES[5]]
    order.insert(26, CODES[5])  # S05 -> rank 27
    r = rank(_day(_prices(order)), _shares(), {}, current=CURRENT)
    got = {c.code for c in r.constituents}
    assert CODES[5] not in got  # 跌破門檻 → 踢出
    assert len(r.constituents) == 20
    assert r.removed == [CODES[5]]
    assert len(r.added) == 1  # 有一檔遞補
