import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

/**
 * service_roleキーを使う特権クライアント。RLSを完全にバイパスする。
 * 用途：
 *   - サインアップ時の adminClient.auth.admin.createUser()（MXバイパス）
 *   - サインアップ/ログイン時のユーザーID・メール重複チェック
 *     （未認証状態ではprofiles/user_settingsのRLSに阻まれるため）
 * 絶対にクライアントサイドに露出させないこと（Server Actionからのみ使用）。
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
