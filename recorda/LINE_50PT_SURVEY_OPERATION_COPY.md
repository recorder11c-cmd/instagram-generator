# レコルダ 50ポイント通常アンケート 配信文・運用メモ

作成日: 2026-07-17

50ポイント通常アンケートは、回答9件・450ポイント付与まで確認済み。  
通常運用として成立する見込みがあるため、配信文を標準化する。

## 標準配信文

```text
【50ポイント対象・短いアンケート】

レコルダのモニター制度をより使いやすくするため、1〜3分のアンケートを実施します。

回答完了で50ポイントを付与します。
ポイントは500ポイントからデジタルギフトへ交換申請できます（現金出金はありません）。

回答は任意です。
参加する場合は、このトークで「50ポイントアンケート」と送信してください。
```

## さらに短い版

```text
【50ポイントアンケート】

1〜3分の短いアンケートです。
回答完了で50ポイントを付与します。

参加する場合は、このトークで「50ポイントアンケート」と送信してください。
回答は任意です。
```

## 追加説明が必要な人への返信

```text
ポイントは500ポイントからデジタルギフトへ交換申請できます。
現金出金はありません。

交換したい場合は、このトークで「ポイント交換」と送信してください。
500ポイント未満の場合は、現在のポイント数と残り必要ポイントをお知らせします。
```

## 送信後の確認SQL

回答数:

```sql
select
  count(*) as responses
from recorda_survey_responses
where survey_id = 'line-50pt-2026-07';
```

ポイント付与:

```sql
select
  entry_type,
  count(*) as rows,
  sum(points) as total_points
from recorda_point_ledger
where survey_id = 'line-50pt-2026-07'
group by entry_type
order by entry_type;
```

設問別集計:

```sql
select
  answers->>'explanation_clarity' as explanation_clarity,
  count(*) as rows
from recorda_survey_responses
where survey_id = 'line-50pt-2026-07'
group by explanation_clarity
order by rows desc;
```

```sql
select
  answers->>'answer_intent' as answer_intent,
  count(*) as rows
from recorda_survey_responses
where survey_id = 'line-50pt-2026-07'
group by answer_intent
order by rows desc;
```

```sql
select
  answers->>'redemption_feeling' as redemption_feeling,
  count(*) as rows
from recorda_survey_responses
where survey_id = 'line-50pt-2026-07'
group by redemption_feeling
order by rows desc;
```

```sql
select
  answers->>'preferred_length' as preferred_length,
  count(*) as rows
from recorda_survey_responses
where survey_id = 'line-50pt-2026-07'
group by preferred_length
order by rows desc;
```

## 運用判断

- 5件未満: 追加配信は焦らず、文面や対象を見直す
- 5〜10件: 初回検証として十分。傾向を見て改善へ進む
- 10〜15件: サンプルレポート化に十分
- 問い合わせが複数: FAQ・LP・配信文を先に修正してから広げる

## 注意

- 第三者へのLINE送信は管理者本人の最終確認・本人操作で行う
- 個人情報画面は撮影・共有しない
- 自由記述は個人を特定できないよう匿名要約して扱う
- 50ポイント調査は、謝礼付き300ポイント調査とは別管理にする

