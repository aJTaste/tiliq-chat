## Phase 18 の実装内容・詳細

CLAUDE.md「次にやること（Phase 18・未確定）」候補2、チャット切り替え時の体感速度改善に着手。Phase 17実機確認で判明していた「`app/(shell)/chat/[roomId]/page.tsx`が最大8回のDB問い合わせを直列`await`している」問題に対応。新機能・挙動変更は無く、DBクエリの発行順序・バッチングのみを変更する純粋なタイミング最適化。

### 変更ファイル

- `app/(shell)/chat/[roomId]/page.tsx`
- `components/chat/GatedChatRoomLoader.tsx`（各チャットゲート有効時のクライアント側読み込み経路。同型の直列クエリを持っていたため同一コミットで対応）

### 実装内容

`app/(shell)/chat/[roomId]/page.tsx`の直列8ステップを、依存関係に基づき4段階に再編した（`app/(shell)/layout.tsx`で既に使われている`Promise.all`+分割代入のパターンをそのまま踏襲）：

1. **Stage 1（`Promise.all`）：** `room`・`myMembership`・`settings`。いずれも`roomId`/`user.id`のみに依存し相互に独立
2. **`needsGate`判定・早期return：** 無改修のまま。trueなら`<AuthGate><GatedChatRoomLoader/></AuthGate>`を返し、Stage 3以降のクエリは一切発行しない
3. **Stage 2（単独）：** `otherMember`（`!needsGate`の場合のみ到達。あえてStage 1に含めなかった理由は後述）
4. **Stage 3（単独、`otherMember`に依存）：** `otherProfile`（既存の三項演算子ロジックのまま）
5. **Stage 4（`Promise.all`）：** `myBlockOfOther`・`initialMessagesDesc`・`hiddenRows`。`otherProfile.id`が要るのは`myBlockOfOther`のみだが、残り2つも一緒に発行して無駄がないためまとめた

`components/chat/GatedChatRoomLoader.tsx`も同様に、`otherProfile`確定後の`myBlockOfOther`・`initialMessagesDesc`（`messagesError`分岐は維持）・`hiddenRows`の3クエリを`Promise.all`にまとめた。

いずれのファイルも`notFound()`/`redirect()`/エラーフォールバック（`?? []`・`?? false`・`messagesError`分岐）の意味は一切変更していない。新たな`.error`チェックも導入していない（既存が全箇所`.data`のnullチェック/フォールバック方式のため、`layout.tsx`の`loadError`パターンをここに持ち込むのはスコープ外の挙動変更になるため見送った）。

### 設計判断・学び

- **`otherMember`をStage 1に含めなかった。** `otherMember`自体は`roomId`/`user.id`のみに依存しStage 1の3クエリと相互に独立しているため、技術的には一緒に束ねられる。しかしStage 1完了後の`needsGate`判定でゲート中と分かった場合、Stage 2以降（`otherMember`含む）は全く発行されないという既存の重要な性質（ゲート中ユーザーへの無駄なDB往復を増やさない。Phase 6以来の設計方針）がある。`otherMember`をStage 1に混ぜると、ゲート中でも常にこのクエリだけは発行されてしまう回帰になるため、あえてStage 2として`needsGate`チェックの後に残した。非ゲート成功パスで1ステップ分の並列化を諦める代わりに、ゲートパスの「余計な仕事をしない」という既存の重要な性質を守った
- **`initialMessagesDesc`・`hiddenRows`をStage 2（`otherMember`）側に前倒ししなかった。** この2クエリは`otherProfile`に依存しないため理論上はStage 2〜3と並行実行できるが、(1) 現在の設計でも既にStage 4で`myBlockOfOther`と並行実行されており、Stage 4を早めても総待ち時間（ステージ数）は変わらない、(2) `otherMember`がnullで`notFound()`になる稀なケースで無駄なクエリ発行が増える、という2点から見送った。8→4段階が「これ以上詰めても意味が薄い」ポイントと判断した
- **`GatedChatRoomLoader.tsx`側の軽微な非対称：** `messagesError`時に`hiddenRows`も無駄に取得されるようになった（`Promise.all`化により、エラー判定前に3クエリとも発行済みのため）。`myBlockOfOther`は元々messagesより先行して発行されていたため実質的な影響は`hiddenRows`のみ。エラー時のみに限られる軽微な話のため許容した

