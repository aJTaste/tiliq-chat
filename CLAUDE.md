@AGENTS.md
@docs/architecture.md
@docs/backlog.md
@docs/lessons.md

# Tiliqua — 開発コンテキスト

このファイルはセッション間で開発の文脈を引き継ぐためのものです。作業開始前に必ず目を通してください。

## このファイルの読み方（重要）

このCLAUDE.mdは「現状スナップショット＋索引」専用で、**Phaseごとの実装詳細・設計判断の物語は書かない**。関連ファイルの役割は以下の通り：

- `CLAUDE.md`（このファイル）… 現在の技術スタック・運用ルール・Phase一覧（索引）・恒久的な開発原則のみ
- `docs/architecture.md`（自動読み込み）… 現在のディレクトリ構成・設計パターンの現状スナップショット
- `docs/backlog.md`（自動読み込み）… 今open な「次にやること」。解決済み項目は都度削除する
- `docs/lessons.md`（自動読み込み）… Phase横断の技術的教訓・落とし穴（Next.js/RLS/Realtime/依存関係更新など）
- `docs/phases/phase-NN-slug.md`（**自動読み込みしない**）… 各Phaseの実装内容・設計判断・学び・確認項目チェックリストの詳細アーカイブ。過去の経緯を聞かれた時だけGrep/Readで開く
- `docs/srs.md`（自動読み込みしない）… 要件定義（正）。仕様に迷ったら参照する
- `docs/schema.sql`（自動読み込みしない）… DBスキーマ参照用（実マイグレーションはSupabase MCPで管理）

**新しいPhaseが完了したら、CLAUDE.md本体に実装詳細を書き足さないこと。** `/wrap-phase` スラッシュコマンド（`.claude/commands/wrap-phase.md`）を使い、詳細は`docs/phases/`への新規ファイルとして追加し、CLAUDE.mdの「開発フェーズ」表には1行（詳細へのリンク付き）だけ足す。この規律を破ると、このファイルは以前と同じペースで肥大化する（過去に1,477行まで膨れた実例がある。経緯は`docs/phases/`の各ファイル参照）。

## プロジェクト概要

- **アプリ名：** Tiliqua（アオジタトカゲの学名。並び替えると "Qualiti" = quality）
- **リポジトリ名：** tiliq-chat（`tiliqua` の意図的な短縮。本人はこの略し方を他でも使用）
- **目的：** プライバシー重視・軽量設計のチャットアプリ。低スペック端末（学校PC含む）でも快適に動作し、広告なし・外部サービス連携なしで運用する
- **要件定義：** [`docs/srs.md`](./docs/srs.md) が正。仕様に迷ったら必ずこちらを参照する
- **開発体制：** コーディングは基本的にClaudeがすべて担当する。ユーザーはUIの確認・動作確認・意見出しを担当
- **開発環境：** Windows 11 / VS Code。パッケージ管理はnpm
- **会話の切り替え運用：** Claude利用制限を抑えるため、Phaseや作業のまとまりごとに会話を切り替える。区切りの良いところに達したら、会話が終わる前に必ず `/wrap-phase` を実行してから終えること（手動でCLAUDE.md本体に書き足さない）

## アカウント運用（2026年8月〜）

2026年8月、Claude Proのゲストパス（友人からの紹介リンク）を誤って新規のClaudeアカウントでredeemしてしまったことをきっかけに、以下の2アカウント体制で開発を進めることになった。

- **メインアカウント：** 本来Pro/Claude Codeを使う予定だった、これまで開発してきたアカウント。以後もこちらを主として開発を進める
- **サブアカウント：** ゲストパスを誤ってredeemしてしまった新規アカウント。メインアカウントが利用制限に達した場合の予備として使う

**運用ルール：**

- 基本はメインアカウントのClaude Codeで開発を進める。メインアカウントが利用制限（レート制限等）に達した場合のみサブアカウントに切り替える
- 両アカウントは同じローカルリポジトリ（WSL内`tiliq-chat`）を操作するため、アカウントを切り替える際は必ず`git pull`で最新化してから作業を始め、作業単位ごとに`commit`・`push`する
- 同時に両アカウントで並行編集しない（コンフリクト防止）
- サブアカウント側のClaude Projectには、このCLAUDE.mdの要約と経緯をまとめた引き継ぎメッセージを別途設定済み

## 技術スタック（バージョン確定）

| 項目                  | バージョン                                                   |
| --------------------- | ------------------------------------------------------------ |
| Next.js               | 16.3.0（App Router）                                         |
| React                 | 19.2.8                                                        |
| Tailwind CSS          | 4.3.3（CSS-first設定、`@theme` を `app/globals.css` に記述） |
| TypeScript            | ~6.0.3（7系への更新は外部ブロッカーあり。`docs/lessons.md`「eslint / typescript メジャー更新」参照） |
| @supabase/ssr         | ^0.12.4                                                      |
| @supabase/supabase-js | ^2.112.3                                                     |
| Node.js               | 22系                                                          |
| パッケージ管理        | npm                                                          |

