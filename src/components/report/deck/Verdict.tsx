import { GitBranch, Crosshair, ShieldCheck, Activity, IndianRupee, Radar } from "lucide-react";
import type { InsightCard } from "../../../report/model";

/** Sentences as bullets; keeps decimals and ₹ amounts intact. */
export const sentences = (text?: string) => (text ?? "").split(/(?<=[.!?])\s+(?=[A-Z₹0-9“"(])/).map(s => s.trim()).filter(Boolean);

/**
 * Verdict categories a leadership team acts on: why it moved, where, what held up,
 * whether it lasts, what it is worth, the decision and the signal to watch.
 */
export const VERDICT_FACETS: { key: keyof InsightCard; label: string; question: string; icon: typeof GitBranch }[] = [
  { key: "driver", label: "Root cause", question: "Why did it move?", icon: GitBranch },
  { key: "concentration", label: "Where it concentrates", question: "Which segments carry it?", icon: Crosshair },
  { key: "offset", label: "What held up", question: "The counter-signal", icon: ShieldCheck },
  { key: "trend", label: "Structural or one-off?", question: "Will it last?", icon: Activity },
  { key: "impact", label: "Value at stake", question: "What is it worth?", icon: IndianRupee },
  { key: "watch", label: "Watch next month", question: "Leading indicator", icon: Radar },
];

/** A one-word durability label read from the AI's verdict, for the pill. */
export function durability(text: string) {
  const t = text.toLowerCase();
  return /one-?off|temporary|single month/.test(t) ? "One-off" : /season/.test(t) ? "Seasonal" : /revers/.test(t) ? "Reversing" : /persist|consecutive|sustained|for \d+ months|structural/.test(t) ? "Persistent" : /new\b|emerging|first/.test(t) ? "New" : "Mixed";
}
