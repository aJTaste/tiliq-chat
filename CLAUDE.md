@AGENTS.md

# Tiliqua — 開発コンテキスト

このファイルはセッション間で開発の文脈を引き継ぐためのものです。作業開始前に必ず目を通してください。

## プロジェクト概要

- **アプリ名：** Tiliqua（アオジタトカゲの学名。並び替えると "Qualiti" = quality）
- **リポジトリ名：** tiliq-chat（`tiliqua` の意図的な短縮。本人はこの略し方を他でも使用）
- **目的：** プライバシー重視・軽量設計のチャットアプリ。低スペック端末（学校PC含む）でも快適に動作し、広告なし・外部サービス連携なしで運用する
- **要件定義：** [`docs/srs.md`](./docs/srs.md) が正。仕様に迷ったら必ずこちらを参照する
- **開発体制：** コーディングは基本的にClaudeがすべて担当する。ユーザーはUIの確認・動作確認・意見出しを担当（従来の「学びながら一緒に書く」スタイルから変更）
- **前身プロジェクト：** 同じ内容で `tiliqua-chat` というリポジトリで開発していたが、いったん削除し `tiliq-chat` として作り直した。DBスキーマ・認証フローも含めて実装はゼロから作り直す

## 技術スタック（バージョン確定）

| 項目 | バージョン |
| --- | --- |
| Next.js | 16.2.12（App Router） |
| React | 19.2.4 |
| Tailwind CSS | 4.3.3（CSS-first設定、`@theme` を `app/globals.css` に記述） |
| TypeScript | ^5 |
| Node.js | 22系 |
| パッケージ管理 | npm |

## Next.js 16 の破壊的変更（重要）

- **`middleware.ts` は廃止され `proxy.ts` になった。** エクスポート名も `proxy`（または default export）。まだ作成していない（Phase 2で認証チェック用に追加予定）
- **Cache Components（`cacheComponents: true`）はオプトインの新キャッシュモデル。** このプロジェクトでは有効化していない（デフォルトの動的レンダリングのままにしている）。理由：チャット・認証まわりはほぼ全てユーザー個別のデータで、静的キャッシュが馴染まないため
- 破壊的変更は多いため、実装前に `node_modules/next/dist/docs/` 配下の該当ドキュメントを確認すること（`AGENTS.md` の指示どおり）

## デザイントークン（`app/globals.css`）

ブランドコンセプトは「地味な帯模様の体に、驚いたときだけ覗く鮮やかな青い舌」＝アオジタトカゲそのもの。ベースは落ち着いた石・帯模様のニュートラルカラー、アクセントの "tongue" ブルーだけを意図的に希少に使う。

| トークン | 役割 | Light | Dark |
| --- | --- | --- | --- |
| `--surface` | 背景 | `#eae7dd` | `#1b1916` |
| `--surface-raised` | カード等の背景 | `#f5f3ec` | `#252220` |
| `--ink` | 本文テキスト | `#201d19` | `#ede8de` |
| `--ink-muted` | 補助テキスト | `#5c564c` | `#aba294` |
| `--band` | 罫線・区切り | `#c7bca3` | `#4a443b` |
| `--clay` | 装飾アクセント（控えめに使用） | `#8b4331` | `#c97a54` |
| `--tongue` | シグネチャーカラー（CTA・リンク・強調に限定使用） | `#2451c4` | `#6e93f0` |

ライト/ダークは `prefers-color-scheme` に自動追従（手動テーマ切替はSRS上も対象外＝Future Extensions）。

フォント：`--font-display`（Space Grotesk・見出し用）、`--font-body`（Inter・本文、`body`に既定適用）、`--font-label`（IBM Plex Mono・ラベルやメタ情報用、図鑑の標本ラベルのようなトーン）。

トップページ（`app/page.tsx` + `components/TiliquaMark.tsx`）にこのブランドの実装例あり。今後の画面もこのトークンを使って統一する。

## 開発フェーズ

| Phase | 内容 | 状態 |
| --- | --- | --- |
| 0 | プロジェクト基盤（Next.js / Tailwind / PWA / アイコン / ブランドトークン） | **完了** |
| 1 | Supabaseプロジェクト設定・DBスキーマ（9テーブル）・RLS・トリガー | 未着手 |
| 2 | 認証フロー（サインアップ・ログイン・ログアウト・`proxy.ts`） | 未着手 |
| 3 | チャットのコア機能（Room・メッセージ送受信・Realtime） | 未着手 |
| 4 | 画像送信（Cloudinary連携） | 未着手 |
| 5 | フレンド・ストレンジャー・ブロック機能 | 未着手 |
| 6 | 一時チャット・追加認証（PIN/キー）・非表示メッセージ | 未着手 |
| 7 | 通知設定・PWA仕上げ（Service Worker）・低スペック最適化・デプロイ | 未着手 |

## 開発上の重要な原則（前身プロジェクトからの引き継ぎ）

- **テーブル分割：** `profiles`（全認証ユーザーが読める公開情報）と `user_settings`（オーナーのみ読める非公開情報）に分割する。RLSは行レベルで機能するため、列単位で公開範囲を分けたい場合はテーブルを分ける
- **MXバイパス：** `signUp()` は内部ドメインメール（`{username}@tiliqua.app`）だとMXレコード検証で弾かれるため、`adminClient.auth.admin.createUser()` + `email_confirm: true` を使う
- **service_roleの権限：** SQL Editorで作成したテーブルは`service_role`への権限が自動付与されないため、`GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role` を忘れずに実行する
- **トリガーの`search_path`：** `handle_new_user()` のようなauthスキーマ配下から実行されるトリガー関数は `SET search_path = public` が必須
- **パフォーマンス：** メッセージ送受信などホットパスは、Route Handlerを経由せず Supabase クライアントを直接呼び出す。Route Handlerは認証・特権操作専用に限定する
- **コード提供方針：** 部分的なスニペットではなく、そのまま置き換え可能な完全なファイルを提供する
- **コミット：** Conventional Commits形式でコミットする

## ファイル構成（現時点）

```
tiliq-chat/
├── app/
│   ├── layout.tsx        # フォント・メタデータ・PWA設定
│   ├── page.tsx           # アプリ紹介ページ（SRS 3.2.1）
│   ├── globals.css        # デザイントークン・Tailwind v4設定
│   └── favicon.ico
├── components/
│   └── TiliquaMark.tsx    # ブランドロゴ（ホバーで "Qualiti" が覗く）
├── public/
│   ├── manifest.webmanifest
│   ├── icon-192.png / icon-512.png / icon-maskable-512.png / apple-touch-icon.png
├── docs/
│   └── srs.md              # 要件定義（正）
├── .env.example
└── CLAUDE.md（このファイル）
```

`lib/supabase/`（client.ts / server.ts / admin.ts）、`types/` は Phase 1 で実装とあわせて追加する。
