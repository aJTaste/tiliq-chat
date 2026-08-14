## Phase 14 の実装内容・詳細

CLAUDE.md「次にやること（Phase 14・未確定）」候補のうち、①eslint/typescriptメジャー更新の再挑戦、②テキスト送信失敗時の自動リトライ（SRS 3.4）の2件を実施。①は調査の結果ブロック状況に変化が無く実装不可と判明したため記録のみ、②は実装まで完了した。

### ①eslint/typescriptメジャー更新の再チェック（結果：継続ブロック・コード変更なし）

Phase 12時点の調査結果を`npm view`等で再確認したが、2026-08-12時点で状況は変わっていなかった：

- **typescript 7系**：`typescript-eslint`（最新8.67.0）の`peerDependencies.typescript`は依然`>=4.8.4 <6.1.0`のまま。加えて、解禁の前提となる**TypeScript 7.1自体もまだリリースされていない**（`npm dist-tags`は`latest: 7.0.2`、`next: 7.1.0-dev.*`のdevビルドのみ）。関連issue [typescript-eslint#12518](https://github.com/typescript-eslint/typescript-eslint/issues/12518)はClosed（Not Planned）
- **eslint 10系**：`eslint-config-next`（16.3.0）が同梱する`eslint-plugin-react@7.37.5`の`peerDependencies.eslint`は`^9.7`まで。ESLint 10のRuleContext API変更への対応PR [#3979](https://github.com/jsx-eslint/eslint-plugin-react/pull/3979)は未マージ（issue [#3977](https://github.com/jsx-eslint/eslint-plugin-react/issues/3977)はOpen）。なお`eslint-plugin-react-hooks`は7.1.1で既にESLint 10へ対応済み（ボトルネックは`eslint-plugin-react`単体）
- `package.json`の変更は無し
- **次回再チェック時の監視ポイント**：`eslint-plugin-react`の新バージョン公開（PR #3979マージ後）、TypeScript 7.1の正式リリース＋`typescript-eslint`の対応リリース。次回セッション開始時は引き続き`npm view typescript-eslint peerDependencies`・`npm view eslint-config-next@latest dependencies`で確認するとよい

### ②テキスト送信失敗時の自動リトライ（SRS 3.4）

SRS 3.4「メッセージ送信失敗時はリトライボタンを表示する（最大3回まで自動リトライ後、手動リトライに切り替え）」に対応。変更ファイルは`components/chat/ChatRoom.tsx`のみ。

**実装内容：**

- `sendMessage()`のDBへのinsert部分を、新設の`insertMessageWithRetry(payload)`ヘルパー経由に変更。初回送信+自動リトライ3回＝計4回まで、指数バックオフ（1秒→2秒→4秒）で待機しながら再試行する
- クライアント側で`crypto.randomUUID()`により`id`を1回だけ生成し、同一メッセージに対する全ての試行（自動・手動リトライ問わず）で使い回す（冪等性の担保）
- 自動リトライを使い切っても失敗した場合、失敗ペイロード（`retryPayload` state）を保持し、入力フォーム下に「送信に失敗しました。［再試行］［取り消し］」のバナーを表示する（SRSの「リトライボタン」に相当）。「再試行」は同一`id`で`insertMessageWithRetry`をもう一度実行し、失敗すればバナーはそのまま残る。「取り消し」は保留ペイロードを破棄する
- リトライ対象は**DBへのinsert失敗のみ**。画像アップロード（Cloudinary）失敗時の挙動（Phase 4実装、手動での選び直し・再送信）は変更していない。テキスト＋画像の組み合わせでinsertが失敗した場合も、画像は既にアップロード済みのURLを`payload.image_url`として保持しているため、リトライ時に再アップロードは発生しない

**設計判断・学び：**

- **冪等性の担保が最大の課題だった。** `messages.id`はDB側の`gen_random_uuid()`任せの設計（Phase 1〜13共通）だったため、素朴に「同じ内容でinsertし直す」実装にすると、ネットワークタイムアウト等でクライアントが失敗と誤認したが実際にはDB側でinsertが成功していたケースで、リトライが同一メッセージを複数保存してしまう危険があった。Realtime購読・ローカルstate双方の重複排除ロジック（`ChatRoom.tsx`）は`id`基準のみで、insertの多重発行そのものは防げない構造だったため、対応として**クライアント側で`id`を1回生成して使い回し、一意制約違反（Postgresエラーコード`23505`）を検出したら該当行を`select`で取得して成功扱いにする**方式にした。`types/supabase.ts`の`messages.Insert`型は`id?: string`で上書き可能、`messages_insert_member_not_blocked`のRLSも`id`を制約していないため、型・DB側とも変更不要だった
- **失敗時に入力欄へ本文を書き戻す既存の挙動（`setInputValue(content)`）は廃止し、専用のリトライバナー方式に一本化した。** SRSが「リトライボタンを表示する」と明記している以上、ユーザーに再入力・再送信させる暫定策よりも、失敗した内容をそのまま保持して再試行できる専用UIの方が意図に近いと判断した
- **保留中の失敗ペイロードは新規送信とは独立させ、`sending`とは別state（`retrying`）で管理した。** ある送信が失敗してバナーが表示されている間も、ユーザーはそのまま新しいメッセージを入力・送信できる（`canSend`の条件に`retryPayload`・`retrying`は含めていない）。ただし保留スロットは1つのみのため、2件目の送信も自動リトライを使い切って失敗した場合はバナーが新しい方の失敗内容で上書きされる（同時に2件の失敗を表示するUIは持たない）。この非対称性は許容する既知の制約として記録する
- **リトライ機構と`OfflineBanner.tsx`（`navigator.onLine`監視）は連携させなかった。** オフライン中に自動リトライが数秒×3回無駄打ちすること自体の実害は小さく、連携させるには`navigator.onLine`監視ロジックの共通フック化という一段のリファクタが必要になるため、SRSに連携必須の明記が無いことも踏まえ過剰設計を避けた（このプロジェクト一貫の判断基準）
- **`MessageBubble.tsx`・`lib/errors.ts`は変更していない。** 送信中/失敗中の状態表示はメッセージバブル単位ではなく、既存の`sendError`と同じ「フォーム直下のインラインエリア」に留めた。バブル単位のpending/failed状態を持たせるには`MessageRow`型（DBの行そのもの）にクライアントオンリーの一時状態を混在させる設計変更が必要になり、影響範囲がRealtime受信・重複排除ロジックにまで広がるため、今回は最小スコープに留めた。`lib/errors.ts`の`NETWORK_ERROR_MESSAGE`はServer Action呼び出し失敗用の文言であり、`sendMessage()`は元々Server Actionを経由しない`{data,error}`パターンのままなので、今回も独自のエラー文言体系のままとした
- **アンマウント対策として`isMountedRef`を新設した。** 指数バックオフの待機中（最大7秒）に別ルームへ遷移する等でコンポーネントがアンマウントされた場合に備え、待機後・insert後の両方で`isMountedRef.current`を確認してからのみ`setState`する

**動作確認してほしい項目（実機確認用チェックリスト）：**

1. DevToolsでネットワークをオフラインにしてメッセージを送信 → 自動的に数秒おきに3回まで再試行された後、「送信に失敗しました。［再試行］［取り消し］」バナーが表示されること
2. オンラインに戻して「再試行」を押す → 送信が成功し、通常通りメッセージ一覧に反映され、バナーが消えること
3. 「取り消し」で保留中の失敗メッセージを破棄できること（バナーが消え、以後何も送信されないこと）
4. 通常のオンライン状態でのテキスト送信・画像付き送信が従来通り成功すること（デグレ確認）
5. Cloudinaryアップロード自体が失敗するケースでは、従来通り自動リトライされず、選択中の画像・本文を保持したまま手動での再送信が必要なままであること（スコープ外の確認）
6. 送信失敗バナー表示中に別の新しいメッセージを入力・送信できること（独立して動作することの確認）

### 検証方法・実施内容

- `npx tsc --noEmit`（エラー0件）
- `npx eslint .`（エラー0件）
- `rm -rf .next && npm run build`（クリーンビルド成功）
- 上記「動作確認してほしい項目」はユーザーによる実機確認待ち（開発体制上、UIの動作確認はユーザー担当のため）

### 未対応・持ち越し事項（Phase 14時点）

- 保留中の失敗ペイロードは1件分のスロットのみ（上記「設計判断・学び」参照）。複数の送信失敗を同時にバナー表示する設計は見送った
- eslint（9→10）・typescript（6.0→7系）は引き続きブロック中。次回監視ポイントは上記の通り

