## Phase 6 の実装内容・詳細

SRS FR-10、FR-16〜FR-21、3.7（一時チャット）、3.8（追加認証）準拠。メッセージ削除・非表示、追加認証（PIN/キー）、一時チャットを実装。

### 設計判断・学び（実装前の深掘りで確定した内容）

- **「各チャットに鍵をかける」(FR-20) はアカウント単位の単一シークレット＋部屋ごとの個人用トグルで実装した。** `docs/srs.md`のデータモデルには`rooms.lock_type/lock_secret`という部屋単位の共有シークレットも定義されているが、①現行RLS（`rooms_update_owner`はDM作成者=ownerのみ更新可）ではDM相手が自分の意思で鍵をかけられない、②5回失敗ロックの追跡列が`rooms`側に無い、という実装上の矛盾があった。ユーザーに確認した結果、意図は「端末を他人に貸したときの覗き見防止。アカウントにつき1つのPIN/キーで、見たくないチャット（または全部）に自分のアカウントからのみ鍵をかける。相手には影響しない」という個人・端末防御の脅威モデルだったため、新設した`room_members.auth_required`（自分の行のみ）で「このチャットに認証を要求するか」をトグルし、シークレット自体は既存の`user_settings.auth_type/auth_secret`（1ユーザー1つ）を使い回す設計にした。**`rooms.lock_type/lock_secret`列は未使用のまま据え置いている。** `docs/srs.md`データモデルとの乖離が生じているため、本文更新の要否は次回判断
- **`room_members.auth_required`の更新は専用RPC（`set_room_auth_required`）経由にした。** `room_members_update_owner`のRLSがowner限定のため、これを緩めて「自分の行なら誰でも更新可」にするとrole列も書き換え可能になってしまう（owner昇格などの拡大）。RLSは変更せず、SECURITY DEFINER関数内で「呼び出し者自身の行のauth_requiredのみ」に限定して更新する既存パターンを踏襲した
- **削除バッチはpg_cron + SQL関数のみで実装（Edge Functions・Vercel Cronは不採用）。** `docs/srs.md:126`「無料プランでの運用を前提とする」に基づく判断。Vercel Cron Jobsは10分間隔・10分以内削除完了というSRS 3.7の要件を満たすには最低Vercel Proプランが必要（Hobbyは1日1回まで）なため、Supabase無料プランのままpg_cron拡張を有効化し、`cleanup_expired_temp_chats()`をDB内で10分毎に直接実行する方式にした。新しいデプロイ経路が増えない利点もある
- **認証ゲート（起動時・各チャット・非表示一覧）はクライアント側`sessionStorage`でタブセッション単位の解錠状態を管理する。** 借りた端末での覗き見防止という脅威モデル（認証済みAPI呼び出しへの防御ではない）に対して相応の実装とした。DB側にセッション状態は持たない
- **ゲートが有効な場合、Server Component（`app/home/page.tsx`・`app/chat/[roomId]/page.tsx`）は保護対象コンテンツ（会話一覧・相手のプロフィール・メッセージ本体）を事前取得しない設計にした。** sessionStorageはクライアントのみで分からないため、Server ComponentがAuthGateの解錠状態を待たずに無条件でデータをRSCペイロードに含めてしまうと、画面上はゲートで隠れていてもHTML/RSCペイロード自体には解錠前のデータが載ってしまう。これを避けるため、ゲートが有効な場合は`HomeContent`/`GatedChatRoomLoader`という新規Client Componentが、AuthGate解錠後に`lib/supabase/client.ts`経由でブラウザから直接データ取得する経路に分岐させている（ゲート無効時は従来通りServer Componentが事前取得する高速経路のまま）
- **起動時ゲートは`/home`と`/chat/[roomId]`の2箇所に個別実装した。** これらを束ねる共有レイアウト（ルートグループ）が無いため、直接URLで`/chat/[roomId]`に来た場合もバイパスされないよう両方に`AuthGate`を置いている。将来ルートが増えた際は`app/(protected)/layout.tsx`のような統合を検討
- **ロック解除フロー（5回失敗後）はアカウントのパスワードで再認証する方式にした。** `lib/supabase/admin.ts`のservice_roleクライアントを都度使い捨てで生成し`signInWithPassword`によりパスワードのみ検証する（`persistSession: false`のため既存のログインセッションには影響しない）。解除後はPIN/キーを覚えていない場合に備え、設定画面へのリンクを表示している
- **ハッシュ化には`bcryptjs`を採用。** pure JSでNode.jsランタイムのServer Action内のみで完結し、Vercel無料プランと相性が良い
- **PostgRESTの重要な落とし穴を発見：`revoke execute ... from public`だけではRPCへの`anon`（未認証）ロールからの直接実行を防げない。** Supabaseはスキーマのデフォルト権限（`ALTER DEFAULT PRIVILEGES`）により、新規作成した関数へ`anon`のEXECUTE権限を自動付与するため、`public`ロールからのrevokeとは別に`anon`へも明示的にrevokeする必要がある（`has_function_privilege('anon', ...)`で実測して発覚）。Phase 6で新規追加した認証系RPC（`record_auth_attempt`・`set_room_auth_required`・`create_temp_dm_room`・`cleanup_expired_temp_chats`）は`anon`から明示的にrevokeして対応済み。**この事象はPhase 1〜5の既存RPC（`block_user`・`get_or_create_dm_room`・`is_room_member`等）にも共通して存在することを確認済み**（各関数内で`auth.uid() is null`をチェックしているため実害は無いが、「authenticated限定」という意図とは一致していない）。Phase 6のスコープ外のため未対応。まとめて棚卸しする場合は別途対応を検討
- **`get_conversation_list`の戻り値に`is_temporary`/`expires_at`を追加する際、`create or replace function`ではなく`drop function` → `create function`が必要だった。** Postgresは戻り値の列構成（`returns table`）を変更する`create or replace`を拒否するため
- **実機テストで発覚：メッセージ削除（FR-16）を直接のテーブルUPDATE（`messages_update_own_delete_only`ポリシー経由）で実装したところ、常に「メッセージの削除に失敗しました。」となる不具合があった。** 原因はPostgreSQLのRLS仕様：UPDATE時、更新ポリシー自身の`WITH CHECK`（`sender_id = auth.uid()`）を満たしていても、PostgreSQLは**更新後の新しい行がSELECTポリシーからも見える状態であること**を暗黙的に要求する。`messages_select_member_not_deleted`は`deleted_at is null`を要求するため、「`deleted_at`を設定して見えなくする」という論理削除の目的そのものがこの暗黙チェックと構造的に衝突し、原理的に直接UPDATEでは実現できないことが判明した（`begin; set local role authenticated; set local request.jwt.claims ...; update ...; rollback;`で実際にシミュレートして再現・特定）。対応として新規RPC `delete_own_message`（SECURITY DEFINER）を追加し、関数内で明示的に`sender_id = auth.uid()`を確認する方式に変更した。**この種の「SELECTポリシーの条件を書き換えるUPDATE（ソフトデリート等）」は直接のテーブルUPDATEでは実現できないという制約は、今後同様のパターン（例：非表示化条件を追加する場合等）を実装する際にも当てはまるため、要注意。**

