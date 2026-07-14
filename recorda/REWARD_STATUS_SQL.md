# 謝礼送付・受取状態確認SQL

作成日: 2026-07-12

## 300ポイント謝礼テストの現在地

2026年7月14日時点:

- 対象10名
- 9名受取済み
- 1名はPayPay受け取り期限切れ
- 未受取1名へリマインド済み
- 未受取1名の300ポイントは残す
- PayPay受取済み9名分はポイント消化済み
- PayPayリンクやパスコードはDBに保存しない

## 状態確認

```sql
select
  count(*) as reward_rows,
  count(*) filter (where status = 'claimed') as claimed_rewards,
  count(*) filter (where status = 'link_sent') as link_sent_rewards,
  count(*) filter (where status = 'expired') as expired_rewards
from recorda_reward_fulfillments
where survey_id = 'line-paid-pilot-2026-07';
```

期待値:

- `reward_rows`: 10
- `claimed_rewards`: 9
- `link_sent_rewards`: 0
- `expired_rewards`: 1

## ポイント台帳の最終確認

2026年7月14日に、PayPay受取済み9名分をポイント消化済みにした。
途中で10名分を追加消化したため、削除ではなく `adjustment` で戻した。

```sql
select
  entry_type,
  note,
  count(*) as rows,
  sum(points) as total_points
from recorda_point_ledger
where survey_id = 'line-paid-pilot-2026-07'
group by entry_type, note
order by entry_type, note;
```

期待値:

- `earned` / `アンケート回答完了`: 10件 / +3,000
- `redeemed` / `2026-07-14 PayPay受取済み確認のためポイント消化`: 9件 / -2,700
- `redeemed` / `2026-07-14 PayPay送付済みのためポイント消化`: 10件 / -3,000
- `adjustment` / `2026-07-14 二重消化の戻し`: 10件 / +3,000

合計残高は300ポイント。未受取1名分として残す。

## 未受取1名が受け取った場合

未受取だった1名のメールアドレスで更新する。

```sql
update recorda_reward_fulfillments f
set
  status = 'claimed',
  claimed_at = now(),
  note = note || ' / 2026-07-12 PayPay受取確認'
from recorda_contacts c
where f.contact_id = c.id
  and f.survey_id = 'line-paid-pilot-2026-07'
  and f.status = 'link_sent'
  and c.email = '対象者のメールアドレス';
```

最後の行だけ実際のメールアドレスに置き換える。

```sql
and c.email = 'xxxxx@xxxxx.xxx';
```

## 期限切れになった場合

期限切れを確認してから更新する。自動で期限切れにしない。

```sql
update recorda_reward_fulfillments f
set
  status = 'expired',
  note = note || ' / PayPay受け取り期限切れを確認'
from recorda_contacts c
where f.contact_id = c.id
  and f.survey_id = 'line-paid-pilot-2026-07'
  and f.status = 'link_sent'
  and c.email = '対象者のメールアドレス';
```

期限切れ後の再送・キャンセル・代替ギフトは、管理者本人の判断後に行う。
