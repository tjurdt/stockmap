# 加一個因子 / 指標

以「加入 60 日波動率 `vol60`」為例。因子 key 在 4 個地方對齊，照順序改：

## 1. 管線：純函式 + 註冊 + 測試

`pipeline/src/twse_pipeline/factors.py`

```python
def volatility(series: Series, lookback: int) -> float | None:
    if len(series) < lookback + 1:
        return None
    rets = [series[i] / series[i - 1] - 1 for i in range(-lookback, 0)]
    mean = sum(rets) / len(rets)
    var = sum((r - mean) ** 2 for r in rets) / len(rets)
    return var**0.5 * 100

FACTORS = {
    ...
    "vol60": lambda s: volatility(s, 60),
}
```

`pipeline/tests/test_factors.py` —對已知序列加一個斷言（固定序列 → 固定值）。

## 2. 管線：把它寫進輸出

`snapshot.py` 的 `build_stock_row` 和 `history.py` 的 `build_history_row`：加一行
`"vol60": _r(factors["vol60"], 3)`。

## 3. Schema

`schema/snapshot.schema.json` 和 `schema/history.schema.json`：在 `stock` 的 `properties` 與
`required` 加 `"vol60": { "$ref": "#/definitions/nullableNumber" }`。

## 4. 前端

`web/src/lib/data.ts`：`stockSchema` 加 `vol60: nullableNumber`。

`web/src/lib/metrics.ts`：`MetricKey` 加 `'vol60'`，`METRICS` 加一筆
`vol60: { label: '60 日波動率 (%)', field: 'vol60', fmt: fixed(2), kind: 'ratio' }`。

## 5. 驗證

```
pytest pipeline                     # 因子數學
cd web && npm run check             # data.contract.test.ts 會確認 zod ↔ schema 對齊
python -m twse_pipeline.daily       # 實跑一次，確認 latest.json 通過 schema
```

新因子在散佈圖的座標軸下拉、排行榜、個股頁、表格會自動出現（都是從 `METRICS` 迭代）。
歷史值要從 `mom121` 補完整（250 日）之後才會滿。
