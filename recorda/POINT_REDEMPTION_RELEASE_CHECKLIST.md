# ポイント交換機能 リリースチェックリスト

作成日: 2026-07-14

## 目的

LINEで「ポイント交換」と送られたときに、500ポイント以上なら交換申請を受け付け、500ポイント未満なら残高不足を返信する。

## 重要な順番

本番では必ず以下の順に進める。

1. SupabaseへDB移行SQLを適用
2. SQL EditorでRPC動作確認
3. Vercelへ `api/line-webhook.js` を反映
4. LINEでテスト

Vercel反映を先に行うと、LINEで「ポイント交換」と送られた時に、未作成RPCを呼んでエラーになる可能性がある。

## 1. Supabaseへ適用するSQL

適用対象:

```text
recorda/migrations/2026-07-12-point-redemptions.sql
```

作成されるもの:

- `recorda_gift_redemptions`
- `request_recorda_point_redemption(text)`
- `recorda_gift_redemption_management`
- 未完了交換申請の二重作成防止インデックス

## 2. Supabaseで確認するSQL

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

初期値はすべて0。

## 3. LINE返信テスト

テスト語句:

```text
ポイント交換
```

期待される返信:

- 未登録: 登録フォーム案内
- 500ポイント未満: 現在ポイントと不足ポイントを返信
- 500ポイント以上: 交換申請受付
- 申請済み: すでに受付済みと返信

## 4. 誤反応防止

以下は反応する。

- ポイント交換
- ポイントを交換
- ポイント交換申請
- ギフト交換
- デジタルギフト交換

以下は反応しない。

- 交換
- ポイント確認

単独の「交換」は文脈違いで反応する可能性があるため除外した。

## 5. 管理者の交換処理

交換申請後の管理は以下を使う。

```text
recorda/GIFT_REDEMPTION_ADMIN_SQL.md
```

管理手順:

1. 交換申請一覧を確認
2. 残高と本人確認
3. `approved`
4. giftee発行作業
5. `gift_ordered`
6. LINE個別トークへギフトURL送付
7. `sent`
8. 受取完了確認後、ポイント減算して `completed`

ギフトURL・PayPayリンク・パスコードはDBに保存しない。

## 6. リリース前に未完了の謝礼テストを確認

2026年7月の300ポイント謝礼テストは、未受取1名が残っている可能性がある。

本機能のリリース前に確認する。

- 10名すべて `claimed` か
- 1名がまだ `link_sent` か
- 期限切れなら `expired` 対応済みか

## 7. リリース判断

以下を満たしたら本番化してよい。

- DB移行SQLの適用が完了
- `request_recorda_point_redemption` が存在する
- `api/line-webhook.js` の構文チェックが通る
- LINEで残高不足返信が確認できる
- 誤反応しない語句を確認できる
