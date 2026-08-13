/**
 * Phase 17: 永続サイドバーシェル化に伴い、サイドバー（会話一覧・ユーザー検索）の
 * データ取得・描画責務はapp/(shell)/layout.tsx（非ゲート時）・
 * components/shell/GatedShellBody.tsx（ゲート時）へ完全に移した。このページ自体は
 * 「チャット未選択時のメインエリア」を示す静的プレースホルダのみを持つ
 * （Supabase呼び出し不要・個人情報を含まないため認証チェックも不要。
 * 保護は親レイアウトが担う）。
 */
export default function HomePage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
      <p className="text-sm text-ink-muted">会話を選択してください</p>
    </div>
  );
}
