## Phase 20 の実装内容・詳細

CLAUDE.md「次にやること（Phase 19・未確定）」候補7（eslint 9→10・typescript 6.0→7系メジャー更新の再チェック）を実施。あわせてPhase 15スタイルの軽い技術的負債確認（TODO/FIXMEコメント・ビルドエラー抑制設定・`.env.example`の整合性）も行った。**調査の結果コード変更が必要な項目は一切無く、本Phaseはこの記録のみで完結する。**

### eslint（9→10）・typescript（6.0→7系）：状況変化なし、継続ブロック（2026-08-13時点）

- `typescript-eslint`（現行8.65.0）の`peerDependencies.typescript`は依然`>=4.8.4 <6.1.0`のまま。前提となる**TypeScript 7.1自体も未リリース**（`npm view typescript dist-tags`：`latest: 7.0.2`、`next: 7.1.0-dev.20260813.1`のdevビルドのみ）
- `eslint-plugin-react`は依然7.37.5のまま、`peerDependencies.eslint`は`^9.7`まで（`eslint-config-next@16.3.0`が同梱するバージョンも変わらず）
- Phase 16で言及したESLint 10対応PR（[jsx-eslint/eslint-plugin-react#4022](https://github.com/jsx-eslint/eslint-plugin-react/pull/4022)）の状況をWeb検索で確認：**依然オープンのまま。** レビュアー承認済み・独立検証（ESLint 9.39.4と10.8.1で1,229件の指摘が一致）も完了しているが、メンテナ（ljharb）の最終アクション待ちの状態がPhase 16時点から変わっていない
- `npm audit`：脆弱性0件
- `npm outdated`：`@types/node`（22.20.1→26.2.0）・`eslint`（9.39.5→10.8.1）・`typescript`（6.0.3→7.0.2）の3件のみ。`@types/node`はNode.jsランタイムのターゲットとは無関係な最新配布のため意図的に追従しない（Phase 11の判断を継続）

### 技術的負債の簡易確認：問題なし

- `app/`/`components`/`lib`配下にTODO/FIXME/XXX/HACKコメント：0件
- `next.config.ts`にビルドエラー抑制設定（`eslint.ignoreDuringBuilds`・`typescript.ignoreBuildErrors`）：無し
- `.env.example`：CLAUDE.md記載の環境変数一覧と一致

### 検証方法・実施内容

- コード変更が無いため`npx tsc --noEmit`・`npx eslint .`・クリーンビルドは今回実施していない（無風のため）
- `npm view`・`npm outdated`・`npm audit`・grepによる調査のみ

### 未対応・持ち越し事項（Phase 20時点）

- eslint（9→10）・typescript（6.0→7系）は引き続きブロック中。**次回監視ポイント：** `eslint-plugin-react`の新バージョン公開有無（PR #4022マージ後を想定）、TypeScript 7.1の正式リリース＋`typescript-eslint`の対応リリース

