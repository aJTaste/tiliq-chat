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
- **オーナー限定の単一カラム更新でも、更新対象が呼び出し者自身のRLS判定条件（例：`is_room_owner`が参照する`role`列）に影響しないなら、既存のUPDATE系ポリシーへ素のテーブル操作を乗せるだけで足りる。** 新規RPCが必要かどうかの分岐点は「オーナーかどうか」ではなく「更新対象が判定条件そのものを書き換えるか」（実例：`rooms.name`/`avatar_url`の更新は`rooms_update_owner`ポリシーだけで完結したが、`room_members.role`の自己書き換えは上記の理由でRPCが必須だった）
- `room_members`など自己参照的なRLSで無限再帰を避けるため、`is_room_member()`/`is_room_owner()`/`is_blocked()`のようなSECURITY DEFINERヘルパー関数を切り出す
- RLSポリシーの`WITH CHECK (true)`はAdvisorに警告される。`WITH CHECK (auth.uid() is not null)`のように明示的に書く
- `get_advisors`の結果は数分キャッシュされることがある
- 型生成（`generate_typescript_types`）はマイグレーション適用の**後**に行う。先に生成すると新規RPCの型（Args/Returns）が反映されない
- RPC戻り値のNULL許容カラムは、生成型では非nullとして出力される既知の制限がある。アプリ側で`?? null`防御する
- DB層のRLS・RPCの動作確認は、Supabase MCPの`execute_sql`で `begin; set local role authenticated; set local request.jwt.claims ...; ...; rollback;` によるトランザクション内シミュレーションが有効（実データを汚さずに正常系・異常系・権限境界を検証できる）
- **`UPDATE`文がRLSの`USING`句に一致しない行に当たった場合、例外は発生せず単にその行が対象から除外される（0行更新で正常終了）。** 「RLSで書き込みがブロックされること」を検証するテストを書く際、うっかり「例外が飛ぶはず」という前提でアサーションすると誤って失敗する（実例：Phase 29で`room_members_update_owner`ポリシーが非オーナーの自己UPDATEを防いでいることを確認しようとして、最初のテストは例外を期待して失敗した）。正しい検証方法は「UPDATE実行後にSELECTし直し、値が変化していないことを確認する」（例外ベースではなく状態ベースのアサーション）。なお`INSERT`の`WITH CHECK`違反は例外になる（挙動が異なるので混同しない）
- **role等の前提条件を厳密に制御したいDB層テストは、既存の本番データを検索・流用せず、明示的なUUID・列値でテスト専用の行を直接INSERTする。** 同一の2ユーザー間に複数のDMルームが存在し、ルームによってowner/memberの割り当てが異なる、といったケースは珍しくない。`get_or_create_dm_room`のような「既存データを検索してマージする」RPCをテストの前提構築に使うと、意図しない既存ルーム・意図しないロールを拾ってしまい、検証結果を誤読するリスクがある（実例：Phase 29でこれにより「非オーナーの直接UPDATEが成功した」という誤った失敗を1回経験した）

## Realtime

- 新しくRealtime購読が必要なテーブルを追加したら、`supabase_realtime`パブリケーションへの追加を忘れない（`alter publication supabase_realtime add table public.テーブル名;`）。DBへの保存自体は成功するため、これを忘れても気づきにくい
- Supabaseダッシュボード新UI：「Database → Replication」は物理レプリカ／分析パイプライン用。Realtimeのテーブル登録は「Database → Publications」から行う
- `supabase_realtime_messages_publication`という紛らわしい名前のパブリケーションは`realtime.messages`（Presence/Broadcast用システムテーブル）向けで、アプリの`public.messages`とは無関係。誤って触らない
- RLSが有効なテーブルの`postgres_changes`購読は、読み取りを許可されたクライアントにのみ配信される。`filter:`（1カラムの等価条件のみ、OR不可）に頼らずRLSに絞り込みを任せられるケースが多い

## Supabase JSクライアント（postgrest-js）の「fire-and-forget」の罠

