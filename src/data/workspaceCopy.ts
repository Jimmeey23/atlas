import { useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  Building2,
  CalendarClock,
  GraduationCap,
  IndianRupee,
  UserPlus,
  RefreshCcw,
  CalendarCheck,
  GitBranch,
  Users,
  Calculator,
  ShieldCheck,
  CalendarX2,
  Sparkles,
  ChartNoAxesCombined,
  FileText,
} from "lucide-react";
export const workspaceIcons = [
  LayoutDashboard,
  Building2,
  CalendarClock,
  GraduationCap,
  IndianRupee,
  UserPlus,
  RefreshCcw,
  CalendarCheck,
  GitBranch,
  Users,
  Calculator,
  ShieldCheck,
  CalendarX2,
  Sparkles,
  ChartNoAxesCombined,
  FileText,
];
const titles = [
  [
    "See the business clearly.",
    "Find the signals that deserve a decision.",
    "Your studio business, in perspective.",
  ],
  [
    "See how each studio performs.",
    "Understand the story behind each studio.",
    "Compare your practice spaces.",
  ],
  [
    "Make every slot count.",
    "Find the room in your timetable.",
    "Match the schedule to demand.",
  ],
  [
    "Understand instructor performance.",
    "See who fills the room.",
    "Follow the impact of your instructors.",
  ],
  [
    "Follow the money through the business.",
    "Understand what drives sales.",
    "See where revenue comes from.",
  ],
  [
    "Follow the newcomer journey.",
    "Understand the path from first visit to membership.",
    "See how your community grows.",
  ],
  [
    "Keep the community coming back.",
    "Understand renewal and retention patterns.",
    "See where continuity needs attention.",
  ],
  [
    "Understand how members book.",
    "See the patterns behind booked seats.",
    "Explore booking habits and attendance.",
  ],
  [
    "Follow the sales funnel.",
    "See how interest progresses to membership.",
    "Understand your lead pipeline.",
  ],
  [
    "Follow the rhythm of member attendance.",
    "See who is returning to practice.",
    "Understand your active community.",
  ],
  [
    "Understand instructor economics.",
    "Connect instructor activity with source-backed value.",
    "Review the economics of instruction.",
  ],
  [
    "Know what your data can support.",
    "Inspect the sources behind your decisions.",
    "Find the gaps in source coverage.",
  ],
  [
    "Recover the seats lost to late cancellations.",
    "See where late cancellations cluster.",
    "Understand the last-minute gaps.",
  ],
  [
    "Turn questions into clear answers.",
    "Explore your data with the intelligence workspace.",
    "Build an analysis from your next question.",
  ],
  [
    "Compare your signature formats.",
    "See each format from every angle.",
    "Understand the balance between formats.",
  ],
  [
    "Bring the monthly story together.",
    "Present the decisions behind the numbers.",
    "Build a report from the source evidence.",
  ],
];
const subtitles = [
  [
    "Review attendance, capacity and session-attributed value in the current scope.",
    "Connect the business signals with source-backed operating decisions.",
  ],
  [
    "Compare attendance, utilization and value across the selected studios.",
    "Explore studio differences before choosing where to focus.",
  ],
  [
    "Explore day, time and format patterns behind seat utilization.",
    "Inspect supply and demand across the selected timetable.",
  ],
  [
    "Compare instruction with attendance, yield and slot-adjusted demand.",
    "Explore instructor results alongside the sessions they teach.",
  ],
  [
    "Review source-recorded collections, buyers and purchase patterns.",
    "Inspect successful sales and understand what contributes to collections.",
  ],
  [
    "Explore first-visit cohorts, conversion outcomes and repeat practice.",
    "Follow source-reported newcomer outcomes from trial to ongoing membership.",
  ],
  [
    "Review renewal cohorts, membership continuity and retention signals.",
    "Inspect expiring access and the source evidence behind renewal outcomes.",
  ],
  [
    "Explore attended, cancelled and unclaimed bookings in this scope.",
    "Inspect booking outcomes alongside day and time patterns.",
  ],
  [
    "Explore source lead stages, ownership and sales progression.",
    "Inspect the pipeline from recorded enquiry to membership sold.",
  ],
  [
    "Review community attendance and repeat-visit patterns.",
    "Inspect member activity across the selected sessions and studios.",
  ],
  [
    "Review recorded instructor revenue, costs and contribution.",
    "Explore source-backed instructor value alongside its measurement limits.",
  ],
  [
    "Inspect missing fields, source freshness and calculation coverage.",
    "Review source health before interpreting unavailable measures.",
  ],
  [
    "Explore affected members, sessions and recorded booking values.",
    "Inspect the recurring day and time patterns in late-cancelled bookings.",
  ],
  [
    "Ask about the source data or create a reusable analysis element.",
    "Use the available tools to inspect data and build a source-backed view.",
  ],
  [
    "Compare demand, utilization and session-attributed value across formats.",
    "Inspect weighted rates and per-session measures on a common scorecard.",
  ],
  [
    "Build an evidence-backed review of the selected reporting month.",
    "Bring the monthly metrics, explanations and decisions into presentation view.",
  ],
];
export function useWorkspaceCopy(tab: number, defaultSubtitle: string) {
  const last = useRef<Record<number, number>>({});
  const choose = (page: number) => {
    const options = titles[page] ?? titles[0];
    const candidates = options
      .map((_, i) => i)
      .filter((i) => i !== last.current[page]);
    const index =
      candidates[Math.floor(Math.random() * candidates.length)] ?? 0;
    last.current[page] = index;
    return {
      tab: page,
      title: options[index],
      subtitle:
        index === 0
          ? defaultSubtitle
          : (subtitles[page]?.[index - 1] ?? defaultSubtitle),
    };
  };
  const [copy, setCopy] = useState(() => choose(tab));
  useEffect(() => {
    if (copy.tab !== tab) setCopy(choose(tab));
  }, [tab, copy.tab]);
  return copy.tab === tab
    ? copy
    : { title: titles[tab]?.[0], subtitle: defaultSubtitle };
}
