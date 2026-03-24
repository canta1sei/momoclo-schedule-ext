# プライバシーポリシー / Privacy Policy

**ももクロ スケジュール見やすく**

最終更新日: 2026年3月25日

---

## 収集する情報

本拡張機能はユーザーの個人情報を収集・送信しません。

本拡張機能が保存するデータはすべてユーザーのブラウザ内にのみ存在します：

| データ | 保存先 | 目的 |
|--------|--------|------|
| スケジュールキャッシュ | `localStorage` / `chrome.storage.local` | 再アクセス時の高速表示 |
| 設定（取得月数・通知設定・ON/OFF） | `chrome.storage.sync` | ユーザー設定の保存 |

---

## 外部通信

本拡張機能は以下のサイトにのみアクセスします：

- `https://www.momoclo.net/schedule` — ももいろクローバーZ 公式スケジュールページ（表示データの取得のみ）

取得したデータは第三者に送信されません。

---

## パーミッション

| パーミッション | 用途 |
|----------------|------|
| `storage` | 設定・キャッシュの保存 |
| `alarms` | 毎朝のリマインダー通知のスケジューリング |
| `notifications` | イベントリマインダーの表示 |
| `tabs` | 設定変更時の対象タブのリロード |

---

## 免責事項

本拡張機能はファンが個人利用のために作成した非公式ツールです。ももいろクローバーZ および所属事務所・レーベルとは一切関係ありません。

---

## お問い合わせ

ご不明な点は GitHub Issues にてお知らせください。
https://github.com/canta1sei/momoclo-schedule-ext/issues

---

*This extension does not collect any personal information. All data is stored locally in your browser.*
