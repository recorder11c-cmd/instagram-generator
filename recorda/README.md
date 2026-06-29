# レコルダ 自動化基盤

LINEの友だち追加から、同意取得、登録、属性別ステップ配信までを自動化する最小構成です。

## 初期設定

1. Supabaseでプロジェクトを作成し、SQL Editorで `supabase.sql` を実行
2. Vercelに次の環境変数を設定
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `LINE_CHANNEL_SECRET`
   - `LINE_CHANNEL_ACCESS_TOKEN`
   - `REGISTRATION_TOKEN_SECRET`（32文字以上のランダム値）
   - `PUBLIC_BASE_URL`（例: `https://example.vercel.app`）
   - `CRON_SECRET`（32文字以上のランダム値）
3. LINE DevelopersのWebhook URLを `https://ドメイン/api/line-webhook` に設定
4. Vercelへデプロイすると、`vercel.json` のCron設定により毎日9時台（日本時間）にステップ配信が実行される

## 自動処理

1. LINE友だち追加
2. 24時間有効の署名付き登録URLを自動送信
3. フォーム登録時に、連絡先と同意イベントを別テーブルへ保存
4. 属性別の翌日・3日後メッセージを予約
5. 定期処理が対象メッセージを送信（失敗時は最大3回）
6. LINEブロック、または「配信停止」というメッセージを受けて自動停止

## 運用前に行うこと

- プライバシーポリシー本文と問い合わせ窓口を公開する
- 同意文面を変更したら `CONSENT_VERSION` も更新する
- `privacy.html` 内の会社情報・問い合わせ窓口・外部サービス記載を確定する
- 削除請求は本人確認後に管理画面から対応する
- Supabaseのサービスロールキーはブラウザ側へ置かない
- 旧受託データをこのDBへインポートしない
