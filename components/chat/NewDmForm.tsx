"use client";

import { useActionState } from "react";
import { startDirectMessage } from "@/app/actions/rooms";

export function NewDmForm() {
  const [state, formAction, pending] = useActionState(
    startDirectMessage,
    undefined,
  );

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label
            htmlFor="dm-username"
            className="font-label text-xs uppercase tracking-wide text-ink-muted"
          >
            ユーザーIDでDMを開始
          </label>
          <input
            id="dm-username"
            name="username"
            type="text"
            required
            placeholder="username"
            className="mt-1 w-full rounded-lg border border-band bg-surface-raised px-3 py-2 text-ink outline-none focus-visible:border-tongue"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-tongue px-4 py-2 font-medium text-white transition-opacity disabled:opacity-60"
        >
          {pending ? "開始中..." : "開始"}
        </button>
      </div>
      {state?.error && (
        <p className="text-sm text-clay" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
