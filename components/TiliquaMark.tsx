"use client";

import { useState } from "react";

/**
 * トップページのブランドロゴ。
 * ホバー／フォーカス時にだけ、名前の由来である "Qualiti"（quality の並び替え）が
 * 舌のブルーでちらりとのぞく。普段は地味な体色、驚いたときだけ見える
 * アオジタトカゲの青い舌になぞらえた、このアプリ唯一の仕掛け。
 */
export function TiliquaMark() {
  const [revealed, setRevealed] = useState(false);

  return (
    <div
      className="inline-flex flex-col items-start"
      onMouseEnter={() => setRevealed(true)}
      onMouseLeave={() => setRevealed(false)}
      onFocus={() => setRevealed(true)}
      onBlur={() => setRevealed(false)}
    >
      <h1
        tabIndex={0}
        className="font-display text-6xl font-bold tracking-tight text-ink sm:text-8xl cursor-default select-none"
      >
        Tiliqua
      </h1>
      <div
        aria-hidden={!revealed}
        className={`mt-2 font-label text-sm tracking-[0.2em] text-tongue transition-opacity duration-300 ${
          revealed ? "opacity-100" : "opacity-0"
        }`}
      >
        = QUALITI
      </div>
    </div>
  );
}
