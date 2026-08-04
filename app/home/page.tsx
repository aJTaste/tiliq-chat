import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/actions/auth";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, display_name")
    .eq("id", user.id)
    .single();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 py-12 text-center">
      <p className="font-label text-xs uppercase tracking-[0.25em] text-ink-muted">
        Phase 2 ・ 認証確認用の仮画面
      </p>
      <h1 className="font-display text-3xl font-semibold text-ink">
        ようこそ、{profile?.display_name ?? user.email}さん
      </h1>
      <p className="text-sm text-ink-muted">@{profile?.username}</p>

      <form action={logout} className="mt-6">
        <button
          type="submit"
          className="rounded-lg border border-band px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface-raised"
        >
          ログアウト
        </button>
      </form>
    </main>
  );
}