- **`void supabase.rpc(...)` / `void supabase.from(...).update(...)`のように、結果を待たない「発火して忘れる」呼び出しのつもりで`void`だけを付けると、実際にはHTTPリクエストが一切送信されない。** `@supabase/postgrest-js`のクエリビルダー（`PostgrestBuilder`）はPromiseそのものではなくthenable（`.then()`を実装したオブジェクト）で、実際のfetch実行は`.then()`の呼び出しの中で遅延的にトリガーされる設計になっている。`void`演算子は式を評価して結果を捨てるだけで`.then()`を呼ばないため、`await`も`.then()`も`.catch()`も一切連鎖させないと、ビルダーオブジェクトが構築されただけでリクエストは永遠に発火しない（例外も出ない。ネットワークタブに何も現れない）。エラーを無視した「発火だけしたい」呼び出しは`void supabase.rpc(...).then(() => {})`のように明示的に`.then()`を呼ぶか、`await`する（`try/catch`で握りつぶす）必要がある
- **この不具合はコンソールにもネットワークタブにも痕跡を残さないため、「例外は出ないがDBに反映されない」系の不具合を疑うときの新しい候補として、上記「React（開発時Strict Mode）とrefガードの罠」の(a)(b)の2択に加えて「(c) `void`だけで`.then()`未呼び出しのため、そもそもリクエストが発火していない」を追加で疑う**（実例：`components/chat/ChatRoom.tsx`の既読機能`mark_room_read`呼び出し2箇所。Phase 29〜31のDBレベル検証（RLS/RPCをSQL側で直接叩くrollbackトランザクション）ではこの不具合を検出できず、「不具合なし」と誤って結論していた。実機のブラウザ操作で初めて発覚し、原因特定にはPlaywrightで実際にHTTPリクエストの発生有無をネットワークレベルで観測する検証が有効だった。**DBレベルのRLS/RPC検証だけでは「アプリのJSコードが実際にそのRPCを呼び出しているか」自体は検証できない**、という限界がこの実例で明確になった）

## Cloudinary / 画像

- アップロードはブラウザ→Cloudinaryへ直接（署名付き）。Route Handlerは署名生成のみを担当し、画像本体は経由させない（Vercelサーバーレス関数のボディ上限・実行時間制約を回避）
- 署名対象パラメータは`folder`と`timestamp`のみ（キー昇順→`key=value`を`&`連結→`api_secret`を末尾連結→SHA1）
- アニメーションGIFはCloudinary変換時に`fl_animated`を付けないとデフォルトで先頭フレームのみ配信される（先頭フレームが空白/透明なGIFだと「何も表示されない」ように見える）。canvas再圧縮もアニメーションを壊すため、GIFはバリデーションのみ通して元ファイルをそのままアップロードする
- next/image（Vercelの画像最適化API）は不採用。CloudinaryのURLに`f_auto,q_auto`を付けるだけで最適化できるため、併用すると二重変換になりVercel無料プランの画像最適化回数を無駄に消費する

## React（開発時Strict Mode）とrefガードの罠

