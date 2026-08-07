# Tiliqua

プライバシー重視・軽量設計のチャットアプリ。

低スペック端末（学校PC等）でも快適に動くことを目指し、広告なし・外部連携なしで開発しています。名前の由来はお気に入りの動物「アオジタトカゲ」の学名 _Tiliqua_、そして並び替えると "Qualiti"（quality）になることから。

詳細な要件は [`docs/srs.md`](./docs/srs.md) を参照してください。

## 技術スタック

- **フレームワーク：** Next.js 16（App Router / TypeScript）
- **スタイリング：** Tailwind CSS v4
- **バックエンド：** Supabase（Auth / PostgreSQL / Realtime）
- **画像ストレージ：** Cloudinary
- **デプロイ：** Vercel
- **パッケージ管理：** npm

## 開発の進め方

- コーディングは基本的に Claude が担当し、UIの確認・動作確認・仕様判断はユーザーが担当する体制で開発しています。
- 開発状況・技術的な決定事項は [`CLAUDE.md`](./CLAUDE.md) にまとめ、セッション間で引き継いでいます。

## セットアップ

```bash
npm install
cp .env.example .env.local   # Supabase / Cloudinary の値を設定
npm run dev
```

http://localhost:3000 で確認できます。

## 開発フェーズ

| Phase | 内容                                         | 状態   |
| ----- | -------------------------------------------- | ------ |
| 0     | プロジェクト基盤（Next.js / Tailwind / PWA） | 完了   |
| 1     | Supabase設定・DBスキーマ・RLS                | 完了   |
| 2     | 認証フロー                                   | 完了   |
| 3     | チャットのコア機能（Realtime）               | 完了   |
| 4     | 画像送信（Cloudinary）                       | 未着手 |
| 5     | フレンド・ストレンジャー・ブロック           | 未着手 |
| 6     | 一時チャット・追加認証・非表示メッセージ     | 未着手 |
| 7     | 通知設定・PWA仕上げ・デプロイ                | 未着手 |
