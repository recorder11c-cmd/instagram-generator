# ポイント交換申請 管理SQL

作成日: 2026-07-12

## 前提

`recorda/migrations/2026-07-12-point-redemptions.sql` を本番Supabaseへ適用した後に使う。

LINEでモニターが「ポイント交換」と送ると、500ポイント以上の場合は `recorda_gift_redemptions` に `requested` として登録される。

ギフトURLやPayPayリンクはDBへ保存しない。

## 交換申請一覧

個人情報を含むため、撮影・共有しない。

```sql
select *
from recorda_gift_redemption_management
order by 申請日時 desc;
```

## 交換申請中の件数だけ確認

個人情報なし。

```sql
select
  count(*) filter (where status='requested') as requested,
  count(*) filter (where status='approved') as approved,
  count(*) filter (where status='gift_ordered') as gift_ordered,
  count(*) filter (where status='sent') as sent,
  count(*) filter (where status='completed') as completed,
  count(*) filter (where status='cancelled') as cancelled,
  count(*) filter (where status='expired') as expired
from recorda_gift_redemptions;
```

## 承認する

残高と本人確認ができたら、対象の `redemption_id` を使って承認する。

```sql
update recorda_gift_redemptions
set
  status='approved',
  approved_at=now(),
  note=note || ' / 交換申請を承認'
where id='対象のredemption_id'
  and status='requested';
```

## giftee発行中にする

giftee for Businessで発行作業へ進めたら更新する。

```sql
update recorda_gift_redemptions
set
  status='gift_ordered',
  note=note || ' / giftee発行手続き中'
where id='対象のredemption_id'
  and status='approved';
```

## ギフトURLを送付済みにする

LINE個別トークへギフトURLを送った後に更新する。

```sql
update recorda_gift_redemptions
set
  status='sent',
  sent_at=now(),
  expires_at=now() + interval '3 months',
  note=note || ' / デジタルギフトURLをLINEで手動送付'
where id='対象のredemption_id'
  and status in ('approved','gift_ordered');
```

## 完了にする

受取完了が確認できたら、ポイントを減算し、交換申請を完了にする。

同じ `redemption_id` を2か所に入れる。

```sql
begin;

insert into recorda_point_ledger(
  contact_id,
  entry_type,
  points,
  note
)
select
  contact_id,
  'redeemed',
  -points,
  'デジタルギフト交換完了'
from recorda_gift_redemptions
where id='対象のredemption_id'
  and status='sent';

update recorda_gift_redemptions
set
  status='completed',
  completed_at=now(),
  note=note || ' / デジタルギフト受取完了'
where id='対象のredemption_id'
  and status='sent';

commit;
```

## 取消にする

本人確認不可、不正、重複などで交換しない場合。

```sql
update recorda_gift_redemptions
set
  status='cancelled',
  note=note || ' / 交換申請を取消'
where id='対象のredemption_id'
  and status in ('requested','approved','gift_ordered');
```

## 期限切れにする

ギフトの期限切れを確認してから更新する。

```sql
update recorda_gift_redemptions
set
  status='expired',
  note=note || ' / ギフト受取期限切れを確認'
where id='対象のredemption_id'
  and status='sent';
```

期限切れ後の再発行は、管理者本人が判断する。
