import { createBrowserClient } from "@supabase/ssr";

/**
 * ブラウザ（Client Component）から呼び出すSupabaseクライアント。
 * Cookieの読み書きは@supabase/ssrが自動でdocument.cookie経由で処理するため、
 * cookiesオプションを渡す必要はない。
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
