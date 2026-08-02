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
      </section>

      <footer className="flex items-center justify-center border-t border-band/60 px-6 py-5 sm:px-10">
        <span className="inline-flex items-center gap-2 rounded-full border border-band/70 px-3 py-1 font-label text-xs tracking-wide text-ink-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-tongue" aria-hidden="true" />
          Phase 0 ・ 基盤構築中
        </span>
      </footer>
    </main>
  );
}
