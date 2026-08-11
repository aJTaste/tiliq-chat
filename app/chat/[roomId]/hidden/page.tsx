import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AuthGate } from "@/components/auth/AuthGate";
import { HiddenMessagesList } from "@/components/chat/HiddenMessagesList";

/**
 * FR-18: 非表示メッセージ一覧。チャットオプションメニューからの導線を想定。
 * auth_scope_hidden_listはアカウント単位の設定（部屋ごとではない）なので、
 * どの部屋の一覧を開いてもAuthGateのscopeKeyは共通の"hidden-list"を使う
 * （一度解錠すればこのタブセッション中は他の部屋の一覧も再入力不要）。
 */
export default async function HiddenMessagesPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: membership } = await supabase
    .from("room_members")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    notFound();
  }

  const { data: settings } = await supabase
    .from("user_settings")
    .select("auth_scope_hidden_list")
    .eq("user_id", user.id)
    .single();

  const gated = settings?.auth_scope_hidden_list ?? false;
  const body = <HiddenMessagesList roomId={roomId} currentUserId={user.id} />;

  if (gated) {
    return (
      <AuthGate scopeKey="hidden-list" title="非表示メッセージ一覧の認証">
        {body}
      </AuthGate>
    );
  }

  return body;
}
