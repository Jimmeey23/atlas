import { create } from "zustand";
import { relativePeriod } from "../data/periods";
export const tabs = [
  "Business overview",
  "Studio operations",
  "Schedule & capacity",
  "Instructor performance",
  "Revenue & sales",
  "Conversion & Acquisition",
  "Renewals & retention",
  "Booking behaviour",
  "Leads & Sales Funnel",
  "Member attendance",
  "Instructor economics",
  "Data quality",
  "Late cancellations",
  "AI workspace",
  "Format comparison",
  "Monthly report",
];
// Instructor economics (10) now renders inside Instructor performance (3), so
// it keeps its index for saved views and insight links but leaves the nav.
// Legacy studio workspace indices resolve to one operations page.
export const consolidated: Record<number, number[]> = { 1: [1, 2, 9, 7] };
export const consolidatedLabels: Record<number, string> = { 1: "Studio operations" };
export const parentTab = (tab: number) => {
  for (const [parent, members] of Object.entries(consolidated))
    if (members.includes(tab)) return Number(parent);
  return tab;
};
export const navigationOrder = [0, 4, 8, 5, 6, 12, 1, 14, 3, 15, 13, 11];
export interface Filters {
  from: string;
  to: string;
  location: string[];
  trainer: string[];
  format: string[];
  source: string[];
  category: string[];
  day: string[];
  time: string[];
  memberType: string;
  imports: boolean;
  sessionType: string;
  capacityBand: string;
}
const params = new URLSearchParams(location.search);
let initial: Partial<Filters> = {};
try {
  initial = JSON.parse(params.get("f") || "{}");
} catch {}
// Cross-filters are part of what someone sees, so a shared link must carry them.
let initialTransient: { field: string; value: string }[] = [];
try {
  const parsed = JSON.parse(params.get("x") || "[]");
  if (Array.isArray(parsed))
    initialTransient = parsed.filter(
      (t) => t && typeof t.field === "string" && typeof t.value === "string",
    );
} catch {}
// Grouping and columns are per-tab preferences; a link may override them for
// this visit without overwriting what the viewer has saved locally.
export const linkedLayout: { tab: number; groups?: string[]; columns?: string[] } | null =
  (() => {
    const read = (key: string) => {
      try {
        const v = JSON.parse(params.get(key) || "null");
        return Array.isArray(v) && v.every((x) => typeof x === "string") ? v : undefined;
      } catch {
        return undefined;
      }
    };
    const groups = read("g"),
      columns = read("c");
    return groups || columns
      ? { tab: Number(params.get("tab") || 0), groups, columns }
      : null;
  })();
export const emptyFilters: Filters = {
  from: "",
  to: "",
  location: [],
  trainer: [],
  format: [],
  source: [],
  category: [],
  day: [],
  time: [],
  memberType: "all",
  imports: false,
  sessionType: "all",
  capacityBand: "all",
};
interface Store {
  view: string;
  tab: number;
  theme: string;
  density: string;
  filters: Filters;
  filterOpen: boolean;
  signalOpen: boolean;
  compare: string;
  rate: number;
  transient: { field: string; value: string }[];
  set: (s: Partial<Store>) => void;
  filter: (s: Partial<Filters>) => void;
  cross: (field: string, value: string) => void;
}
export const useStore = create<Store>((set, get) => ({
  view: params.get("view") === "performance-marketing" ? "performance-marketing" : "",
  tab: parentTab(Math.min(15, Math.max(0, Number(params.get("tab") || 0)))),
  theme: localStorage.getItem("floor-theme") || "matte",
  density: localStorage.getItem("floor-density") || "compact",
  filters: {
    ...emptyFilters,
    ...(!params.has("f") ? relativePeriod("Last month") : {}),
    ...initial,
  },
  filterOpen: false,
  signalOpen: false,
  compare: params.get("compare") || "prior",
  rate: Number(localStorage.getItem("floor-rate") || 1200),
  transient: initialTransient,
  set: (s) => set({ ...(s.tab != null && s.view == null ? {view: ""} : {}), ...s, ...(s.tab != null ? { tab: parentTab(s.tab) } : {}) }),
  filter: (s) => set({ filters: { ...get().filters, ...s } }),
  cross: (field, value) =>
    set({
      transient: [
        ...get().transient.filter((t) => t.field !== field),
        { field, value },
      ],
    }),
}));
function writeState(s: Store) {
  document.documentElement.dataset.theme = s.theme;
  document.documentElement.dataset.density = s.density;
  localStorage.setItem("floor-theme", s.theme);
  localStorage.setItem("floor-density", s.density);
  localStorage.setItem("floor-rate", String(s.rate));
  const p = new URLSearchParams();
  p.set("tab", String(s.tab));
  if (s.view) p.set("view", s.view);
  p.set("f", JSON.stringify(s.filters));
  p.set("compare", s.compare);
  if (s.transient.length) p.set("x", JSON.stringify(s.transient));
  const layout = layoutParams();
  if (layout.groups) p.set("g", JSON.stringify(layout.groups));
  if (layout.columns) p.set("c", JSON.stringify(layout.columns));
  history.replaceState(null, "", `?${p}`);
}
useStore.subscribe(writeState);
// Grouping and column changes live outside the store; they call this to keep
// the address bar a complete description of the current view.
export const syncUrl = () => writeState(useStore.getState());
// App owns the active grouping and columns; it registers them here so the URL
// subscription above can keep a shareable link in sync without a circular import.
let layoutParams: () => { groups?: string[]; columns?: string[] } = () => ({});
export const publishLayout = (read: () => { groups?: string[]; columns?: string[] }) => {
  layoutParams = read;
};
export const PERFORMANCE_MARKETING_VIEW = "performance-marketing";
export const savedPresets: {name: string; tab: number; view?: string}[] = [
  { name: "Monday review", tab: 0 },
  { name: "Schedule audit", tab: 2 },
  { name: "Trainer one-to-ones", tab: 3 },
  { name: "Month-end close", tab: 10 },
  { name: "Performance Marketing", tab: 8, view: PERFORMANCE_MARKETING_VIEW },
];
