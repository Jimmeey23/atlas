import { create } from "zustand";
import { filterFields, type FilterGroup } from "../data/advanced-controls";
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
export const consolidatedLabels: Record<number, string> = {
  1: "Studio operations",
};
export const parentTab = (tab: number) => {
  for (const [parent, members] of Object.entries(consolidated))
    if (members.includes(tab)) return Number(parent);
  return tab;
};
export const navigationOrder = [0, 4, 8, 5, 6, 12, 1, 14, 3, 15, 13, 11];
export interface Filters {
  advanced?: FilterGroup;
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
let privateScope:
  | { filters: Filters; transient: { field: string; value: string }[] }
  | undefined;
try {
  if (params.has("localScope"))
    privateScope =
      JSON.parse(
        localStorage.getItem(
          "atlas-private-scope-" + params.get("localScope"),
        ) || "null",
      ) || undefined;
} catch {}
export const missingPrivateScope = params.has("localScope") && !privateScope;
let lastPrivateScope = "",
  lastPrivateToken = "";
let initial: Partial<Filters> = {};
try {
  initial = privateScope?.filters || JSON.parse(params.get("f") || "{}");
} catch {}
// Cross-filters are part of what someone sees, so a shared link must carry them.
let initialTransient: { field: string; value: string }[] = [];
try {
  const parsed = privateScope?.transient || JSON.parse(params.get("x") || "[]");
  if (Array.isArray(parsed))
    initialTransient = parsed.filter(
      (t) => t && typeof t.field === "string" && typeof t.value === "string",
    );
} catch {}
// Grouping and columns are per-tab preferences; a link may override them for
// this visit without overwriting what the viewer has saved locally.
export const linkedLayout: {
  tab: number;
  groups?: string[];
  columns?: string[];
} | null = (() => {
  const read = (key: string) => {
    try {
      const v = JSON.parse(params.get(key) || "null");
      return Array.isArray(v) && v.every((x) => typeof x === "string")
        ? v
        : undefined;
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
export interface ScopeSnapshot {
  tab: number;
  view: string;
  filters: Filters;
  compare: string;
  transient: { field: string; value: string }[];
}
const scopeOf = (s: Store): ScopeSnapshot => ({
  tab: s.tab,
  view: s.view,
  filters: s.filters,
  compare: s.compare,
  transient: s.transient,
});
interface Store {
  past: ScopeSnapshot[];
  future: ScopeSnapshot[];
  undo: () => void;
  redo: () => void;
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
  past: [],
  future: [],
  undo: () => {
    const s = get();
    const previous = s.past.at(-1);
    if (previous)
      set({
        ...previous,
        past: s.past.slice(0, -1),
        future: [scopeOf(s), ...s.future],
      });
  },
  redo: () => {
    const s = get();
    const next = s.future[0];
    if (next)
      set({
        ...next,
        past: [...s.past, scopeOf(s)].slice(-40),
        future: s.future.slice(1),
      });
  },
  view:
    params.get("view") === "performance-marketing"
      ? "performance-marketing"
      : "",
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
  compare: params.get("compare") || "none",
  rate: Number(localStorage.getItem("floor-rate") || 1200),
  transient: initialTransient,
  set: (patch) => {
    const s = get();
    const next = {
      ...(patch.tab != null && patch.view == null ? { view: "" } : {}),
      ...patch,
      ...(patch.tab != null ? { tab: parentTab(patch.tab) } : {}),
    };
    const changed =
      JSON.stringify(scopeOf({ ...s, ...next })) !== JSON.stringify(scopeOf(s));
    set({
      ...next,
      ...(changed
        ? { past: [...s.past, scopeOf(s)].slice(-40), future: [] }
        : {}),
    });
  },
  filter: (patch) => get().set({ filters: { ...get().filters, ...patch } }),
  cross: (field, value) =>
    get().set({
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
  const identityFields = new Set(["member", "member_id", "email", "phone"]);
  const privateSelection =
    filterFields(s.filters.advanced).some((field) =>
      identityFields.has(field),
    ) || s.transient.some((item) => identityFields.has(item.field));
  if (privateSelection) {
    const saved = JSON.stringify({
      filters: s.filters,
      transient: s.transient,
    });
    if (saved !== lastPrivateScope) {
      lastPrivateScope = saved;
      lastPrivateToken = crypto.randomUUID();
      localStorage.setItem("atlas-private-scope-" + lastPrivateToken, saved);
    }
    p.set("localScope", lastPrivateToken);
  }
  p.set(
    "f",
    JSON.stringify(
      privateSelection ? { ...s.filters, advanced: undefined } : s.filters,
    ),
  );
  p.set("compare", s.compare);
  const linkCross = s.transient.filter(
    (item) => !identityFields.has(item.field),
  );
  if (linkCross.length) p.set("x", JSON.stringify(linkCross));
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
export const publishLayout = (
  read: () => { groups?: string[]; columns?: string[] },
) => {
  layoutParams = read;
};
export const PERFORMANCE_MARKETING_VIEW = "performance-marketing";
export const savedPresets: { name: string; tab: number; view?: string }[] = [
  { name: "Monday review", tab: 0 },
  { name: "Schedule audit", tab: 2 },
  { name: "Trainer one-to-ones", tab: 3 },
  { name: "Month-end close", tab: 10 },
  { name: "Performance Marketing", tab: 8, view: PERFORMANCE_MARKETING_VIEW },
];
