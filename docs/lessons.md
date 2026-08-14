# 横断的な技術知見（Lessons）

Phase横断で繰り返し関係してくる技術的な落とし穴・確定した仕様理解をトピック別にまとめたもの。個別Phaseの経緯・設計判断の詳細は `docs/phases/phase-NN-*.md` を参照。ここは「次に似たコードを書くときに事前に知っておくべきこと」だけを保つ。**新しい教訓を追加するのは歓迎するが、Phaseの実装ログ自体（追加ファイル一覧・確認項目チェックリスト等）はここではなく `docs/phases/` に置くこと。**

## Next.js 16（このフォーク）の破壊的変更

- **このNext.jsフォークは通常と異なる破壊的変更を含みうる。実装前に必ず `node_modules/next/dist/docs/` の実物ドキュメントを確認する**（AGENTS.mdの方針）。パッチ/マイナーに見えるバージョン更新でも、実際に使用している実験的（`unstable_`プレフィックス）APIについては更新の都度ドキュメントを再確認する（例：`error.tsx`の`unstable_retry`→`retry`への安定化はv16.3.0で発生。`unstable_rethrow`はv16.3.0でも未安定化のまま、と関数ごとに安定化タイミングが異なる）
- `middleware.ts` は廃止され `proxy.ts` になった（named export `proxy`）。`request.cookies`/`response.cookies` APIは旧middlewareと同一、デフォルトでNode.jsランタイム
- 動的ルートの`params`はPromise。`await params`で取り出す
- Route Handler（`route.ts`）自体のシグネチャは不変（`export async function POST(request: Request)`のまま）
- `error.tsx`/`global-error.tsx`は`{ error, retry }`を受け取る（`reset`ではない）。`global-error.tsx`はルートレイアウトの`<head>`・フォント・globalCSSを自動継承しないため、独自に再宣言が必要
- `redirect()`は`digest`付きの特殊なエラーをthrowする仕組み。素朴にtry/catchすると内部シグナルを握りつぶし遷移が起きなくなる（サイレントな退行）。catch節の先頭で`next/navigation`の`unstable_rethrow(err)`を呼んでから、それ以外の例外だけをネットワークエラーとして扱う
- 共有レイアウト（`layout.tsx`）はルート間で状態を保持し再マウントされない。動的パラメータ（例：`[roomId]`）が変わるごとに強制リマウントしたい場合は`template.tsx`を使う（`layout.tsx`ではなく）
- Parallel Routesは、非表示スロットもサーバー実行されRSCペイロードに含まれてしまう仕様のため、「ロック中は何も取得しない」系の設計とは相性が悪い

## PostgreSQL / RLS / RPC

- **PostgRESTの重要な落とし穴：`revoke execute ... from public`だけでは`anon`ロールからのRPC直接実行を防げない。** Supabaseはスキーマのデフォルト権限（`ALTER DEFAULT PRIVILEGES`）により新規作成した関数へ`anon`のEXECUTE権限を自動付与するため、`public`からのrevokeとは別に`anon`へも明示的にrevokeする必要がある。**新規RPCを追加するたびに** `revoke from public` → `grant to authenticated` → `revoke from anon` の三点セットを行う
- **`drop function` → `create function`し直した関数は、古いACL（anon revoke含む）を引き継がない。** 新しいOIDの関数として扱われるため、戻り値の型変更等で`drop`→`create`が必要になった際は、anon revokeのやり直しを忘れずに（`create or replace`のままなら不要）
- **「SELECTポリシーの条件を書き換えるUPDATE（ソフトデリート等）」は直接のテーブルUPDATEでは実現できない。** PostgreSQLのRLSは、UPDATE時に更新後の新しい行がSELECTポリシーからも見える状態であることを暗黙的に要求するため、「`deleted_at`を設定して見えなくする」という論理削除の目的自体がこの暗黙チェックと構造的に衝突する。SECURITY DEFINER関数（RPC）で明示的に権限チェックしてから更新する
- **自己参照的なRLS更新（例：オーナーが自分自身の`role`をowner→memberに書き換える）は、`WITH CHECK`の再評価時点で権限を失いchicken-and-egg的に失敗する。** 素のテーブルUPDATEでは実現不可能なため、RLSを完全にバイパスするSECURITY DEFINER RPCが必要
- `room_members`など自己参照的なRLSで無限再帰を避けるため、`is_room_member()`/`is_room_owner()`/`is_blocked()`のようなSECURITY DEFINERヘルパー関数を切り出す
- RLSポリシーの`WITH CHECK (true)`はAdvisorに警告される。`WITH CHECK (auth.uid() is not null)`のように明示的に書く
- `get_advisors`の結果は数分キャッシュされることがある
- 型生成（`generate_typescript_types`）はマイグレーション適用の**後**に行う。先に生成すると新規RPCの型（Args/Returns）が反映されない
- RPC戻り値のNULL許容カラムは、生成型では非nullとして出力される既知の制限がある。アプリ側で`?? null`防御する
- DB層のRLS・RPCの動作確認は、Supabase MCPの`execute_sql`で `begin; set local role authenticated; set local request.jwt.claims ...; ...; rollback;` によるトランザクション内シミュレーションが有効（実データを汚さずに正常系・異常系・権限境界を検証できる）

