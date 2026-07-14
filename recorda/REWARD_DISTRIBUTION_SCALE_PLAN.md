# レコルダ 報酬配布の拡張設計

作成日: 2026-07-12

## 背景

2026年7月10日の謝礼付きテストでは、10名へ300ポイント相当のPayPay受け取りリンクを手動送付した。

結果として、少人数では対応できたが、今後30名、100名、継続調査へ増えると以下が負担になる。

- PayPayリンクを1人ずつ作成する
- LINE個別トークを探す
- 送付済み・受取済み・未受取を照合する
- Supabaseを手動更新する
- 期限切れや再送を個別判断する

今後は「毎回送る」から「ポイントを貯めて交換する」方式へ寄せる。

## 基本方針

レコルダは一般的なポイ活サイトではない。

報酬は「稼ぐ」ためではなく、回答協力への謝礼・感謝として扱う。

運用上は以下へ移行する。

1. 回答ごとにポイント付与
2. 500ポイント到達後に交換申請
3. 交換申請分だけgiftee Box等を発行
4. 送付状態を台帳で管理
5. 件数が増えたらAPI化

## Phase 0: 現在の手動運用

対象:

- 2026年7月の300ポイント謝礼テスト

方法:

- PayPay受け取りリンクを個別作成
- LINE個別トークで送付
- Supabase `recorda_reward_fulfillments` を手動更新

限界:

- 10名でも手間が大きい
- 表示名と登録名が違うと照合が難しい
- 送付ミスのリスクがある
- 再送・期限切れ対応が属人的

この方式は特別対応として残し、通常運用にはしない。

## Phase 1: ポイント残高方式

通常アンケートでは毎回PayPayを送らない。

ルール:

- 短い調査: 回答完了で50ポイント
- 500ポイントから交換申請可能
- 現金出金なし
- 交換先はデジタルギフト
- 交換時だけギフト発行・送付する

効果:

- 報酬送付回数が減る
- 手動送付の負担が減る
- 少額リンクを大量作成しなくてよい
- ポイント目的だけの参加を抑えやすい

例:

- 10回回答で500ポイント
- 交換申請1回
- 500円分ギフトを1回送付

## Phase 2: giftee Box中心の手動交換

PayPayではなく、giftee for Businessの `giftee Box` を標準にする。

想定条件:

- 500円分
- 発行手数料10%
- 1件あたり原価550円
- 最低発注数1件
- 審査目安1〜2営業日
- ギフト選択期限は発行月から3か月後の月末

運用:

1. モニターがLINEで「ポイント交換」と送る
2. 管理者がポイント残高を確認
3. 500ポイント以上なら交換受付
4. giftee for Businessで500円分を発行
5. 個別LINEでギフトURL送付
6. 台帳で500ポイントを減算
7. 送付状態を `sent` / `claimed` / `expired` で管理

注意:

- 同じギフトURLを複数人へ送らない
- ギフトURLは公開投稿や一斉配信に載せない
- URLやパスコードをDBに保存しない方針を継続する

## Phase 3: 交換申請テーブルを追加する

現在の `recorda_point_ledger` と `recorda_point_balances` に加え、交換申請管理を追加する。

必要な状態:

- requested: 交換申請受付
- approved: 残高確認済み
- gift_ordered: giftee発行手続き中
- sent: ギフトURL送付済み
- completed: 完了
- cancelled: 取消
- expired: 期限切れ

保存するもの:

- contact_id
- 交換ポイント数
- 交換金額
- 申請日時
- 承認日時
- 送付日時
- 完了日時
- 状態
- 管理メモ

保存しないもの:

- gifteeのギフトURL
- PayPayリンク
- パスコード

## SQLドラフト

本番適用前に見直すこと。

```sql
create table if not exists recorda_gift_redemptions (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references recorda_contacts(id),
  points integer not null check (points > 0),
  amount_yen integer not null check (amount_yen > 0),
  provider text not null default 'giftee'
    check (provider in ('giftee','paypay','other')),
  status text not null default 'requested'
    check (status in (
      'requested',
      'approved',
      'gift_ordered',
      'sent',
      'completed',
      'cancelled',
      'expired'
    )),
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  sent_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz,
  note text not null default ''
);

alter table recorda_gift_redemptions enable row level security;
```

ポイント減算は `recorda_point_ledger` に `redeemed` として追記する。

```sql
insert into recorda_point_ledger(
  contact_id,
  entry_type,
  points,
  note
)
values(
  :contact_id,
  'redeemed',
  -500,
  '500ポイントをデジタルギフトへ交換'
);
```

## LINEでの交換申請フロー案

ユーザー:

```text
ポイント交換
```

残高500ポイント未満:

```text
現在のポイントは〇〇ポイントです。
デジタルギフトへの交換は500ポイントから受け付けています。
```

残高500ポイント以上:

```text
500ポイントをデジタルギフトへ交換できます。
交換を希望する場合は「交換する」と送信してください。
```

確認後:

```text
交換申請を受け付けました。
確認後、デジタルギフトの受け取りリンクをこのトークでお送りします。
```

送付時:

```text
ポイント交換のデジタルギフトをお送りします。
受け取り期限がありますので、お早めにご確認ください。
```

## 管理画面に必要な一覧

最初はSupabase SQLでよい。

必要な一覧:

- 交換申請中
- 承認済み
- 送付済み
- 期限切れ
- モニター別ポイント残高
- 最近のポイント付与履歴

将来は管理画面化する。

## 運用ルール

- 交換は500ポイント単位
- 現金出金はしない
- 交換処理は週1〜2回にまとめる
- 交換申請後、原則7営業日以内に送付
- 不正・重複・本人確認不可の場合は保留または取消
- 取消時は理由をnoteに残す
- 個人情報画面は撮影・共有しない

## 実装優先度

### 今すぐ

- 通常調査は50ポイント付与へ寄せる
- 500ポイント交換ルールを内部で固定する
- PayPay手動送付は特別対応に限定する

### 次

- `recorda_gift_redemptions` の本番導入
- LINEで「ポイント交換」受付
- 残高不足時の自動返信
- 交換申請一覧SQL
- 管理者用の承認・送付済み・完了SQL

### その後

- giftee API連携可否を確認
- ギフト発行・送付の半自動化
- 管理画面化

## 結論

今後の報酬配布は、毎回PayPayリンクを送る方式ではなく、ポイント残高と500ポイント交換方式へ移行する。

これにより、30名〜100名規模でも運用しやすくなる。

レコルダはポイ活サービスではないため、ポイントを主役にせず、回答協力への感謝として控えめに設計する。

## 実装メモ

- DB移行案: `recorda/migrations/2026-07-12-point-redemptions.sql`
- 管理SQL: `recorda/GIFT_REDEMPTION_ADMIN_SQL.md`
- LINE webhook: `api/line-webhook.js` に「ポイント交換」受付を追加