## Supabaseプロジェクト（Phase 1で作成）

| 項目           | 値                                         |
| -------------- | ------------------------------------------ |
| プロジェクト名 | `tiliq-chat`                               |
| project ref    | `xewprddypddcxkwvcytu`                     |
| リージョン     | ap-northeast-1（東京）                     |
| Project URL    | `https://xewprddypddcxkwvcytu.supabase.co` |
| 料金           | 無料プラン（月額0円）                      |

`.env.local` には以下を設定：

```
NEXT_PUBLIC_SUPABASE_URL=https://xewprddypddcxkwvcytu.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_VIxVf8bWwth8Afc_ojKkug_FJdQknnz
SUPABASE_SERVICE_ROLE_KEY=（Supabaseダッシュボード → Project Settings → API Keysから手動取得。MCP経由では取得不可）

# Cloudinaryダッシュボード（Settings → API Keys）から取得
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

Supabaseダッシュボードの操作上の注意点（Realtimeパブリケーションの場所など）は `docs/lessons.md`「Realtime」参照。

## デザイントークン（`app/globals.css`）

ブランドコンセプトは「地味な帯模様の体に、驚いたときだけ覗く鮮やかな青い舌」＝アオジタトカゲそのもの。ベースは落ち着いた石・帯模様のニュートラルカラー、アクセントの "tongue" ブルーだけを意図的に希少に使う。

| トークン           | 役割                                                       | Light     | Dark      |
| ------------------ | ---------------------------------------------------------- | --------- | --------- |
| `--surface`        | 背景                                                       | `#eae7dd` | `#1b1916` |
| `--surface-raised` | カード等の背景                                             | `#f5f3ec` | `#252220` |
| `--ink`            | 本文テキスト                                               | `#201d19` | `#ede8de` |
| `--ink-muted`      | 補助テキスト                                               | `#5c564c` | `#aba294` |
| `--band`           | 罫線・区切り                                               | `#c7bca3` | `#4a443b` |
| `--clay`           | 装飾アクセント（控えめに使用。エラーメッセージにも流用中） | `#8b4331` | `#c97a54` |
| `--tongue`         | シグネチャーカラー（CTA・リンク・強調に限定使用）          | `#2451c4` | `#6e93f0` |

ライト/ダークは `prefers-color-scheme` に自動追従（手動テーマ切替はSRS上も対象外＝Future Extensions）。

フォント：`--font-display`（Space Grotesk・見出し用）、`--font-body`（Inter・本文、`body`に既定適用）、`--font-label`（IBM Plex Mono・ラベルやメタ情報用）。

## 開発フェーズ（索引）

各行の「詳細」は `docs/phases/` 内のアーカイブファイルへのリンク。実装内容・設計判断・学び・確認項目はすべてそちら側にある。

