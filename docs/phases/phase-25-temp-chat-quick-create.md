## Phase 25 の実装内容・詳細

`docs/backlog.md`の実機フィードバック由来の小粒課題「チャット画面から（サイドバーを経由せず）その場でスムーズに一時チャットを作成できるようにしたい」にユーザーからの直接指示で着手。ユーザーからの要求は主機能（チャット画面からその場でDM相手との一時チャットを作成できるようにする）に加え、以下4点の付随要件を含んでいた：

1. 既存の通常DMとは別で一時チャットを作成できるようにする（何個でも）
2. サイドバー「一覧」タブの絞り込みに「一時チャット」を追加する
3. 「すべて」等で通常DMと一時チャットが混合しているとき明確に区別できるようにする（ただし通常DMの見た目は変えない）
4. ユーザー一覧（サイドバー「一覧」タブの会話行・「検索」タブの検索結果行の両方 — ユーザーに確認済み）で右クリック/長押しした際にその場にメニューを表示し、そこからも一時チャットを作成できるようにする

### 発見：要件1は実装するまでもなく既にDB層でサポートされていた

調査の結果、`create_temp_dm_room` RPC（Phase 6）は元々既存DM/既存一時チャットとのマージを一切行わない設計（常に新規roomを作成する）で、`app/actions/rooms.ts`の`startTemporaryDirectMessage`もRPC呼び出し前に既存ルームの有無をチェックしていなかった。「既存DMがある相手だと一時チャットが作成できない」という制約は、**`components/home/CreateTempChatPanel.tsx`（サイドバー「＋」メニュー）だけが持っていたUI層の防御的ガード**（`disabled={Boolean(user.existingRoomId)}`）であり、DB・RPC・Server Actionのいずれにも存在しなかった。そのため要件1はこのガードを1箇所外すだけで完了し、**新規マイグレーションは一切不要**だった。

### 追加ファイル

- `lib/hooks/useRowContextMenu.ts` — 一覧行向けの「右クリック（PC）・長押し（タッチ）でその場にメニューを表示する」ロジックを切り出した汎用フック。既存の`components/chat/MessageBubble.tsx`（FR-16/17、Phase 6/9）が持つ同種のロジック（長押しタイマー・外側クリック/Escapeで閉じる）と同じパターンだが、`MessageBubble.tsx`自体はこのフックへ追従させていない（対象がLinkを含まない単純なdivのため、下記の「長押し後のゴーストクリック抑止」処理が不要で、既存の挙動を変えるリスクを避けた）。新たに、長押し発火後の`touchend`で`preventDefault()`し、長押しでメニューを開いた直後に対象のLink/buttonへ通常タップとして意図せずクリックが後続発火する（＝メニューを開いた瞬間に遷移してしまう）ことを防ぐ処理を追加している（`components/home/HomeTabs.tsx`のDM行が`<Link>`を含むため新たに必要になった）
- `components/home/TempChatDurationField.tsx` — 一時チャットの有効期限選択UI（`<select>`+カスタム入力）を`CreateTempChatPanel.tsx`から切り出した共通コンポーネント。3箇所で同じUIが必要になったため
- `components/home/CreateTempChatWithUserModal.tsx` — 相手が既に確定している状態（チャット画面のオプションメニュー・右クリックメニューから開く）で一時チャットを作成するモーダル。`CreateTempChatPanel.tsx`との違いは相手の検索ステップを持たないことのみ。主機能（要件本体）と要件4の両方から共用する中核コンポーネント
- `docs/phases/phase-25-temp-chat-quick-create.md` — このファイル

### 変更ファイル

- `components/home/CreateTempChatPanel.tsx` — 要件1：`disabled={Boolean(user.existingRoomId)}`ガードと選択時の早期returnを撤廃（既存DM相手も選択可能に）。`existingRoomId`バッジ自体は「参考情報」として残置。有効期限選択UIを`TempChatDurationField`へ差し替え
- `components/chat/ChatRoomOptionsMenu.tsx` / `components/chat/ChatRoom.tsx` — 主機能：DMの場合のみメニューに「一時チャットを作成」を追加。`onOpenMembers`（Phase 21）と同じ「モーダルの実体は親のChatRoom.tsxが持つ」設計を踏襲し、`onOpenTempChat`コールバックを新設
- `components/home/HomeTabs.tsx` — 要件2：`TabKey`に`"temp"`を追加（`isTemporary=true`のDMのみを対象。グループには一時の概念が無いため対象外）。要件3：既存の`ConversationRow`の`isTemporary`バッジがそのまま要件を満たしていたため変更不要（通常DMの見た目は無変更のまま）。要件4：`ConversationRow`に`useRowContextMenu`を使った右クリック/長押しメニュー（常時は隠れたケバブボタンを併設。`MessageBubble.tsx`のSRS 3.3キーボード対応と同じ考え方）を追加し、「一時チャットを作成」を選ぶと`CreateTempChatWithUserModal`を開く。対象ユーザーの状態は行ごとではなく`HomeTabs`本体で一元管理（複数行で同時にモーダルが開くのを防ぐため）
- `components/home/AddUserPanel.tsx` — 要件4：検索結果の各行を`SearchResultRow`という独立コンポーネントへ切り出した上で同様の右クリック/長押しメニューを追加（`useRowContextMenu`はフックのため配列`.map()`のコールバック内では直接呼べず、独立コンポーネント化が必須だった。`HomeTabs.tsx`の`ConversationRow`が既にこの形だったため同じ理由・同じパターンを踏襲）