### 追加ファイル

- `app/actions/messages.ts` — `deleteMessage`（論理削除・FR-16）/ `hideMessage` / `unhideMessage`（FR-17/18）
- `app/actions/auth-secret.ts` — `setAuthSecret` / `clearAuthSecret` / `verifyAuthSecret` / `unlockAuthWithPassword`（FR-19、3.8）
- `components/auth/AuthGate.tsx` — 3スコープ（起動時・各チャット・非表示一覧）共通の認証ゲート
- `app/settings/page.tsx` + `components/settings/AuthSettingsForm.tsx` — PIN/キー設定・起動時/非表示一覧スコープのトグル（CLAUDE.md「次にやること（Phase 6）」で予告していたチャット設定画面の土台）
- `components/home/HomeContent.tsx` — 起動時ゲート有効時の会話一覧クライアント側取得経路
- `components/chat/GatedChatRoomLoader.tsx` — 各チャットゲート有効時のメッセージ本体クライアント側取得経路
- `app/chat/[roomId]/hidden/page.tsx` + `components/chat/HiddenMessagesList.tsx` — 非表示メッセージ一覧（FR-18）
- `components/chat/ChatRoomOptionsMenu.tsx` — チャットオプションメニュー（非表示一覧への導線、各チャットの鍵トグル、一時チャットの「閉じる」）

### 変更ファイル

- `components/chat/ChatRoom.tsx` — RealtimeにUPDATE購読を追加（相手の削除が自分の画面にも反映される）、非表示IDでのフィルタ、削除/非表示ハンドラ、`ChatRoomOptionsMenu`を追加
- `components/chat/MessageBubble.tsx` — 長押し（タッチ）/右クリック（PC）での削除・非表示メニューを追加
- `app/home/page.tsx` / `app/chat/[roomId]/page.tsx` — 起動時ゲート・各チャットゲートの判定・分岐を追加
- `app/actions/rooms.ts` — `toggleRoomAuthRequired` / `closeTempChat` / `startTemporaryDirectMessage`を追加
- `app/actions/settings.ts` — `updateAuthScopeLaunch` / `updateAuthScopeHiddenList`を追加
- `components/home/AddUserPanel.tsx` — 検索結果の「メッセージ」ボタンに有効期限セレクター（通常/10分/1時間/24時間/7日/カスタム）を追加
- `components/home/HomeTabs.tsx` — 一時チャットの残り時間バッジを追加
- `types/supabase.ts` — Supabase MCPの`generate_typescript_types`で再生成（Phase 6のRPC・列を反映）

