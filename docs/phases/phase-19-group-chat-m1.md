## Phase 19 の実装内容・詳細

CLAUDE.md「次にやること（Phase 18・未確定）」候補3。Phase 16で詳細設計まで完了していたグループチャットUI（FR-4）のM1（最小スコープ）を実装した。ブロッカーだったナビゲーション刷新（永続サイドバーシェル）はPhase 17で解消済み。ユーザーから「最適だと思う順番で進めてください」との指示を受け、バックログの中で最も準備が整っていた本項目を選んで着手した。

M1のスコープ：グループ作成（検索から複数選択）・グループ一覧表示（ホーム「グループ」タブ）・グループチャット内でのメッセージ送受信（送信者名表示）。メンバー追加・削除・退出・オーナー譲渡等の管理機能、既存DM専用RPC・RLS・`messages_insert_member_not_blocked`ポリシーの変更は明示的にスコープ外。

### スコープ判断（自己決定）

1. **メンバー管理UI（追加・削除・退出）はM1に含めない。** `room_members`のRLSは既にowner/self操作を許容する設計だが、UIを足すと変更範囲が広がるため次回以降の課題とした
2. **グループの最大人数に軽いソフトキャップ（合計50人＝招待49人まで）を設けた。** 要件に明記は無いが、無制限配列を許すのは工学的に不用意（誤操作・軽微なDoS的懸念）なため、`create_group_room`内でチェックする安全側のデフォルトとした
3. **`CreateGroupPanel`は`AddUserPanel`より簡素（フレンド状態バッジなし、チェックボックス+検索のみ）とした。** M1の最小構成として妥当と判断

### DB変更（`docs/schema.sql`に追記済み。実際の適用はSupabase MCP `apply_migration` "phase19_group_room_creation_m1"）

新規RPC関数（既存パターン＝security definerでのアトミックINSERT、`revoke from public`→`grant to authenticated`→`revoke from anon`の三点セットを踏襲）：

| 関数                                            | 用途                                                                                          |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `create_group_room(p_member_ids uuid[], p_name text)` | グループルーム新規作成。作成者以外に2人以上（合計3人以上）を要求し、作成者を含む全メンバー間の総当たりでブロック関係が1組でもあれば拒否する |
| `get_group_conversation_list()`                 | ホーム「グループ」タブ用一覧取得。メンバー数・自分以外の全メンバー表示名配列・直近メッセージを返す |

`types/supabase.ts`をSupabase MCPの`generate_typescript_types`で再生成し、上記2関数の型を反映済み。

### 追加ファイル

- `components/home/CreateGroupPanel.tsx` — グループ作成UI。`search_users` RPCを300msデバウンスで直接呼び出し、チェックボックスで複数選択→グループ名（任意）入力→作成。`AddUserPanel.tsx`と同じ`useTransition`+try/catch+`unstable_rethrow(err)`パターンを踏襲

### 変更ファイル

- `app/actions/rooms.ts` — `createGroupRoom(memberIds, name?)`を追加（`startDirectMessageWithUser`と同じ形：認証確認→バリデーション→RPC呼び出し→エラーマッピング→成功時`redirect`）。`mapGroupError`を新設
- `components/chat/MessageBubble.tsx` — `senderName?: string`を追加。`!isOwn && senderName`の場合のみバブル内に送信者名ラベルを表示
- `components/chat/ChatRoom.tsx` — `otherUser`単数propを`peer: ChatPeer`（`{kind:"dm",...} | {kind:"group",...}`の判別共用体、このファイルからexport）に変更。ブロック機能（DM専用の概念）は`blockGateActive = peer.kind === "dm" && isBlockedByMe`という派生値に置き換え、送信ボタン・画像添付ボタン・テキストエリアのdisabled・placeholderの計4箇所で使用。ヘッダーを`peer.kind`で分岐（グループはグループ名 or メンバー名連結＋人数表示、ブロックボタン無し）。グループの場合のみ`MessageBubble`へ`senderName`を渡す
- `app/(shell)/chat/[roomId]/page.tsx` — `room.is_group`で完全に分岐。グループの場合は`room_members`→`profiles`の2段階クエリで全メンバー名を取得し（`room_members.user_id`は`profiles`への直接FKが無いためPostgRESTのネスト埋め込みが使えず、既存のDM側`otherMember`→`otherProfile`と同じ2段階パターンを踏襲）、`blocks`クエリは省略。`GatedChatRoomLoader`に`isGroup`propを追加
- `components/chat/GatedChatRoomLoader.tsx` — 新規`isGroup`propで`loadGroup()`/`loadDm()`の2関数に分岐。ロジックはpage.tsxのグループ分岐と対称
- `components/home/HomeTabs.tsx` — `ConversationItem`を`{kind:"dm",...} | {kind:"group",...}`の判別共用体に変更。型ガード`isDmConversation`/`isGroupConversation`を新設。「グループ」タブの`disabled`を解除し、固定の「準備中」表示を廃止。新規`GroupConversationRow`（グループ名 or メンバー名連結＋人数バッジ、「解除」ボタンは無し＝M1スコープ外）を追加。検索欄の代わりにグループタブでは「＋ グループを作成」ボタン→`CreateGroupPanel`の開閉を配置
- `app/(shell)/layout.tsx` / `components/shell/GatedShellBody.tsx` — 既存の`Promise.all`バッチに`get_group_conversation_list`を追加し、DM会話に`kind:"dm"`を付与、グループ会話を`kind:"group"`としてマッピングして結合し`HomeTabs`へ渡す（ほぼ同一の機械的変更を両ファイルに適用）

