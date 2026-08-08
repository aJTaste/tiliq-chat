import type { Tables } from "@/types/supabase";
import { buildChatImageUrl } from "@/lib/cloudinary/url";

type MessageRow = Tables<"messages">;

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function MessageBubble({
  message,
  isOwn,
}: {
  message: MessageRow;
  isOwn: boolean;
}) {
  return (
    <div className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${
          isOwn ? "bg-tongue text-white" : "bg-surface-raised text-ink"
        }`}
      >
        {message.content && (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        )}
        {message.image_url && (
          // next/image（Vercelの画像最適化API）は使わず、Cloudinary側のf_auto,q_auto変換URLを
          // そのまま<img>で配信する（詳細はlib/cloudinary/url.tsのコメント参照）
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={buildChatImageUrl(message.image_url)}
            alt=""
            loading="lazy"
            decoding="async"
            className="mt-1 max-h-64 w-auto max-w-full rounded-lg"
          />
        )}
        <p
          className={`mt-1 text-right text-[10px] ${
            isOwn ? "text-white/70" : "text-ink-muted"
          }`}
        >
          {formatTime(message.created_at)}
        </p>
      </div>
    </div>
  );
}