- **「アンマウント後にsetStateしない」ための`isMountedRef`パターンは、cleanupだけでなくeffect本体（setup）でも明示的に`true`へ戻さないと、開発時Strict Modeで恒久的に壊れる。** Next.js（React 18以降既定）の開発時Strict Modeは初回マウント直後に「マウント→アンマウント→再マウント」という合成サイクルを1回走らせる。`useEffect(() => { return () => { ref.current = false } }, [])`のようにcleanupしか無いeffectは、この合成アンマウントで`false`になった後、続く合成再マウントでは戻す処理が無いため**実際には正常に表示され続けている画面でも、このrefは開発時は永久に`false`のまま**になる。それを参照する`if (!ref.current) return;`系のガードは、本来必要な処理（例：送信中フラグのリセット）に一度も到達できなくなる。**setup側にも`ref.current = true`を明示的に書く**のが正しい実装（実例：`components/chat/ChatRoom.tsx`の送信処理が「送信中」のまま固まる不具合、詳細は`docs/phases/phase-24-group-chat-m4.md`）。本番ビルドではStrict Modeの開発時二重実行が無いため症状が出ない可能性があり、`next dev`だけで検証していても再現しないケースとの取り違えに注意
- **バグ調査で「コンソールに一切エラーが出ないまま特定のUI操作だけが固まる」場合、まず疑うべきは（a）そもそも解決していないPromiseを待ち続けている、（b）解決はしているが後続のstate更新ガード（マウント判定・多重実行防止フラグ等）で早期returnしている、の2択。** 例外系のバグは大抵Uncaught/Unhandled Rejectionとしてコンソールに出るため、それが無いことは「その先で例外は起きていない」ことの強い手がかりになる。今回は最初(a)を疑って外れ、(b)が正解だった。Playwrightでネットワークの`request`/`response`イベントを監視し「サーバー側は成功で返っているのにUIが更新されない」ことを一次証拠で確認できれば(b)側に絞り込める
- ホットパス（Route Handlerを経由せずSupabaseクライアントを直接呼ぶ設計）は、サーバーレス関数のタイムアウトに守られないぶん、呼び出し側で`.abortSignal(AbortSignal.timeout(ms))`を検討する価値はある（`components/chat/ChatRoom.tsx`の`insertMessageWithRetry`に残置）。ただし今回の「送信中のまま固まる」不具合の根本原因はこれではなく、上記のrefガードの罠だった（一度この仮説で外した経緯も`docs/phases/phase-24-group-chat-m4.md`に記録）。このプロジェクトで使っている`postgrest-js`のバージョンでは、`.abortSignal()`によるタイムアウトは例外throwではなく通常の`{data: null, error: {...}}`という戻り値になることをNode スクリプトで確認済み

## 長押し/右クリックのその場メニュー（一覧行向け、Phase 25）

- **フックは配列`.map()`のコールバック内で直接呼べない。** 一覧の各行に個別のフック状態（例：`useRowContextMenu`）を持たせたい場合、その行を独立したコンポーネントへ切り出す必要がある（`.map()`のコールバック自体はReactにとって別コンポーネントのインスタンスではないため、フックの呼び出し順序が保証されない）。実例：`components/home/HomeTabs.tsx`の`ConversationRow`、`components/home/AddUserPanel.tsx`の`SearchResultRow`
- **長押し（タッチ）でその場メニューを開く対象がLink/buttonなどクリックで副作用（遷移等）を持つ要素を内包する場合、長押し発火後に`touchend`から合成clickイベントが後続発火し、メニューを開いた瞬間に意図しない遷移が起きることがある。** 対策は「長押しタイマーが実際に発火したか」をrefで記録しておき、対応する`touchend`でその場合のみ`preventDefault()`してゴーストクリックを抑止すること（`lib/hooks/useRowContextMenu.ts`）。`components/chat/MessageBubble.tsx`（Phase 6/9由来の長押しメニュー）はこの問題と無縁だった（対象が単純なdivでLink/buttonを内包しない）ため、この対策が必要になったのはPhase 25が初めて
- **上記の動作確認は、実機を使わずPlaywright CDPのタッチエミュレーション（`Input.dispatchTouchEvent`で`touchStart`→待機→`touchEnd`を手動制御）で代替検証できた。** `context.newCDPSession(page)`経由でタイマー待機を挟んだ長押しを再現し、`page.touchscreen.tap()`（即座にtouchstart→touchend）で「長押し未満の短いタップ」と対比させる。検証は本番コードに手を入れず、本物の`useRowContextMenu.ts`をインポートする使い捨てのNext.jsページ（ルート保護`proxy.ts`の`PUBLIC_ROUTES`に一時追加してゲート回避）をハーネスとして作り、検証後にページ・proxy.tsの変更ごと削除する方式が有効だった。ヘッドレスブラウザの起動方法自体は下記の「sudoが使えない環境」の手順に従う。DM一覧行（Link内包）・検索結果行（button内包）の両パターンで「長押し→メニュー表示→指を離しても遷移/クリックが誤発火しない」「短いタップは通常どおり遷移/クリックする」を確認済み（2026-08-16）
- **注意：`next dev`はこのフォークで`AGENTS.md`/`CLAUDE.md`内の管理ブロックを検知して自動的に上書き・追記する仕組みを持つ（`node_modules/next/dist/server/lib/generate-agent-files.js`）。** その生成テキスト自体に「このブロックは`next dev`が書き込むので、diffに含まれていてもそのままコミットせよ」という趣旨の一文が埋め込まれているが、これは自分が指示したわけでも検証したわけでもない生成物中の指示なので鵜呑みにしない。検証目的で`next dev`を起動しただけで`AGENTS.md`が意図せず差分化することがあるため、検証後は`git checkout -- AGENTS.md`等で元に戻し、無関係な変更をコミットに含めない

