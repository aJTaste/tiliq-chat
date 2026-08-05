import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/supabase";

/**
 * ブラウザ（Client Component）から呼び出すSupabaseクライアント。
 * Cookieの読み書きは@supabase/ssrが自動でdocument.cookie経由で処理するため、
 * cookiesオプションを渡す必要はない。
 * Phase 3からDatabase型を適用。テーブル名・カラム名の補完と型チェックが効くようになる。
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
