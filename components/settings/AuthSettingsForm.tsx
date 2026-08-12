"use client";

import { useState, useTransition, type FormEvent } from "react";
import {
  clearAuthSecret,
  setAuthSecret,
} from "@/app/actions/auth-secret";
import {
  updateAuthScopeHiddenList,
  updateAuthScopeLaunch,
} from "@/app/actions/settings";
import { NETWORK_ERROR_MESSAGE } from "@/lib/errors";

type AuthType = "pin" | "key" | null;

/**
 * Phase 8: 全ハンドラの`await xxxAction(...)`をtry/catchで囲むよう修正した
 * （従来はオフライン等でfetchがthrowすると未処理例外になっていた）。
 * `toggleScopeLaunch`/`toggleScopeHiddenList`は、従来`{success:false}`分岐でも
 * エラー表示が無くサイレントにロールバックするだけだったため、あわせてsetErrorを追加した。
 */
export function AuthSettingsForm({
  initialAuthType,
  initialScopeLaunch,
  initialScopeHiddenList,
}: {
  initialAuthType: AuthType;
  initialScopeLaunch: boolean;
  initialScopeHiddenList: boolean;
}) {
  const [authType, setAuthType] = useState<AuthType>(initialAuthType);
  const [formType, setFormType] = useState<"pin" | "key">(
    initialAuthType ?? "pin",
  );
  const [value, setValue] = useState("");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [scopeLaunch, setScopeLaunch] = useState(initialScopeLaunch);
  const [scopeHiddenList, setScopeHiddenList] = useState(
    initialScopeHiddenList,
  );
  const [scopePending, startScopeTransition] = useTransition();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    startTransition(async () => {
      try {
        const result = await setAuthSecret(formType, value);
        if (!result.success) {
          setError(result.error);
          return;
        }
        setAuthType(formType);
        setValue("");
        setMessage("追加認証を設定しました。");
      } catch {
        setError(NETWORK_ERROR_MESSAGE);
      }
    });
  }

  function handleClear() {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      try {
        const result = await clearAuthSecret();
        if (!result.success) {
          setError(result.error);
          return;
        }
        setAuthType(null);
        setMessage("追加認証を解除しました。");
      } catch {
        setError(NETWORK_ERROR_MESSAGE);
      }
    });
  }

  function toggleScopeLaunch() {
    const next = !scopeLaunch;
    setScopeLaunch(next);
    setError(null);
    startScopeTransition(async () => {
      try {
        const result = await updateAuthScopeLaunch(next);
        if (!result.success) {
          setScopeLaunch(!next);
          setError(result.error);
        }
      } catch {
        setScopeLaunch(!next);
        setError(NETWORK_ERROR_MESSAGE);
      }
    });
  }

  function toggleScopeHiddenList() {
    const next = !scopeHiddenList;
    setScopeHiddenList(next);
    setError(null);
    startScopeTransition(async () => {
      try {
        const result = await updateAuthScopeHiddenList(next);
        if (!result.success) {
          setScopeHiddenList(!next);
          setError(result.error);
        }
      } catch {
        setScopeHiddenList(!next);
        setError(NETWORK_ERROR_MESSAGE);
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-lg border border-band bg-surface-raised p-4">
        <div>
          <h2 className="font-medium text-ink">追加認証（PIN／キー）</h2>
          <p className="mt-1 text-xs text-ink-muted">
            現在の状態：
            {authType === "pin"
              ? "設定済み（PIN）"
              : authType === "key"
                ? "設定済み（キー）"
                : "未設定"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex gap-4 text-sm text-ink">
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                name="authFormType"
                checked={formType === "pin"}
                onChange={() => setFormType("pin")}
              />
              PIN（4〜8桁の数字）
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                name="authFormType"
                checked={formType === "key"}
                onChange={() => setFormType("key")}
              />
              キー（任意の文字列）
            </label>
          </div>

          <input
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            inputMode={formType === "pin" ? "numeric" : undefined}
            maxLength={formType === "pin" ? 8 : undefined}
            placeholder={
              formType === "pin" ? "例：1234" : "認証キーを入力"
            }
            className="rounded-lg border border-band bg-surface px-3 py-2 text-ink outline-none focus-visible:border-tongue"
          />

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending || value.length === 0}
              className="rounded-lg bg-tongue px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-60"
            >
              {authType ? "変更する" : "設定する"}
            </button>
            {authType && (
              <button
                type="button"
                onClick={handleClear}
                disabled={pending}
                className="rounded-lg border border-band px-3 py-2 text-sm text-ink-muted transition-colors hover:bg-surface disabled:opacity-60"
              >
                解除する
              </button>
            )}
          </div>
        </form>

        {message && <p className="text-xs text-tongue">{message}</p>}
        {error && (
          <p className="text-xs text-clay" role="alert">
            {error}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-band bg-surface-raised p-4">
        <h2 className="font-medium text-ink">認証を要求する場面</h2>
        <p className="text-xs text-ink-muted">
          個別のチャットへの割り当ては、各チャットのオプションメニューから設定できます。
        </p>

        <label className="flex items-center justify-between gap-3 text-sm text-ink">
          起動時
          <input
            type="checkbox"
            checked={scopeLaunch}
            onChange={toggleScopeLaunch}
            disabled={scopePending || !authType}
          />
        </label>
        <label className="flex items-center justify-between gap-3 text-sm text-ink">
          非表示メッセージ一覧
          <input
            type="checkbox"
            checked={scopeHiddenList}
            onChange={toggleScopeHiddenList}
            disabled={scopePending || !authType}
          />
        </label>
        {!authType && (
          <p className="text-xs text-ink-muted">
            追加認証を設定すると変更できます。
          </p>
        )}
      </section>
    </div>
  );
}