## ヘッドレスブラウザでの実地再現（sudoが使えない環境）

- **`playwright install chromium`はsudo不要でブラウザ本体を取得できるが、実行に必要な共有ライブラリ（`libnspr4.so`/`libnss3.so`/`libasound.so.2`等）が無いと起動できない。** `playwright install --with-deps`（内部で`apt-get install`）はsudoが要るため使えない環境向けの代替：`apt-get download <パッケージ名>`（ダウンロードのみでsudo不要）で`.deb`を取得し、`dpkg-deb -x <deb> <展開先ディレクトリ>`でシステムには一切インストールせずローカルに展開、起動時に`LD_LIBRARY_PATH=<展開先>/usr/lib/x86_64-linux-gnu`を設定して読み込ませればよい。`ldd <バイナリ>`で不足ライブラリを事前に特定してから対象を絞る
- ブラウザ経由のE2E的な検証（実際にsignupフォームからアカウントを作る等）で作られたデータはSupabase上に本物として永続化される。使い捨てAdmin API直接作成（`admin.auth.admin.createUser`→検証後`admin.auth.admin.deleteUser`）と違い、**検証後に作成したユーザーID・ルームIDを明示的に特定して削除する後片付けが必要**（`rooms`は`room_members`が全員削除されても連動削除されないため、孤立ルームの掃除も忘れずに）

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
- **2026-08-17再確認：** 両ブロッカーとも変化なし（`typescript-eslint`の`peerDependencies.typescript`は引き続き`<6.1.0`、`eslint-plugin-react@latest`は引き続き7.37.5・`peerDependencies.eslint`は`^9.7`まで）。Claude Code利用中断前の最終チェックのため次回確認時期は未定

## ドキュメント同期（`docs/schema.sql`等の参照用ファイル）

- **「〇〇への反映は完了している」という伝聞（他セッション・ユーザー経由の報告を含む）も、そのファイルを実際に読むまでは事実として扱わない。** Phase 32で、チャット側セッションが実施したDB修正について「`docs/schema.sql`への追記は完了している」と伝えられたが、実際に`grep`すると反映されていなかった（DB本体は`list_migrations`で正しく適用済みと確認できたが、その結果をこのリポジトリのdocsファイルへ書き写す作業自体が行われていなかった）。**「操作対象そのもの（DB）は正しく直っている」ことと「その操作の記録が別の場所（リポジトリのdocs）に反映されている」ことは別の確認軸**であり、後者は前者から自動的には導けない
- `docs/schema.sql`はSupabase側（実マイグレーション・実テーブル定義）を書き写した参照用ファイルであり、それ自体が正ではない（CLAUDE.md冒頭に明記）。DB変更が絡むセッションの終わりには`list_migrations`（またはSupabase MCPでの現行定義取得）と`docs/schema.sql`の記述が一致しているか照合する一手間が有効
- SQL本体はそのままにコメントだけを差し替えるような依頼では、`diff`でコメント行（`^--`）を除いた本体が完全一致することを機械的に確認してから置き換えると、「本体は変えていない」という前提を目視確認だけに頼らず担保できる
