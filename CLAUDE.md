# k-sta / kato-insta-support プロジェクト

## セッション終了時に必ずやること
1. `sites_list.csv` を最新状態に更新する
2. 変更があれば `feedback_notes.md` に記録する
3. GitHub に push する（`git add -f sites_list.csv && git add feedback_notes.md && git commit && git push`）

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

## 現在の状況（2026-06-08時点）
- 無料モニター枠：5店舗（残り5）締切6月末
- 友人3店（@johkoya @kamanza_maruhuku @yakiniku_mamoru）へDM送付予定
- 投稿⑤⑥：6/14(土) 11:00・19:00 予定
- 有料移行後にStripe決済を導入予定