### DB変更（`docs/schema.sql`に追記済み。実際の適用はSupabase MCP `apply_migration`）

| マイグレーション名                       | 内容                                                                                                    |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `phase6_auth_foundation`                  | `room_members.auth_required`列、`record_auth_attempt`/`set_room_auth_required` RPC                        |
| `phase6_temp_chat_creation`               | `get_conversation_list`の戻り値拡張（`is_temporary`/`expires_at`）、`create_temp_dm_room` RPC              |
| `phase6_temp_chat_cleanup_batch`          | pg_cron拡張有効化、`temp_chat_cleanup_log`テーブル、`cleanup_expired_temp_chats`関数、`cron.schedule`登録  |
| `phase6_cleanup_revoke_anon`              | `cleanup_expired_temp_chats`から`anon`のEXECUTE権限を明示的に剥奪                                          |
| `phase6_revoke_anon_from_new_rpcs`        | 上記3件の新規RPCから`anon`のEXECUTE権限を明示的に剥奪                                                      |
| `phase6_delete_own_message_rpc`           | 実機テストで発覚した不具合の修正。`delete_own_message` RPCを新規追加し、`deleteMessage`アクションを直接UPDATEからRPC呼び出しに変更（詳細は上記「設計判断・学び」参照）|

pg_cronジョブ`cleanup-temp-chats`は`*/10 * * * *`（10分毎）で登録済み・`active: true`を確認済み。

### 動作確認してほしい項目（実機確認用チェックリスト）

1. 自分のメッセージを長押し/右クリック→「削除」→送信者・相手どちらの画面からも消えること（相手側はRealtimeで反映）
2. 相手のメッセージを長押し/右クリック→「非表示」→自分の画面のみ消え、相手には見えたままであること
3. チャットオプション→「非表示メッセージ一覧」から復元できること。復元後チャット画面に再表示されること
4. 設定画面（ホーム右上「設定」）でPINまたはキーを設定→「起動時」トグルON→タブを再読み込み→PIN入力画面が表示され、正しいPINで解錠できること
5. PINを5回連続で間違える→ロック表示になること→「アカウントのパスワードで解除する」から実際のログインパスワードで解除できること
6. チャットオプション→「このチャットに鍵をかける」ON→そのチャットだけ開く際にPIN入力が必要になること。**別アカウント（DM相手）側の画面には一切影響しないこと**を確認
7. 設定画面で「非表示メッセージ一覧」スコープをON→非表示一覧を開く際にPIN入力が必要になること
8. ユーザー追加パネルの検索結果から「10分」等の有効期限を選んでメッセージを開始→一時チャットとして作成され、ホーム一覧に残り時間バッジが表示されること
9. 短い有効期限（10分等）でテスト用の一時チャットを作成し、10分経過後にpg_cronの実行（最大10分間隔）でルームが実際に削除されることを確認（Supabase側`cron.job_run_details`やテーブルの`select`で確認）
10. チャットオプション→「チャットを閉じる」（一時チャットのみ表示）→自分側の`temp_chat_sessions.closed_at`が設定されること。双方が閉じた場合は次回のバッチ実行で削除されることを確認

### 未対応・持ち越し事項（Phase 6時点）

- `rooms.lock_type/lock_secret`は未使用のまま。`docs/srs.md`データモデルとの乖離があるため、SRS本文の更新要否を次回判断
- Phase 1〜5の既存RPCに残る`anon`実行権限（上記「設計判断・学び」参照）はPhase 6のスコープ外のため未対応。まとめて棚卸しする場合は`/security-review`等での対応を検討
- 起動時ゲートが`/home`・`/chat/[roomId]`の2箇所への個別実装になっている。ルートグループ化による統合はスコープ外
- 既存DMを後から一時チャット化する機能は未実装（SRSに明記が無いため対象外とした）
- グループチャットUI（FR-4）は引き続きPhase未割り当てのまま。`ChatRoomOptionsMenu`・`room_members.auth_required`等はグループチャットにも将来流用できる設計にしてある
- `components/home/AddUserPanel.tsx`（Phase 5実装）に、新しいESLintルール（`react-hooks/set-state-in-effect`）由来の既存エラーが3件ある（Phase 6の変更とは無関係、今回は未対応）

