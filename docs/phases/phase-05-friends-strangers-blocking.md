## Phase 5 の実装内容・詳細

SRS FR-11〜FR-13、FR-15、FR-22、FR-23 準拠。フレンド申請・フレンド/ストレンジャー一覧・ユーザー追加・ブロック・知らない人からのDM受信設定を実装。

### DB変更（`docs/schema.sql` に追記済み。実際の適用はSupabase MCP `apply_migration` "phase5_friends_strangers_blocking"）

新規RPC関数（すべて`SECURITY DEFINER` + `REVOKE FROM public` → `GRANT TO authenticated`の既存パターンを踏襲）：

| 関数                                    | 用途                                                                                                |
| --------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `get_conversation_list()`               | フレンド/ストレンジャー一覧用。DMルーム×相手プロフィール×フレンド状態×直近メッセージを1クエリで返す |
| `search_users(p_query text)`            | ユーザー追加UIの検索（username部分一致）。フレンド状態・既存DM roomIdも同時に返す                   |
| `get_friend_requests()`                 | 送受信中・直近拒否のフレンド申請一覧（受信=承認拒否UI、送信=簡易通知用）                            |
| `send_friend_request(p_addressee_id)`   | フレンド申請送信。拒否済みの同方向リクエストは`pending`へ差し戻して再利用                           |
| `respond_to_friend_request(id, accept)` | 受信した申請の承認・拒否                                                                            |
| `cancel_friend_request(id)`             | 自分が送った申請中リクエストの取り消し                                                              |
| `remove_friend(p_other_user_id)`        | フレンド解除                                                                                        |
| `mark_friend_requests_read()`           | 受信申請の既読化（ユーザー追加パネルを開いた時に呼ぶ）                                              |
| `block_user(p_target_id)`               | ブロック登録＋既存フレンド関係の解消                                                                |

既存関数の更新：

- **`get_or_create_dm_room`**：新規DM作成時のみ、フレンド関係が無い場合に相手の`dm_from_stranger_enabled`（FR-22）をチェックし、falseならエラー（`does not accept DMs from strangers`）を返すよう変更。既存DM・フレンド同士は従来通りチェック無し

### 追加ファイル

- `app/actions/friends.ts` — フレンド申請の送信・承認・拒否・取り消し・解除・既読化のServer Actions
- `app/actions/blocks.ts` — ブロック・ブロック解除のServer Actions（解除はRLS `blocks_delete_own` を使い直接テーブル操作、それ以外はRPC経由）
- `app/actions/settings.ts` — `dm_from_stranger_enabled`トグル用Server Action
- `components/home/HomeTabs.tsx` — 「フレンド／ストレンジャー／グループ」タブ（クライアント側で`friendship_status`によりフィルタ）。グループは未実装のためプレースホルダー表示
- `components/home/AddUserPanel.tsx` — ユーザー追加UI（FR-15）。開閉式パネルに検索・フレンド申請送信/承認/拒否/取り消し・簡易ブロックを集約。検索はブラウザから`search_users` RPCを直接呼ぶ（デバウンス300ms）
- `components/home/StrangerDmToggle.tsx` — FR-22のトグル（ホーム画面ヘッダーに暫定配置）

### 変更ファイル

- `app/home/page.tsx` — Phase 3の`fetchRoomList`（N+1気味の複数クエリ、持ち越し事項として記録していたもの）を`get_conversation_list` RPCへ完全に置き換え。`get_friend_requests`・`user_settings.dm_from_stranger_enabled`も並列取得し、`AddUserPanel`・`HomeTabs`・`StrangerDmToggle`へ渡す
- `app/actions/rooms.ts` — `startDirectMessageWithUser(userId)`を追加（検索結果など、既にuser_idが分かっているUIから使う）。エラーメッセージを`mapDmError`でユーザー向け日本語に変換（ストレンジャーDM拒否・ブロックの2パターンを判別）
- `app/chat/[roomId]/page.tsx` — `blocks`テーブルから「自分が相手をブロックしているか」を取得し`ChatRoom`へ`initialIsBlockedByMe`として渡す
- `components/chat/ChatRoom.tsx` — ヘッダーにブロック/ブロック解除ボタンを追加。ブロック中はメッセージ入力・画像添付を無効化
- `types/supabase.ts` — Supabase MCPの`generate_typescript_types`で再生成（Phase 5のRPC関数を反映）

### 削除ファイル

- `components/chat/NewDmForm.tsx` — `AddUserPanel`に統合されたため削除（リポジトリから手動で削除してください）

### 設計判断・学び

