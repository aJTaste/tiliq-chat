import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AuthSettingsForm } from "@/components/settings/AuthSettingsForm";
import { NotificationSettingsForm } from "@/components/settings/NotificationSettingsForm";

/**
 * FR-19/FR-20/3.8: 追加認証（PIN／キー）の設定・スコープ割り当て。
 * FR-22/FR-24: DM受信設定・プッシュ通知設定（Phase 7でホーム画面ヘッダーの
 * StrangerDmToggleから本画面へ統合）。
 * SRS 3.2.1「アプリ設定画面（認証設定・通知設定・DM受信設定を含む）」準拠。
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
    .select(
      "auth_type, auth_scope_launch, auth_scope_hidden_list, dm_from_stranger_enabled, push_notifications_enabled",
    )
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

      <NotificationSettingsForm
        initialPushNotificationsEnabled={
          settings?.push_notifications_enabled ?? true
        }
        initialDmFromStrangerEnabled={
          settings?.dm_from_stranger_enabled ?? true
        }
      />
    </main>
  );
}