### 検証方法・実施内容

- `npx tsc --noEmit`（エラー0件）
- `npx eslint .`（エラー0件）
- `rm -rf .next && npm run build`（クリーンビルド成功）
- 実機での体感速度改善確認・機能退行確認（非ゲートDM切り替え、ルーム個別ロック・起動時ゲート双方でのゲート短絡確認、`otherMember`欠如時の`notFound()`確認）はユーザーによる実機確認待ち

### 未対応・持ち越し事項（Phase 18時点）

- 上記「設計判断・学び」で検討した、Stage 2/4の境界をさらに動かす追加最適化は見送り済み（これ以上の並列化は費用対効果が薄いと判断）
- 「検討中のアイデア」節5.で挙がっていたSuspenseによるヘッダー/入力欄の据え置き案（メッセージ一覧だけ遅延ストリーミング）は今回のスコープ外のまま。`template.tsx`の強制リマウント設計との整合性検討が必要（同節参照）

### `/chat/[roomId]/hidden/page.tsx`の起動時ゲートバイパス修正（同セッション内で追加対応）

CLAUDE.md「次にやること（Phase 18・未確定）」候補6。Phase 17で`app/(shell)/chat/[roomId]/page.tsx`に対して行った修正（起動時ゲートの独立チェック追加）と同型の問題が`app/chat/[roomId]/hidden/page.tsx`にも残っていたため対応。

**問題：** `hidden/page.tsx`は永続サイドバーシェル（`app/(shell)/layout.tsx`）のRoute Group外にある独立ページのため、シェル側の起動時ゲート（`AuthGate` scopeKey="launch"）による保護を一切受けない。従来は`user_settings.auth_scope_hidden_list`（このページ専用のスコープ）のみでゲート要否を判定していたため、起動時ゲートが有効でも`auth_scope_hidden_list`がオフなら、このページを直接URLで開けば非表示メッセージ一覧が素通りできる抜け道があった。

**対応：** `settings`クエリに`auth_scope_launch`も追加し、`needsGate = hiddenListGateEnabled || launchGateEnabled`で合成判定するよう変更（`app/(shell)/chat/[roomId]/page.tsx`のroom個別ロック×起動時ゲートの合成判定と同じ考え方）。`hidden-list`専用ゲートが有効なら従来通りそちらのscopeKeyを優先し、専用ゲートがオフで起動時ゲートだけが有効な場合は`launch`スコープを再利用する（シェル側で既に解錠済みのタブでは再入力不要）。あわせて`membership`・`settings`の2クエリを`Promise.all`で並列化した（Phase 18本編と同じ観点のついで対応）。

`AuthGate.tsx`を確認し、`unlocked`がtrueになるまで`children`自体をマウントしない設計（`if (unlocked) return <>{children}</>`、それ以外はロック画面を返す）であることを確認済み。`body`（`HiddenMessagesList`）に渡すpropsは`roomId`/`currentUserId`のみで実際のメッセージ内容を含まないため、`ChatRoom`のケースとは異なりRSCペイロードへの解錠前データ混入リスクはそもそも無い（純粋に「解錠前は一覧コンポーネント自体をマウントしない」という表示制御の話）。

### 検証方法・実施内容（この追加対応分）

- `npx tsc --noEmit`（エラー0件）
- `npx eslint .`（エラー0件）
- `rm -rf .next && npm run build`（クリーンビルド成功）
- 実機確認（起動時ゲートON・`auth_scope_hidden_list`OFFの状態で`/chat/[roomId]/hidden`に直接URLアクセスし、認証プロンプトが出ることの確認）はユーザー待ち

