"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signup } from "@/app/actions/auth";

export default function SignupPage() {
  const [state, formAction, pending] = useActionState(signup, undefined);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-2xl font-semibold text-ink">
          新規登録
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Tiliquaのアカウントを作成します。
        </p>

        <form action={formAction} className="mt-8 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="username"
              className="font-label text-xs uppercase tracking-wide text-ink-muted"
            >
              ユーザーID
            </label>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              required
              minLength={3}
              maxLength={20}
              pattern="[A-Za-z0-9]{3,20}"
              className="rounded-lg border border-band bg-surface-raised px-3 py-2 text-ink outline-none focus-visible:border-tongue"
            />
            <p className="text-xs text-ink-muted">
              英数字3〜20文字。あとから変更できません。
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="displayName"
              className="font-label text-xs uppercase tracking-wide text-ink-muted"
            >
              表示名
            </label>
            <input
              id="displayName"
              name="displayName"
              type="text"
              autoComplete="nickname"
              required
              minLength={1}
              maxLength={30}
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
              autoComplete="new-password"
              required
              minLength={8}
              className="rounded-lg border border-band bg-surface-raised px-3 py-2 text-ink outline-none focus-visible:border-tongue"
            />
            <p className="text-xs text-ink-muted">8文字以上。</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="email"
              className="font-label text-xs uppercase tracking-wide text-ink-muted"
            >
              メールアドレス（任意）
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
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
            {pending ? "作成中..." : "アカウントを作成"}
          </button>
        </form>

        <p className="mt-6 text-sm text-ink-muted">
          既にアカウントをお持ちですか？{" "}
          <Link
            href="/login"
            className="text-tongue underline underline-offset-2"
          >
            ログイン
          </Link>
        </p>
      </div>
    </main>
  );
}
