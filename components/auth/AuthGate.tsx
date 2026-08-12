"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  unlockAuthWithPassword,
  verifyAuthSecret,
} from "@/app/actions/auth-secret";
import { NETWORK_ERROR_MESSAGE } from "@/lib/errors";

// Phase 6: 追加認証（FR-19/FR-20/3.8）の3スコープ（起動時・各チャット・非表示一覧）で
// 共通利用するゲート。友人・家族に端末を貸したときの覗き見防止という脅威モデルのため、
// sessionStorageでタブセッション単位の解錠状態を管理する（DB側にセッション状態は持たない）。
const STORAGE_PREFIX = "tiliqua-auth-gate:";

export function AuthGate({
  scopeKey,
  title,
  children,
}: {
  scopeKey: string;
  title?: string;
  children: ReactNode;
}) {
  const storageKey = `${STORAGE_PREFIX}${scopeKey}`;
  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [pending, setPending] = useState(false);
  const [showPasswordUnlock, setShowPasswordUnlock] = useState(false);
  const [password, setPassword] = useState("");
  const [justUnlockedWithPassword, setJustUnlockedWithPassword] =
    useState(false);

  useEffect(() => {
    // sessionStorageはSSR時に存在しないため、マウント後（クライアント側）で
    // 読み取ってから解錠状態を確定させる必要がある（SSRとの出力不一致を避けるため
    // 初期値はnullのまま render し、ここで初めて実際の値へ更新する）。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUnlocked(sessionStorage.getItem(storageKey) === "1");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);

    try {
      const result = await verifyAuthSecret(value);

      if (!result.success) {
        setError(result.error);
        setLocked(Boolean(result.locked));
        setValue("");
        return;
      }

      sessionStorage.setItem(storageKey, "1");
      setUnlocked(true);
    } catch {
      setError(NETWORK_ERROR_MESSAGE);
    } finally {
      setPending(false);
    }
  }

  async function handleUnlockWithPassword(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);

    try {
      const result = await unlockAuthWithPassword(password);

      if (!result.success) {
        setError(result.error);
        return;
      }

      setPassword("");
      setLocked(false);
      setShowPasswordUnlock(false);
      setJustUnlockedWithPassword(true);
    } catch {
      setError(NETWORK_ERROR_MESSAGE);
    } finally {
      setPending(false);
    }
  }

  // sessionStorage確認前は何も表示しない（未解錠フォームのチラつき防止）
  if (unlocked === null) {
    return null;
  }

  if (unlocked) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-[50vh] w-full flex-1 flex-col items-center justify-center gap-4 px-6 py-10 text-center">
      <p className="font-display text-lg font-semibold text-ink">
        {title ?? "認証が必要です"}
      </p>
      <p className="max-w-xs text-sm text-ink-muted">
        設定した認証PIN／キーを入力してください。
      </p>

      {justUnlockedWithPassword && (
        <p className="max-w-xs text-xs text-ink-muted">
          ロックを解除しました。PIN／キーを忘れた場合は
          <Link href="/settings" className="text-tongue underline">
            設定画面
          </Link>
          から再設定できます。
        </p>
      )}

      {!locked ? (
        <form
          onSubmit={handleSubmit}
          className="flex w-full max-w-xs flex-col gap-2"
        >
          <input
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
            className="rounded-lg border border-band bg-surface-raised px-3 py-2 text-center text-ink outline-none focus-visible:border-tongue"
          />
          <button
            type="submit"
            disabled={pending || value.length === 0}
            className="rounded-lg bg-tongue px-4 py-2 font-medium text-white transition-opacity disabled:opacity-60"
          >
            {pending ? "確認中..." : "確認"}
          </button>
        </form>
      ) : (
        <div className="flex w-full max-w-xs flex-col gap-3">
          <p className="text-sm text-clay">連続失敗によりロック中です。</p>
          {!showPasswordUnlock ? (
            <button
              type="button"
              onClick={() => setShowPasswordUnlock(true)}
              className="rounded-lg border border-band px-3 py-1.5 text-sm text-ink-muted transition-colors hover:bg-surface-raised"
            >
              アカウントのパスワードで解除する
            </button>
          ) : (
            <form
              onSubmit={handleUnlockWithPassword}
              className="flex flex-col gap-2"
            >
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="アカウントのパスワード"
                autoFocus
                className="rounded-lg border border-band bg-surface-raised px-3 py-2 text-center text-ink outline-none focus-visible:border-tongue"
              />
              <button
                type="submit"
                disabled={pending || password.length === 0}
                className="rounded-lg bg-tongue px-4 py-2 font-medium text-white transition-opacity disabled:opacity-60"
              >
                {pending ? "確認中..." : "ロックを解除"}
              </button>
            </form>
          )}
        </div>
      )}

      {error && (
        <p className="text-xs text-clay" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