### 設計判断・学び

- **`otherMember`をゲート判定より前の`Promise.all`に含めなかった判断（Phase 18）と同じ考え方で、グループ分岐もゲート判定の後に置いた。** ゲート中ユーザーへの無駄なDB往復を増やさないという既存の重要な性質を壊さないため
- **`room_members.user_id`から`profiles`への直接FKが無いことを実装前に確認し、2段階クエリ（member_ids取得→`profiles.in()`）で対応した。** これは既存のDM側`otherMember`→`otherProfile`パターンと全く同じ制約であり、新しい問題ではない
- **ブロックチェックは「作成者⇔招待メンバー」だけでなく「招待メンバー同士」も含む総当たりにした。** `search_users`は「検索者から見たブロック」しか除外しないため、招待メンバー同士のブロックは作成時点でDB側の`create_group_room`が検出しないと、作成直後に`messages_insert_member_not_blocked`RLSでグループ全体の送信が止まってしまう（Supabase MCPで実際にこのシナリオをトランザクション内でシミュレートし、正しく拒否されることを確認済み）
- **`messages_insert_member_not_blocked`ポリシーは変更していない。** 「room内の他メンバーの誰か1人とでもブロック関係があれば送信不可」という設計のため、グループ作成後に誰か1人をブロックすると全体送信が止まる過剰に強い挙動は既知の制限としてM1では許容する（Phase 16時点から把握済み。見直すならM4以降）
- **`ChatRoom.tsx`の`isBlockedByMe`は当初の想定（Plan agentの初稿）より1箇所多い、計4箇所で使われていた（画像添付ボタンのdisabledが漏れていた）。** 実ファイルを確認してから`blockGateActive`への置き換えを行い、見落としを防いだ
- **`CreateGroupPanel`のエントリポイントは、サイドバー全体を触る新しいスロット追加ではなく、`HomeTabs.tsx`の「グループ」タブ本体内に配置した。** サイドバー内部UI再設計（「＋」新規作成メニュー等）は別のバックログ項目として残っており、M1ではその構想と競合しない最小限の統合にとどめた
- **DB層の動作確認はSupabase MCPの`execute_sql`を使い、`begin; set local role authenticated; set local request.jwt.claims ...;`で実際のユーザーとして`create_group_room`/`get_group_conversation_list`を呼び出し、正常系・異常系（メンバー不足・招待メンバー間ブロック）・RLS（非メンバーには何も見えない）を実際に確認してからロールバック/クリーンアップした。** Phase 6の「RLSの挙動をトランザクション内でシミュレートして検証する」手法をそのまま踏襲した

### 検証方法・実施内容

- `npx tsc --noEmit`（エラー0件）
- `npx eslint .`（エラー0件）
- `rm -rf .next && npm run build`（クリーンビルド成功）
- `get_advisors`（security・performance）を確認：新規追加した2関数は既存の全RPCと同じ`authenticated_security_definer_function_executable`の情報レベル警告のみで、新規の問題は無し
- Supabase MCPの`execute_sql`でDB層を直接検証：
  - 正常系（自分以外2人でグループ作成）→ 成功、`room_members`に owner+member×2 が正しく挿入されることを確認
  - 異常系1（自分以外1人のみ）→ `group requires at least 2 other members`で拒否
  - 異常系2（招待メンバー同士がブロック関係）→ `cannot create group: blocked member pair`で拒否（作成者⇔招待メンバーではなく招待メンバー同士のケースを明示的に検証）
  - `get_group_conversation_list()`→ 自分以外のメンバー名配列・人数が正しく返ることを確認
  - 非メンバーには`rooms`/`room_members`が一切見えないことを確認（既存RLSの継続動作確認）
  - テストデータは全てロールバックまたは明示的な削除でクリーンアップ済み
- 実機での一連のQA（グループ作成〜チャット〜一覧表示のUI操作）はユーザーによる実機確認待ち

### 未対応・持ち越し事項（Phase 19時点）

- メンバー管理UI（追加・削除・退出・オーナー譲渡）はM1スコープ外のまま。次回M-phase候補
- `messages_insert_member_not_blocked`の「誰か1人ブロックで全体送信停止」という過剰に強い挙動は既知の制限として残置（M4以降で見直すか判断）
- サイドバー内部UI再設計（「検索⇄一覧」トグル、「＋」新規作成メニューへのグループ・一時チャット作成統合）は引き続き別のバックログ項目のまま。今回`CreateGroupPanel`はHomeTabsの「グループ」タブ内に暫定配置した
- グループの最大人数（合計50人）はエンジニアリング判断による暫定値。UI上に上限の明示は無い（送信時にサーバーエラーとして拒否されるのみ）