### DB変更

なし（上記の通り、既存のRPC・RLSがそのまま要件を満たしていた）。

### 設計判断・学び

- **「既存◯◯がある場合はブロックする」という防御的ガードを見つけたら、それが本当にDB/RPC層の制約を反映したものか、それともUI層だけが独自に持つ保守的な判断かを先に切り分ける。** 今回のケースは後者で、コメント（「重複ルーム防止のガードとして選択不可にする」）を読むと一見DB制約の反映に見えるが、実際に`create_temp_dm_room`の実装を確認するとマージ処理自体が存在しなかった。この切り分けを飛ばしていたら、不要な新規RPC設計に着手していた可能性がある
- **一覧行に「右クリック/長押しのその場メニュー」を追加する際、対象がLink/buttonなどクリックで副作用を持つ要素を内包する場合は、長押し発火後のゴーストクリック（touchendに続いて発火する合成clickイベント）に注意が必要。** `MessageBubble.tsx`はこの問題と無縁だった（対象が単純なdiv）ため、今回`HomeTabs.tsx`のDM行（`<Link>`を内包）で初めて顕在化した。標準的な対策（長押し発火をrefで記録し、対応する`touchend`で`preventDefault()`）を`useRowContextMenu`に実装したが、**実機のタッチデバイスでの検証はこの環境では行えていない**（後述）
- **フックはReactコンポーネントの中でのみ呼べる（配列`.map()`のコールバック自体はコンポーネントとして扱われない）ため、一覧の各行に個別のフック状態（今回は`useRowContextMenu`）を持たせたい場合は、行を独立したコンポーネントへ切り出す必要がある。** `AddUserPanel.tsx`の検索結果行はこれまでインラインJSXで済んでいたが、今回`SearchResultRow`として初めて独立コンポーネント化した
- 一時チャットの「何個でも作成できる」という要件は、`rooms`/`room_members`のスキーマ上（`room_members`の一意制約は`(room_id, user_id)`のみで`(user_a, user_b)`ペアへの制約は存在しない）既に無制限に許容されていたため、DB設計面での変更・検証は不要だった

### 検証方法・実施内容

- `npx tsc --noEmit`（エラー0件）
- `npx eslint components/home components/chat lib/hooks`（エラー0件）
- `npm run build`（`next build`、成功）
- Supabase側の変更が無いため`get_advisors`等のDB検証は実施していない

### 動作確認してほしい項目（実機確認待ち）

- モバイル実機での長押し操作：DM一覧行・検索結果行それぞれで長押しするとメニューが正しく開き、指を離した際に意図しない画面遷移（DM一覧行の場合は`/chat/[roomId]`への遷移）が発生しないこと（上記の「ゴーストクリック抑止」の実地検証。この環境ではPlaywrightのタッチエミュレーションでの検証を省略している）
- チャット画面（DM）のオプションメニュー→「一時チャットを作成」→有効期限選択→作成、で新しい一時チャットルームへ正しく遷移すること
- サイドバー「一覧」タブに追加した「一時チャット」フィルタが正しく絞り込まれること
- 既にDMがある相手に対して、右クリック/長押しメニューまたはサイドバー「＋」メニューから一時チャットを追加作成でき、複数の一時チャットが同一相手との間で共存できること

### 未対応・持ち越し事項（Phase 25時点）

- `docs/srs.md` 3.2.1節に残る「検索タブは独立実装せず」という注記と実装（Phase 23で検索タブを新設済み）の乖離は、Phase 25でも未対応のまま（`docs/backlog.md`に既存の持ち越し項目として記載済み）
- 長押し操作のモバイル実機/タッチエミュレーションでの検証は次回以降に持ち越し
