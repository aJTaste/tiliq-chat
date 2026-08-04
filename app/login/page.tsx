"use client";

import { useActionState } from "react";
import Link from "next/link";
import { login } from "@/app/actions/auth";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, undefined);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-2xl font-semibold text-ink">
          ログイン
        </h1>
        <p className="mt-1 text-sm text-ink-muted">Tiliquaへおかえりなさい。</p>

        <form action={formAction} className="mt-8 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="identifier"
              className="font-label text-xs uppercase tracking-wide text-ink-muted"
            >
              ユーザーID または メールアドレス
            </label>
            <input
              id="identifier"
              name="identifier"
              type="text"
              autoComplete="username"
              required
              className="rounded-lg border border-band bg-surface-raised px-3 py-2 text-ink outline-none focus-visible:border-tongue"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="password"
              className="font-label text-xs uppercase tracking-wide text-ink-muted"
            >
              パスワード
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="rounded-lg border border-band bg-surface-raised px-3 py-2 text-ink outline-none focus-visible:border-tongue"
            />
          </div>

          {state?.error && (
            <p className="text-sm text-clay" role="alert">
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="mt-2 rounded-lg bg-tongue px-4 py-2 font-medium text-white transition-opacity disabled:opacity-60"
          >
            {pending ? "ログイン中..." : "ログイン"}
          </button>
        </form>

        <p className="mt-6 text-sm text-ink-muted">
          アカウントをお持ちでないですか？{" "}
          <Link
            href="/signup"
            className="text-tongue underline underline-offset-2"
          >
            新規登録
          </Link>
        </p>
      </div>
    </main>
  );
}
