# レコルダ LINE自動化基盤 — 引き継ぎ

最終更新: 2026-07-17

## 再開方法

新しいPCで以下を実行する。

```bash
git clone https://github.com/recorder11c-cmd/instagram-generator.git
cd instagram-generator
git checkout main
git pull
```

最初にこのファイルと `recorda/README.md` を読む。

## 現在の状態

本番環境で以下の一連の動作を確認済み。

1. LINE公式アカウントを友だち追加
2. 署名付き登録URLを自動送信
3. ブラウザで同意付き登録
4. Supabaseへ連絡先・同意履歴・配信予約を保存
5. LINEへ登録完了メッセージを送信
6. 翌日・3日後のステップ配信を予約
7. LINEブロックまたは「配信停止」で自動停止

2026年7月14日時点の追加状況:

- LINE自動返信は `replyToken` を使う返信方式へ修正済み（PR #23）
- `モニター登録` / `登録` / `参加したい` で登録URLを自動返信
- `ポイント交換` でポイント交換受付を自動返信
- 自由コメントには一次返信を返す
- LINE公式アカウント側のDefault応答は、Webhookテスト時はOFFにする
- Vercel本番デプロイ確認済み
- 300ポイント謝礼テストは回答10件。PayPay受取済み9件、期限切れ1件
- 期限切れ1名の300ポイントは残し、受取済み9名分のみ実質消化済み

2026年7月17日時点の追加状況:

- 50ポイント通常アンケート `line-50pt-2026-07` は回答9件、450ポイント付与まで確認済み
- 集計結果を `recorda/LINE_50PT_SURVEY_SAMPLE_REPORT_2026-07-17.md` にサンプルレポート化
- 500ポイント交換条件の説明用に `recorda/POINT_EXCHANGE_FAQ.md` を作成
- 50ポイント調査の標準配信文・確認SQLを `recorda/LINE_50PT_SURVEY_OPERATION_COPY.md` に整理
- 次の営業アクションを `recorda/NEXT_SALES_ACTION_2026-07-17.md` に整理
- これらはローカルブランチ `agent/50pt-survey-report-faq` のコミット `ca75235` に含まれるが、GitHub接続不可のためpush/PRは未完了

## サービス構成

- LINE公式アカウント: `レコルダ`
- LINE Developersプロバイダー: `レコルダ合同会社`
- Webhook: `https://recorder-line-11c.vercel.app/api/line-webhook`
- 登録フォーム: `https://recorder-line-11c.vercel.app/recorda/`
- プライバシーポリシー: `https://recorder-line-11c.vercel.app/recorda/privacy.html`
- Vercelプロジェクト: `recorder-line-11c`
- Supabase Organization: `レコルダ合同会社`
- Supabase Project: `recorda-production`（Tokyo）
- GitHub: `recorder11c-cmd/instagram-generator`

## Vercel環境変数

値はGitHub・文書・チャットへ記録しない。VercelプロジェクトのSettingsで管理する。

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`（`sb_secret_`形式）
- `LINE_CHANNEL_SECRET`
- `LINE_CHANNEL_ACCESS_TOKEN`
- `REGISTRATION_TOKEN_SECRET`
- `PUBLIC_BASE_URL`
- `CRON_SECRET`

## データベース

スキーマは `recorda/supabase.sql`。主なテーブル:

- `recorda_contacts`
- `recorda_consent_events`
- `recorda_message_queue`

RLS有効。ブラウザからSupabase Secret keyを使用しない。旧受託データは絶対に取り込まない。

## 自動配信

Vercel Hobby制限に合わせ、Cronは毎日 `00:15 UTC`（日本時間9時台）に実行。Hobbyでは実行時刻に最大約59分の幅がある。

## 次に行うこと

1. GitHub接続が戻ったら `agent/50pt-survey-report-faq` をpushしてPR作成
2. PR反映後、LPへ「はじめての顧客理解レポート」実績サンプル導線を追加
3. LINEのポイント交換説明をFAQベースに整える
4. X/note用に、50ポイント調査の学びを投稿化する
5. 身近な事業者1〜3社へ個別提案する
6. Vercel最新DeploymentがReadyであることを確認
7. LINEプロフィール画像・説明文を設定
8. リッチメニューを作成
9. LINE DevelopersへプライバシーポリシーURLを登録
10. 削除請求の本人確認・管理手順を文書化

## セキュリティ上の注意

- 過去にGit remote URLへ埋め込まれていたGitHub PATは失効済み。再利用しない。
- 初回のLINE Channel secretは画面共有後に再発行済み。古い値を再利用しない。
- LINEアクセストークン、Supabase Secret key、ワンタイムコードをスクリーンショットやチャットへ載せない。
- GitHub remoteは認証情報を含まないHTTPS URLへ修正済み。
- 環境変数を変更したらVercelでRedeployする。

## コード上の主要ファイル

- `recorda/index.html`: 登録フォーム
- `recorda/privacy.html`: プライバシーポリシー
- `recorda/supabase.sql`: DBスキーマ・RPC
- `api/line-webhook.js`: LINEイベント処理
- `api/monitor-register.js`: 同意登録API
- `api/step-dispatch.js`: ステップ配信
- `api/_recorda.js`: 共通処理
- `vercel.json`: Functions・Cron設定

## ローカル作業ツリーについて

元のPCにはInstagram支援など、レコルダとは無関係な未コミット変更が残っている。新しいPCのmainには、PR #1〜#3でマージしたレコルダ関連変更のみが安全に入っている。元PCの未コミット変更を新PCへ移す必要がある場合は、別途ファイル単位で確認すること。
