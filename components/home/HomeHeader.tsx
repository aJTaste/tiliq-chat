import Link from "next/link";
import { logout } from "@/app/actions/auth";

/**
 * Phase 16: 起動時ゲート有効時、ロック中は一切レンダリングしないよう
 * AuthGateの解錠後にのみ描画される経路（GatedHomeBody）へ切り出した
 * （元々app/home/page.tsxが常時描画していたが、「設定」からゲート自体を
 * 無効化できてしまう・ユーザー名が覗き見できてしまうという指摘のため）。
 * ゲート無効時はapp/home/page.tsxから直接描画される（Server Component）。
 */
export function HomeHeader({ displayName }: { displayName: string }) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-band/60 px-6 py-4">
      <div className="min-w-0">
        <p className="font-label text-xs uppercase tracking-[0.25em] text-ink-muted">
          Tiliqua
        </p>
        <h1 className="truncate font-display text-lg font-semibold text-ink">
          {displayName}
        </h1>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Link
          href="/settings"
          className="rounded-lg border border-band px-3 py-1.5 text-sm text-ink-muted transition-colors hover:bg-surface-raised"
        >
          設定
        </Link>
        <form action={logout}>
          <button
            type="submit"
            className="rounded-lg border border-band px-3 py-1.5 text-sm text-ink-muted transition-colors hover:bg-surface-raised"
          >
            ログアウト
          </button>
        </form>
      </div>
    </header>
  );
}