## Realtime

- 新しくRealtime購読が必要なテーブルを追加したら、`supabase_realtime`パブリケーションへの追加を忘れない（`alter publication supabase_realtime add table public.テーブル名;`）。DBへの保存自体は成功するため、これを忘れても気づきにくい
- Supabaseダッシュボード新UI：「Database → Replication」は物理レプリカ／分析パイプライン用。Realtimeのテーブル登録は「Database → Publications」から行う
- `supabase_realtime_messages_publication`という紛らわしい名前のパブリケーションは`realtime.messages`（Presence/Broadcast用システムテーブル）向けで、アプリの`public.messages`とは無関係。誤って触らない
- RLSが有効なテーブルの`postgres_changes`購読は、読み取りを許可されたクライアントにのみ配信される。`filter:`（1カラムの等価条件のみ、OR不可）に頼らずRLSに絞り込みを任せられるケースが多い

## Cloudinary / 画像

- アップロードはブラウザ→Cloudinaryへ直接（署名付き）。Route Handlerは署名生成のみを担当し、画像本体は経由させない（Vercelサーバーレス関数のボディ上限・実行時間制約を回避）
- 署名対象パラメータは`folder`と`timestamp`のみ（キー昇順→`key=value`を`&`連結→`api_secret`を末尾連結→SHA1）
- アニメーションGIFはCloudinary変換時に`fl_animated`を付けないとデフォルトで先頭フレームのみ配信される（先頭フレームが空白/透明なGIFだと「何も表示されない」ように見える）。canvas再圧縮もアニメーションを壊すため、GIFはバリデーションのみ通して元ファイルをそのままアップロードする
- next/image（Vercelの画像最適化API）は不採用。CloudinaryのURLに`f_auto,q_auto`を付けるだけで最適化できるため、併用すると二重変換になりVercel無料プランの画像最適化回数を無駄に消費する

## セキュリティゲート設計（AuthGate等）

（テーブル分割・service_role権限・トリガーの`search_path`・ホットパスの原則などの基本方針はCLAUDE.md「開発上の重要な原則」参照。ここには追加で判明した個別の教訓のみ記す）

- **AuthGate等のセキュリティゲートを新しい場所に埋め込む際は、その階層がクライアント側取得（ゲート解錠後にブラウザから直接データ取得）になっているか確認する。** Server Componentが無条件でデータを事前取得すると、画面上はゲートで隠れていてもRSCペイロード自体に解錠前のデータが乗ってしまう
- **新しいルートを追加する時は、既存の起動時認証ゲート等の「ページ単位の個別チェック」が新ルートで漏れていないか確認する。** 共有レイアウトのゲートはUI表示を守るだけで子ページの実行までは止められないため、独立ページには個別のゲート判定が必要になることがある（実例：`/chat/[roomId]/hidden`の起動時ゲートバイパス。詳細は`docs/phases/phase-18-chat-switch-perf.md`）

## ツール・依存関係更新

- **メジャーバージョン更新の計画時は、`npm view`でのpeer dependency確認だけで終わらせず、必ず実際にインストールしてコマンドを実行してから確定する。** peer警告が出ないことと実際にコマンドが動くことは別の確認軸（実例：ESLint 10化はpeer警告無しでインストールできたが、`eslint-plugin-react`が実行時クラッシュした）
- 直接の依存関係ではなく`eslint-config-next`等が内部で選ぶ間接依存のバージョンは、こちら側の`package.json`を書き換えても制御できない。上流の追従を待つ受動的な制約

## eslint / typescript メジャー更新（現状の恒久ブロッカー・随時確認）

- **typescript 7系：** `typescript-eslint`の`peerDependencies.typescript`が`<6.1.0`に固定されている（TypeScript 7.0がProgrammatic Compiler APIを未提供のため）。TypeScript 7.1（`typescript-eslint`対応の前提）自体が未リリース。次回確認：`npm view typescript-eslint peerDependencies`
- **eslint 10系：** `eslint-plugin-react`がESLint 10のRuleContext API変更に未対応（`peerDependencies.eslint`が`^9.7`まで）。対応PR（[jsx-eslint/eslint-plugin-react#4022](https://github.com/jsx-eslint/eslint-plugin-react/pull/4022)）はレビュー・検証済みでメンテナの最終マージ待ち。次回確認：`npm view eslint-plugin-react@latest version`（7.37.5から変わっていないか）
- 状況を確認したら、変化の有無に関わらずこのファイルの該当箇所を更新すること（結果を`docs/phases/`に新規Phaseとして記録するかは、実際にコード変更が発生したかどうかで判断する）
