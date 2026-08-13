import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AuthGate } from "@/components/auth/AuthGate";
import { HiddenMessagesList } from "@/components/chat/HiddenMessagesList";

/**
 * FR-18: 非表示メッセージ一覧。チャットオプションメニューからの導線を想定。
 * auth_scope_hidden_listはアカウント単位の設定（部屋ごとではない）なので、
 * どの部屋の一覧を開いてもAuthGateのscopeKeyは共通の"hidden-list"を使う
 * （一度解錠すればこのタブセッション中は他の部屋の一覧も再入力不要）。
 *
 * Phase 18: このページは永続サイドバーシェル（app/(shell)/layout.tsx）の
 * ルートグループ外の独立ページのため、シェル側の起動時ゲート（AuthGate
 * scopeKey="launch"）による保護を一切受けない。従来auth_scope_hidden_list
 * のみでゲート要否を判定していたため、起動時ゲートが有効でもこのページを
 * 直接URLで開けば素通りできる抜け道があった（app/(shell)/chat/[roomId]/page.tsx
 * がPhase 17で対応した問題と同型）。そのため起動時ゲートもここで独立して
 * チェックし、いずれか一方でも有効なら認証を要求する。
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

  const [membershipResult, settingsResult] = await Promise.all([
    supabase
      .from("room_members")
      .select("id")
      .eq("room_id", roomId)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("user_settings")
      .select("auth_scope_hidden_list, auth_scope_launch")
      .eq("user_id", user.id)
      .single(),
  ]);

  const membership = membershipResult.data;

  if (!membership) {
    notFound();
  }

  const settings = settingsResult.data;
  const hiddenListGateEnabled = settings?.auth_scope_hidden_list ?? false;
  const launchGateEnabled = settings?.auth_scope_launch ?? false;
  const needsGate = hiddenListGateEnabled || launchGateEnabled;

  const body = <HiddenMessagesList roomId={roomId} currentUserId={user.id} />;

  if (needsGate) {
    // hidden-list専用のゲートが有効ならそちらを優先（従来通りの専用スコープ）。
    // 専用ゲートがオフで起動時ゲートだけが有効な場合はlaunchスコープを再利用する
    // （シェル側で既に解錠済みのタブでは再入力不要になる。app/(shell)/chat/[roomId]/page.tsx
    // と同じ考え方）。
    const scopeKey = hiddenListGateEnabled ? "hidden-list" : "launch";
    const title = hiddenListGateEnabled
      ? "非表示メッセージ一覧の認証"
      : "起動時の認証";

    return (
      <AuthGate scopeKey={scopeKey} title={title}>
        {body}
      </AuthGate>
    );
  }

  return body;
}
