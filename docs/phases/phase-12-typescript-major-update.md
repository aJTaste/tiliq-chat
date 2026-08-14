## Phase 12 の実装内容・詳細

Phase 11で見送った依存パッケージのメジャー更新（`eslint` 9→10、`typescript` 5→7系）に着手。実装前の調査で、当初の想定（`typescript`を7系まで一気に上げる）が現時点では実行不可能であることが判明し、さらに`eslint`の10系更新も実際に動かしてみたところ`eslint-config-next`が同梱するプラグインの一つが実行時クラッシュすることが分かった。結果として**`typescript`のみ5→6.0.3に更新し、`eslint`は9のまま据え置く**という、当初の候補（CLAUDE.md「次にやること（Phase 12・未確定）」候補2）とは異なる着地になった。

### 変更ファイル

- `package.json` — `typescript`: `^5` → `~6.0.3`（`eslint`は`^9`のまま変更なし）
- `package-lock.json` — `npm install`実行に伴う更新

### 調査で判明した内容（実装前にnpmレジストリ・実機検証で確認）

1. **`typescript`の7系更新はブロックされている。** `eslint-config-next`が内部で使う`typescript-eslint`（現行8.65.0、canary版8.67.1-alpha.0でも同じ）の`peerDependencies`が`typescript: ">=4.8.4 <6.1.0"`に固定されており、7系は対象外。原因はTypeScript 7.0（Go移植のネイティブコンパイラ、通称tsgo）が`typescript-eslint`・`ts-morph`等が依存する**Programmatic Compiler API（旧Strada）を提供していない**ため。この制約が外れるのは**TypeScript 7.1（2026年秋予定）**と見込まれている
2. **TypeScript本体は5.9の後、2026年3月に6.0を「最後のJS実装版・7.0への移行リリース」として正式リリース済み。** 6.0系はそのまま6.0.3が最新で、6.1系列自体がnpmに存在しない（6.0.3の次は7.0.1-rc）。`typescript-eslint`の許容上限`<6.1.0`にちょうど収まる
3. **`tsconfig.json`は6.0の新デフォルト・非推奨化の影響を受けなかった。** `target: ES2017`・`moduleResolution: bundler`・`module: esnext`・`esModuleInterop: true`をいずれも明示指定済みで、6.0で非推奨化された`target: es5`・`moduleResolution: node/classic`・`baseUrl`・`outFile`等は元々未使用だったため。`npx tsc --noEmit`は変更前と同じくエラー0件
4. **`eslint`の10系更新は実際に`npm install`・`npx eslint .`まで試したところ実行時クラッシュした。** `npm install`時点で`eslint-config-next`が同梱する`eslint-plugin-import`・`eslint-plugin-jsx-a11y`・`eslint-plugin-react`（いずれも2026年8月時点のnpm最新版）の`peerDependencies`が`eslint`10系を含んでおらず`ERESOLVE overriding peer dependency`警告が出た。警告だけなら実害が無いことも多いため実際に`npx eslint .`を実行して検証したところ、`eslint-plugin-react@7.37.5`内の`react/display-name`ルールが`context.getFilename is not a function`で例外を投げ、`.ts`ファイル（JSXすら含まない`app/actions/auth.ts`）を対象にした時点で即座にクラッシュした。ESLint 10で`RuleContext`から`getFilename()`等のレガシーAPIが除去された影響とみられる。**単なるpeer警告と実際の動作可否は別物であり、`npm install`が通ってもlintそのものは動かないケースが実在することを確認した実例。** `eslint-config-next`のcanary版（16.3.1-canary.13）・preview版（16.3.0-preview.10）でも同梱プラグインのバージョンは変わらず、この時点では回避策が無いと判断した
5. 上記4の発覚を受けて`eslint`を`^9`（実際にインストールされるのは9.39.5）に戻し、`typescript`を6.0.3のまま`npx eslint .`（エラー0件）・`npx tsc --noEmit`（エラー0件）・クリーンビルド・`npm audit`を再実行し、いずれも問題ないことを確認してから確定させた

### 設計判断・学び

- **「メジャーバージョン更新の計画」フェーズで実際にインストール・実行まで検証したことで、npmレジストリの調査だけでは分からない実行時クラッシュを実装前に発見できた。** Phase 11の教訓（パッチ/マイナーに見えても実使用APIの破壊的変更がありうる）の延長線上だが、今回はさらに一歩踏み込み、「peer dependencyの警告が出ないこと」と「実際にコマンドが動くこと」は別の確認軸であることを実例で確認した。今後同種のメジャー更新を検討する際は、`npm ls`でのpeer警告確認だけで終わらせず、必ず対象コマンド（今回は`eslint .`）を実際に一度実行してから確定する運用を徹底する
- **`typescript-eslint`・`eslint-plugin-react`等、直接の依存関係ではなく`eslint-config-next`が内部で選ぶ間接依存のバージョンは、こちら側の`package.json`を書き換えても制御できない。** Next.js本体・`eslint-config-next`側の追従を待つほかない受動的な制約として記録する

### 検証方法・実施内容

- `npm install`実行後、`npm ls typescript typescript-eslint eslint eslint-config-next`でinvalid/override警告が無いことを確認
- `npx tsc --noEmit`（エラー0件）
- `npx eslint .`（エラー0件、クラッシュ無し）
- `rm -rf .next && npm run build`（クリーンビルド成功）
- `npm audit`（脆弱性0件）

### 未対応・持ち越し事項（Phase 12時点）

- **`typescript`の7系更新：** `typescript-eslint`がTypeScript 7.1（2026年秋予定）に対応し次第、別セッションで再検討する。次回セッション開始時は`npm view typescript-eslint peerDependencies`で許容範囲が広がっていないか確認するとよい
- **`eslint`の10系更新：** `eslint-config-next`が同梱する`eslint-plugin-react`（または`eslint-plugin-import`・`eslint-plugin-jsx-a11y`）がESLint 10のRuleContext API変更に追従し、`npx eslint .`が実際にクラッシュせず動作することを確認できてから再挑戦する。`eslint-config-next`の新しいバージョンがリリースされたタイミングで、まず`npm view eslint-config-next@latest dependencies`で同梱プラグインのバージョンが更新されているかを確認してから着手するとよい

