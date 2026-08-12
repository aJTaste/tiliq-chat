import Link from "next/link";
import { TiliquaMark } from "@/components/TiliquaMark";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col">
      <header className="border-b border-band/60 px-6 py-4 sm:px-10">
        <p className="font-label text-xs uppercase tracking-[0.25em] text-ink-muted">
          Fam. Scincidae ・ Gen. Tiliqua
        </p>
      </header>

      <section className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-24 text-center sm:px-10">
        <TiliquaMark />
        <p className="sr-only">
          Tiliqua は &quot;Qualiti&quot;（quality）の文字を並び替えた名前です。
        </p>
        <p className="max-w-md text-balance text-base leading-relaxed text-ink-muted sm:text-lg">
          プライバシーを大切にしながら、軽量・高速に使えるチャットアプリ。
          <br className="hidden sm:block" />
          低スペックな端末でも、静かに、素早く。
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/signup"
            className="rounded-lg bg-tongue px-5 py-2.5 font-medium text-white transition-opacity hover:opacity-90"
          >
            はじめる
          </Link>
          <Link
            href="/login"
            className="rounded-lg border border-band px-5 py-2.5 text-ink-muted transition-colors hover:bg-surface-raised"
          >
            ログイン
          </Link>
        </div>
      </section>

      <footer className="flex items-center justify-center border-t border-band/60 px-6 py-5 sm:px-10">
        <span className="inline-flex items-center gap-2 rounded-full border border-band/70 px-3 py-1 font-label text-xs tracking-wide text-ink-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-tongue" aria-hidden="true" />
          広告なし・外部連携なしで運用中
        </span>
      </footer>
    </main>
  );
}
