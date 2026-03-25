---
name: 機能追加
about: 新しい機能の提案・実装
title: "feat: "
labels: enhancement
---

## 概要
<!-- どんな機能を追加するか -->

## 実装方針
<!-- どう実装するか -->

## 影響ファイルチェックリスト
設定・データ取得・表示に関わる変更は **必ず全ファイルを確認** すること。

### 設定（`chrome.storage` の追加・変更・削除）
- [ ] `shared.js` — `MCZ_DEFAULT_SETTINGS` を更新
- [ ] `options.js` / `options.html` — UI を追加
- [ ] `content.js` — 設定を読んで使っているか確認
- [ ] `popup.js` — 設定を読んで使っているか確認
- [ ] `background.js` — 設定を読んで使っているか確認

### スケジュール取得ロジックの変更
- [ ] `shared.js` — `mczFetchMonth` を更新
- [ ] `content.js` — 影響確認
- [ ] `popup.js` — 影響確認
- [ ] `background.js` — 影響確認

### UI 変更
- [ ] `content.js` — メインページ
- [ ] `style.css` — スタイル
- [ ] `popup.js` / `popup.html` — ポップアップ
- [ ] `options.js` / `options.html` — 設定ページ

### manifest.json
- [ ] 新しいパーミッションが必要な場合は追加したか
- [ ] 新しいファイルを `content_scripts` に追加が必要か

## 完了条件
- [ ] 上記チェックリストを全確認した
- [ ] 動作確認済み
