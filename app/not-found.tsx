import Link from "next/link";

/**
 * SRS 3.2.1「エラー画面・オフライン通知UI」対応（Phase 9）。
 * app/chat/[roomId]/page.tsx・app/chat/[roomId]/hidden/page.tsxのnotFound()呼び出しと、
 * 存在しないURL全般の両方をこの1ファイルでカバーする（ルートグループ・動的セグメントの
 * レイアウトが無い構成のため、experimentalなglobal-not-found.jsは不要）。
 * 通常のSegment内ファイルなのでルートレイアウト（フォント・globals.css）を自動継承する。
 */
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <p className="font-label text-xs uppercase tracking-[0.25em] text-ink-muted">
        404
      </p>
      <h1 className="font-display text-xl font-semibold text-ink">
        ページが見つかりません
      </h1>
      <p className="max-w-xs text-sm text-ink-muted">
        お探しのページは存在しないか、移動・削除された可能性があります。
      </p>
      <Link
        href="/"
        className="rounded-lg bg-tongue px-5 py-2.5 font-medium text-white transition-opacity hover:opacity-90"
      >
        トップへ戻る
      </Link>
    </main>
  );
}