- **ホーム画面の「検索」タブは独立させず、ユーザー追加パネル（`AddUserPanel`）に統合した。** SRS 3.2.1では「フレンド・ストレンジャー・グループ・検索」の4タブ構成だが、「検索＝ユーザー追加」と「フレンド申請の管理」は同じ文脈の操作なので1つの開閉パネルにまとめた方が自然と判断。`docs/srs.md`本文の更新は未実施（必要なら次のセッションで反映を検討）
- **グループチャットタブはプレースホルダーのみ。** グループチャットUI（FR-4）はどのPhaseにも未割り当てのままのため、`HomeTabs`にタブ自体は用意しつつ`disabled`にして「準備中」を表示するに留めた
- **フレンド申請の「拒否」は行を削除せず`status='rejected'`のまま残す設計にした。** 削除してしまうと申請者側が拒否されたことを知る手段が無くなる（SRS FR-11の「拒否の結果を申請者に通知」に反する）ため。再申請時は同方向なら既存行を`pending`に差し戻し、逆方向なら新規行を作成する（`unique(requester_id, addressee_id)`制約はタプル単位のため衝突しない）
- **ブロック時に既存のフレンド関係も解消する仕様にした（`block_user`関数内でDELETE）。** SRSに明記は無いが、ブロックした相手とフレンド関係が残ったままなのは直感に反するため。逆にブロック解除してもフレンド関係は自動復元しない（再度フレンド申請が必要）
- **「ストレンジャー」の定義をやや緩めて解釈した。** SRSの定義は「過去に1度以上メッセージのやりとりがあるユーザー」だが、`get_conversation_list`はDMルームが存在する時点で一覧に含める（メッセージ0件でも表示）。理由：DMを開始した直後にリストから消えてしまうと使い勝手が悪いため。この定義の違いは検索対象（SRS 3.5）には適用しておらず、あくまでホーム画面の会話一覧の話
- **`get_conversation_list`・`search_users`はブロック関係（双方向）にあるユーザーとの会話・検索結果を完全に除外する。** ただし相手が自分をブロックしている場合、既存のチャットルーム自体（`/chat/[roomId]`への直接アクセス）は`is_room_member`が真である限り閲覧可能なまま（メッセージ送信のみRLSで弾かれる）。一覧から消すだけで、ルーム自体を非表示にする対応はPhase 5のスコープ外とした
- **`ChatRoom`のブロックボタンは「自分が相手をブロックしているか」のみ扱う。** `blocks`テーブルのRLS（`blocks_select_own`）は自分の行しか見えない設計（Phase 1由来）なので、相手が自分をブロックしているかはクライアントから判定できない。その場合は送信時にRLSで弾かれ、既存の汎用`sendError`表示に自然に乗る
- **Supabase生成型の`Args`が無引数RPC（`get_conversation_list`等）に対して`never`になる版のcodegenだった。** `supabase.rpc("get_conversation_list")`のように第二引数を省略する呼び出しでtsc上も問題なく通ることをサンドボックスで実際に確認済み（型を手動で書き換えたりはしていない）
- **RPC関数の戻り値の型（`generate_typescript_types`生成分）は、実際にはNULL許容なカラム（`avatar_url`・`last_message_preview`等）でも非nullの型として出力される既知の制限がある。** アプリ側のマッピング処理（`app/home/page.tsx`等）では`?? null`で防御的に扱っている
- **検証方法：** サンドボックス環境に本リポジトリと同一のpackage.json/tsconfig.jsonで実際にファイルを再構成し、`npm install` → `npx tsc --noEmit`で型検証してから納品した

### 動作確認してほしい項目（実機確認用チェックリスト）

1. アカウントを2つ用意し、片方（A）からもう片方（B）のユーザーIDをユーザー追加パネルで検索し、フレンド申請を送る
2. B側：ホーム画面のユーザー追加ボタンに未読バッジが表示され、パネルを開くと「届いているフレンド申請」にAが表示されること。開いた時点でバッジが消える（既読化）こと
3. B側で承認 → A・B双方の「フレンド」タブに相手が表示されること
4. 別の組み合わせで申請 → 受信側が拒否 → 送信側の「送信したフレンド申請」に「拒否されました」と表示されること。同じ相手に再度申請すると送れる（差し戻し）こと
5. 申請中（相手が未応答）の状態で、送信側の「取り消す」から取り消せること。取り消し後は受信側の申請一覧からも消えること
6. フレンドでない相手（見知らぬユーザー）とDMを開始 → 双方のホーム「ストレンジャー」タブに表示され、「未フレンド」等のバッジが出ること。フレンド承認後はそのまま「フレンド」タブへ移ること（会話履歴は引き継がれる）
7. 検索結果の「メッセージ」ボタンから、フレンド関係の有無に関わらずDMを開始できること（既存DMがあればそこへ遷移、無ければ新規作成）
8. 自分の「知らない人からのDM」トグルをオフにした状態で、フレンドでない相手が自分に新規DMを開始しようとするとエラーメッセージが出ること。既存DM・フレンド相手からのDM開始は通常通り成功すること
9. チャット画面右上の「ブロック」→ 相手がホームの一覧（フレンド/ストレンジャーどちらのタブからも）から消えること。メッセージ入力欄・画像添付ボタンが無効化されること
10. 「ブロック解除」→ 再度一覧に表示され送信できるようになること。ただしブロック前にフレンドだった場合でもフレンド関係は自動復元されない（再度フレンド申請が必要）ことを確認
11. 検索結果一覧の「ブロック」からも同様にブロックでき、以降その相手は検索結果・一覧に出てこなくなること
12. 相手アカウント側から自分をブロックしてもらった状態で、自分からメッセージを送信すると（一覧上は普通に見えたままでも）送信時にエラーになることを確認する（相手が自分をブロックしているかはUI上判定できない仕様のため、送信失敗時の挙動として確認）

### 未対応・持ち越し事項（Phase 5時点）

- SRS 3.2.1の「検索」タブは独立実装せず、`AddUserPanel`に統合（上記「設計判断」参照）。本文更新の要否は次回判断
- グループチャットタブは表示のみでプレースホルダー（FR-4実装はPhase未割り当てのまま）
- ブロックした相手との既存チャットルーム自体を一覧外だけでなく閲覧不可にする対応は未実装
- フレンド申請・ブロックにRealtime購読は付けていない（一覧はページ遷移・Server Action後の`router.refresh()`で更新される設計。バッジのリアルタイム更新が必要になったら`friendships`テーブルもRealtime購読対象に追加を検討）
- `dm_from_stranger_enabled`トグルはホーム画面ヘッダーへの暫定配置。専用の設定画面はPhase 7で作る想定（アプリ設定画面・認証設定・通知設定と合わせて）

