import type { CSSProperties } from "react";
import "../../../design/report-hero.css";

/** Attachment order is shared across chapter readers and presentation pages. */
export function chapterHeroStyle(index: number, _chapterLabel = ""): CSSProperties {
  const photo = (Math.max(0, index) % 9) + 1;
  return { backgroundImage: `linear-gradient(90deg, rgba(9,17,34,.94), rgba(9,17,34,.65) 45%, rgba(9,17,34,.12) 75%), url("${import.meta.env.BASE_URL}report-assets/bandra-chapter-hero-${photo}.png")` };
}
