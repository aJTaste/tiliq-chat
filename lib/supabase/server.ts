import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/supabase";

/**
 * Server Component / Server Action から呼び出すSupabaseクライアント。
 * Next.js 16ではcookies()が非同期のためawaitが必須。
 *
 * setAllがtry/catchで囲まれているのは、Server Component内から呼ばれた場合
 * cookieStore.set()が失敗する仕様のため（読み取り専用コンテキスト）。
 * その場合のセッションリフレッシュはproxy.tsが担当するので無視してよい。
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Componentからの呼び出し時は無視（proxy.tsが担当）
          }
        },
      },
    },
  );
}
