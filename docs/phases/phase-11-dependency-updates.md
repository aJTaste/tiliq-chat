## Phase 11 の実装内容・詳細

Phase 8で見つかっていた依存パッケージのバージョン更新（`npm outdated`で確認済みの「安全そうなパッチ/マイナー更新」）に対応。

### 変更ファイル

- `package.json` — 以下を更新（`next`/`react`/`react-dom`/`eslint-config-next`は既存の慣習に合わせて厳密バージョン指定のまま更新）：
  - `next`: `16.2.12` → `16.3.0`
  - `eslint-config-next`: `16.2.12` → `16.3.0`（`next`本体とバージョンを揃える）
  - `react` / `react-dom`: `19.2.4` → `19.2.8`
  - `@supabase/supabase-js`: `^2.112.0` → `^2.112.3`
  - `@types/node`: `^20` → `^22`（技術スタック表の「Node.js 22系」との不一致を解消。`npm outdated`の「Latest」欄は`26.2.0`だったが、これは実行環境のNode.jsバージョンと無関係に存在する最新配布に過ぎないため追従せず、実際のランタイム target に合わせた）
- `app/error.tsx` / `app/global-error.tsx` — 後述の`retry`プロパティ名変更に追従
- `package-lock.json` — `npm install`実行に伴う更新

### あえて更新しなかったもの

- `eslint`: `^9` → `10.x`（メジャーバージョン。flat config移行等の追加作業が必要になる可能性があり、今回の「安全そうな更新」の対象外と判断）
- `typescript`: `^5` → `7.x`（Phase 8の調査時点から記録済みの通り、Go実装のネイティブコンパイラ系列でありsemver上のメジャーとは性質が異なる。反射的に追従するものではないため見送り）

### 設計判断・学び

- **`next` 16.2.12→16.3.0という一見「マイナー」な更新の中に、実際に使用しているAPIの破壊的変更が含まれていた。** `app/error.tsx`/`app/global-error.tsx`（Phase 9で実装）が使う`error.tsx`のpropsが、v16.3.0で`unstable_retry`から安定版の`retry`へ名称変更されていた（`node_modules/next/dist/docs/.../error.md`のVersion Historyで確認：「v16.3.0: retry prop became stable」）。後方互換のエイリアスは提供されておらず、更新して気づかずに放置していたら「再試行」ボタンをクリックした瞬間に実行時エラーになるところだった。AGENTS.mdが警告する「このNext.jsフォークは通常と異なる破壊的変更を含みうる」を体現する実例として記録する。**パッチ/マイナーに見えるバージョン更新でも、実際に使用している実験的（`unstable_`プレフィックス）APIについては更新の都度ドキュメントを再確認する習慣が必要**
- **`unstable_rethrow`（Phase 8で`AddUserPanel.tsx`が使用）は16.3.0でも名称変更されていないことを確認済み**（ドキュメント冒頭に`version: unstable`のまま）。同じ「unstable_」プレフィックスでも安定化のタイミングは関数ごとに異なるため、それぞれ個別に確認する必要がある
- **`npm install`後に`npm audit`で`nanoid`のhigh severityな脆弱性（`GHSA-2v37-7h3g-55p8`）が新たに検出され、`npm audit fix`で解消した。** 直接の依存関係ではなく間接依存（他パッケージ経由）だったため、`package.json`には現れない

### 検証方法・実施内容

- `npm install`実行後、`node_modules/next/package.json`等で実際にインストールされたバージョンを確認
- `npm audit` → `npm audit fix`で脆弱性0件を確認
- `npx tsc --noEmit` / `npx eslint .` / `npm run build`（`.next`を一度削除してのクリーンビルド）をすべて実行し、エラー0件を確認

### 未対応・持ち越し事項（Phase 11時点）

- `eslint`（9→10）・`typescript`（5→7系）のメジャー更新は今回見送ったまま。対応する場合は別途セッションを設けて移行作業を検討する

