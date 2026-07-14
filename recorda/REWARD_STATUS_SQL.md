# 謝礼送付・受取状態確認SQL

作成日: 2026-07-12

## 300ポイント謝礼テストの現在地

2026年7月11日時点:

- 対象10名
- 9名受取済み
- 1名未受取
- 未受取1名へリマインド済み
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
- `claimed_rewards`: 9 または 10
- `link_sent_rewards`: 1 または 0
- `expired_rewards`: 0

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
