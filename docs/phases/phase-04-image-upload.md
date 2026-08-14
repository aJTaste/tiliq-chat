## Phase 4 の実装内容・詳細

SRS FR-7/FR-8、3.5「画像データ」準拠。画像送信・閲覧機能を実装。

### 追加ファイル

- `lib/cloudinary/sign.ts` — Cloudinary署名付きアップロード用のシグネチャ生成（`node:crypto`のSHA1）。サーバー専用
- `app/api/cloudinary/sign/route.ts` — 署名発行のRoute Handler（POST）。ログイン確認＋対象ルームのメンバーシップ確認（`is_room_member` RPC）を行ってから、`timestamp`/`folder`に対する署名を返す
- `lib/cloudinary/upload.ts` — クライアント側から署名を取得し、Cloudinaryへ直接（Route Handlerを経由せず）アップロードする関数
- `lib/cloudinary/url.ts` — 表示用に`f_auto,q_auto,w_{width}`変換をCloudinaryのURLへ差し込むヘルパー
- `lib/images/compress.ts` — 送信前のバリデーション（形式・5MB上限）とcanvasベースのリサイズ・再圧縮
- `components/chat/ChatRoom.tsx` — 画像添付ボタン・プレビュー・アップロード状態表示・送信フローを追加（既存の完全なファイルを更新）
- `components/chat/MessageBubble.tsx` — 画像表示を`buildChatImageUrl`経由のCloudinary最適化URLに変更（既存の完全なファイルを更新）

### 設計判断・学び

- **アップロードはブラウザ→Cloudinaryへ直接（署名付き）。** Route Handlerは`CLOUDINARY_API_SECRET`を使う署名生成のみを担当し、画像本体はRoute Handlerを経由させない。理由：Vercelのサーバーレス関数にバイナリを中継させるとリクエストボディ上限・実行時間の制約に引っかかりやすく、無料プラン運用（SRS 2.5）と相性が悪いため。「Route Handlerは認証・特権操作専用」という既存原則にも合致する
- **署名対象パラメータは`folder`と`timestamp`のみ。** Cloudinaryの署名アルゴリズム（キー昇順ソート→`key=value`を`&`連結→`api_secret`を末尾に連結→SHA1）に準拠。`api_key`・ファイル本体は署名対象に含めない
- **フォルダは`tiliqua/rooms/{roomId}`単位。** 将来のFuture Extensions「Cloudinary画像の孤立ファイル削除バッチ」で、ルーム削除時にフォルダごと削除しやすくするため
- **署名発行時にルームメンバーシップを確認する多層防御。** 実際のメッセージINSERT自体はDB側RLS（`messages_insert_member_not_blocked`）で保護されているが、フォルダパスの正当性のためRoute Handler側でも`is_room_member` RPCを呼んでいる
- **next/image（Vercelの画像最適化API）は採用しなかった。** CloudinaryのURLに`f_auto,q_auto`を付与するだけで形式・画質の最適化ができるため、next/imageを併用すると同じ画像を二重に変換することになり、Vercel無料プランの画像最適化回数（月間上限あり）を無駄に消費してしまう。そのため配信は素の`<img>`のままとし、`lib/cloudinary/url.ts`でURLベースの変換だけを行う方針にした
- **GIFはcanvas再圧縮をスキップ。** canvas経由で再エンコードするとアニメーションが失われ1コマの静止画になってしまうため、GIFのみバリデーション（5MB上限・形式）だけ通して元ファイルをそのままアップロードする
- **アップロード進捗は%表示ではなく状態文言のみ（「画像を処理中...」「アップロード中...」）。** `fetch`ベースでシンプルに実装し、進捗%が必要になった場合はXHR（`upload.onprogress`）への切り替えを検討する
- **画像アップロード失敗時は自動リトライせず、選択中のファイル・本文をどちらも保持したまま手動再送信できるようにした。** SRS 3.4「画像アップロード失敗時は失敗メッセージを表示し、再送信を促す」に対応。テキストのみの送信失敗時の自動リトライ（最大3回）はSRS 3.4に別途記載があるが、Phase 4のスコープ外として未実装のまま（持ち越し事項に記載）
- **Route Handlerのシグネチャ自体はNext.js 16でも不変であることを実物のドキュメント（`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`）で確認済み。** `app/api/cloudinary/sign/route.ts`に動的セグメントは無いため、`params`のPromise化も関係ない

### 実機テストで見つかったバグと修正（Phase 4完了後）

1. **GIFが送受信できない（表示が空に見える）**
   原因：`lib/cloudinary/url.ts`の表示用変換で、全画像に`f_auto,q_auto,w_{width}`を一律適用していた。Cloudinaryはアニメーション画像に変換をかける際、`fl_animated`フラグを付けない限り**デフォルトで先頭フレームのみ**を配信する仕様があり、多くのGIFは先頭フレームが空白/透明であることが多いため「何も表示されない」ように見えていた。
   修正：URLが`.gif`で終わる場合のみ`f_auto,fl_animated,q_auto,w_{width}`を適用するよう`buildChatImageUrl`を変更。

2. **新着メッセージ受信時、画面が最新の状態までスクロールされない（少し上で止まる）**
   原因：`setMessages(...)`の直後に同期で`bottomRef.current?.scrollIntoView()`を呼んでいたが、Reactの状態更新はDOMへの反映が次のコミットまで非同期のため、その時点ではまだ新しいメッセージがDOMに挿入されていなかった。
   修正：`pendingScrollToBottomRef`（bool）を新設し、実際のスクロールは`messages`の更新を検知する`useLayoutEffect`側（＝DOMへのコミット後）で行うことで、常に正しい最下部へ届くようにした。

3. **過去メッセージを読んでいる最中でも、新着メッセージが来ると強制的に最下部へスクロールされてしまう**
   対応：`isScrolledNearBottom()`を追加し、Realtime受信時のみ、新メッセージがDOMに追加される前の時点でこの判定を行い、最下部付近にいた場合だけ`pendingScrollToBottomRef`を立てるようにした。自分がメッセージを送信したときは、閲覧中のスクロール位置に関わらず常に最下部へ移動する（意図的な非対称設計）。

### 未対応・持ち越し事項（Phase 4時点）

- サインアップ画面（`app/signup/page.tsx`）のアバターアップロードは今回は対応せず。必要になったタイミングで`lib/cloudinary`の署名フローを流用して追加する
- アップロード進捗の%表示（現状は状態文言のみ）
- テキスト送信失敗時の自動リトライ（SRS 3.4、最大3回）は未実装
- 画像のみのメッセージに対する`MessageHidden`（非表示）・削除機能はPhase 6で対応予定

