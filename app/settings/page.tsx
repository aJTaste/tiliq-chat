import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AuthSettingsForm } from "@/components/settings/AuthSettingsForm";

/**
 * FR-19/FR-20/3.8: 追加認証（PIN／キー）の設定・スコープ割り当て。
 * CLAUDE.md「次にやること（Phase 6）」の通り、チャット設定・オプション画面の土台として
 * 最小構成で新設する（ストレンジャーDMトグル等の統合はPhase 7で検討）。
 */
export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: settings } = await supabase
    .from("user_settings")
    .select("auth_type, auth_scope_launch, auth_scope_hidden_list")
    .eq("user_id", user.id)
    .single();

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 px-6 py-8">
      <header className="flex items-center gap-3">
        <Link
          href="/home"
          className="rounded-lg border border-band px-3 py-1.5 text-sm text-ink-muted transition-colors hover:bg-surface-raised"
        >
          ← 戻る
        </Link>
        <h1 className="font-display text-lg font-semibold text-ink">設定</h1>
      </header>

      <AuthSettingsForm
        initialAuthType={(settings?.auth_type as "pin" | "key" | null) ?? null}
        initialScopeLaunch={settings?.auth_scope_launch ?? false}
        initialScopeHiddenList={settings?.auth_scope_hidden_list ?? false}
      />
    </main>
  );
}