| Phase | 内容                                                                       | 状態     | 詳細 |
| ----- | -------------------------------------------------------------------------- | -------- | ---- |
| 0     | プロジェクト基盤（Next.js / Tailwind / PWA / アイコン / ブランドトークン） | 完了 | — |
| 1     | Supabaseプロジェクト設定・DBスキーマ（9テーブル）・RLS・トリガー           | 完了 | [phase-01](docs/phases/phase-01-supabase-schema.md) |
| 2     | 認証フロー（サインアップ・ログイン・ログアウト・`proxy.ts`）               | 完了 | [phase-02](docs/phases/phase-02-auth-flow.md) |
| 3     | チャットのコア機能（Room・メッセージ送受信・Realtime・ページング）         | 完了 | [phase-03](docs/phases/phase-03-chat-core.md) |
| 4     | 画像送信（Cloudinary連携）                                                 | 完了 | [phase-04](docs/phases/phase-04-image-upload.md) |
| 5     | フレンド・ストレンジャー・ブロック                                         | 完了 | [phase-05](docs/phases/phase-05-friends-strangers-blocking.md) |
| 6     | 一時チャット・追加認証・非表示メッセージ                                   | 完了 | [phase-06](docs/phases/phase-06-auth-and-temp-chat.md) |
| 7     | 通知設定・PWA仕上げ（デプロイは対象外）                                    | 完了 | [phase-07](docs/phases/phase-07-notifications-pwa.md) |
| 8     | 地固め（バグ修正・技術的負債の解消・小粒UX修正）                           | 完了 | [phase-08](docs/phases/phase-08-stabilization.md) |
| 9     | SRS未実装の中規模項目（汎用エラー画面・チャット内検索・レスポンシブ配置・キーボードアクセシビリティ） | 完了 | [phase-09](docs/phases/phase-09-srs-gaps.md) |
| 10    | フレンド申請/解除のRealtime購読コード                                     | 完了 | [phase-10](docs/phases/phase-10-friend-request-realtime.md) |
| 11    | 依存パッケージのバージョン更新                                             | 完了 | [phase-11](docs/phases/phase-11-dependency-updates.md) |
| 12    | 依存パッケージのメジャー更新（typescript）                                | 完了 | [phase-12](docs/phases/phase-12-typescript-major-update.md) |
| 13    | ユーザー追加パネルをPCで常時展開に変更                                    | 完了 | [phase-13](docs/phases/phase-13-adduser-panel-pc-expanded.md) |
| 14    | eslint/typescriptメジャー更新の再チェック・テキスト送信失敗時の自動リトライ（SRS 3.4） | 完了 | [phase-14](docs/phases/phase-14-retry-and-tooling-recheck.md) |
| 15    | 地固め総仕上げ：バグ・脆弱性・古い依存の再確認＋`docs/srs.md`と実装の乖離解消 | 完了 | [phase-15](docs/phases/phase-15-consolidation-and-srs-sync.md) |
| 16    | 実機フィードバックのUIバグ3件修正・起動時ゲート中のヘッダー非表示化・AuthGate表示位置の調整・グループチャットUI M1設計とナビゲーション刷新構想の整理 | 完了 | [phase-16](docs/phases/phase-16-ui-fixes-and-nav-concept.md) |
| 17    | ナビゲーション構造刷新M1（永続サイドバーシェル）：Route Groups + 共有Layoutで`/home`・`/chat/[roomId]`を統合 | 完了 | [phase-17](docs/phases/phase-17-persistent-sidebar-shell.md) |
| 18    | チャット切り替え時の体感速度改善（DBクエリ並列化）・`/chat/[roomId]/hidden`の起動時ゲートバイパス修正 | 完了 | [phase-18](docs/phases/phase-18-chat-switch-perf.md) |
| 19    | グループチャットUI M1（作成・一覧表示・メッセージ送受信＋送信者名表示）    | 完了 | [phase-19](docs/phases/phase-19-group-chat-m1.md) |
| 20    | eslint/typescriptメジャー更新の再チェック（結果：継続ブロック、コード変更なし） | 完了 | [phase-20](docs/phases/phase-20-tooling-recheck.md) |
| 21    | グループチャットM2（メンバー一覧・追加・削除・退出）                      | 完了 | [phase-21](docs/phases/phase-21-group-chat-m2-members.md) |
| 22    | グループチャットM3（オーナー譲渡・グループ削除）                          | 完了 | [phase-22](docs/phases/phase-22-group-chat-m3-ownership.md) |
| 23    | サイドバーUI再設計（検索/一覧タブ排他切替・＋新規作成メニュー・デザイン密度調整） | 完了 | [phase-23](docs/phases/phase-23-sidebar-redesign.md) |
| 24    | グループチャットM4（グループ名変更・アバター設定）・メッセージ送信が「送信中」のまま固まるバグの修正 | 完了 | [phase-24](docs/phases/phase-24-group-chat-m4.md) |

次にやることは `docs/backlog.md` を参照。

## 開発上の重要な原則

- **テーブル分割：** `profiles`（全認証ユーザーが読める公開情報）と `user_settings`（オーナーのみ読める非公開情報）に分割する
- **MXバイパス：** `signUp()`は使わず`adminClient.auth.admin.createUser()` + `email_confirm: true`を使う
- **service_roleの権限：** SQL Editor / migration API で作成したテーブルは`service_role`への権限が自動付与されないため、`GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role`を忘れずに実行する
- **トリガーの`search_path`：** authスキーマ配下から実行されるトリガー関数は`SET search_path = public`が必須
- **パフォーマンス：** メッセージ送受信などホットパスは、Route Handlerを経由せずSupabaseクライアントを直接呼び出す。Route Handlerは認証・特権操作専用に限定する（Cloudinaryの署名発行も同じ原則。ただしファイル本体はRoute Handlerを経由させず、ブラウザから直接Cloudinaryへ送る）。一覧系の複雑な集計はRPC（SECURITY DEFINER関数）に寄せてN+1を避ける
- **Realtime対象テーブルの登録を忘れない：** 新しくRealtime購読が必要なテーブルを追加したら、`supabase_realtime`パブリケーションへの追加を忘れずに行う
- **コード提供方針：** 部分的なスニペットではなく、そのまま置き換え可能な完全なファイルを提供する。ジェネリクス・JSXなど`<`を含む長いコードはチャットのコードブロックではなくファイルとして渡す。可能な場合はサンドボックスに同一構成のプロジェクトを再構築し`tsc --noEmit`で検証してから渡す
- **コミット：** Conventional Commits形式でコミットする
- **破壊的変更の確認：** Next.js等のバージョン依存の仕様に不安がある場合、AGENTS.mdの指示通り実物のドキュメント（npmパッケージから取得可能）またはWeb検索で確認してからコードを書く
- **このファイル自体の運用：** Phase完了時は本体に実装詳細を書き足さず`/wrap-phase`を使う（詳細は冒頭「このファイルの読み方」参照）
