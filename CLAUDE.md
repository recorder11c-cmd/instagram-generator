# k-sta / kato-insta-support プロジェクト

## セッション終了時に必ずやること
1. `sites_list.csv` を最新状態に更新する
2. 変更があれば `feedback_notes.md` に記録する
3. `ksta_管理シート_20260617.xlsx` を最新状態に更新する（KPI・クライアント状況・作業ログ）
4. GitHub に push する（`git add -f sites_list.csv && git add feedback_notes.md && git commit && git push`）

## プロジェクト概要
飲食店向けInstagram投稿文自動生成サービス「k-sta」の開発・運用

## 主要URL
- サービスLP: https://kato-insta-support.vercel.app
- ジェネレーター(johkoya): https://kato-insta-support.vercel.app/gen.html
- デモ版: https://kato-insta-support.vercel.app/demo.html
- オンボーディング: https://kato-insta-support.vercel.app/onboarding.html
- 営業キット: https://kato-insta-support.vercel.app/sales_kit.html
- GitHub: https://github.com/recorder11c-cmd/instagram-generator

## デプロイ方法
```bash
cd ~/Desktop/johkoya_demo
VERCEL_TOKEN=vcp_... ANTHROPIC_API_KEY=sk-ant-... python3 deploy_service.py
```

## 現在の状況（2026-06-17時点）
- 無料モニター枠：残り5枠（締切6月末）
- 友人3店（@johkoya @kamanza_maruhuku @yakiniku_mamoru）へDM未送付→今日中に送付
- Stripe決済実装済み（テスト環境）：ライト¥4,980・フル¥9,800
- Stripe本番審査申請済み（通過後に本番キーで再作成）
- 有料転換メール：6月28日までに送付予定
