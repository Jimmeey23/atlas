import { create } from "zustand";
import { relativePeriod } from "../data/periods";
export const tabs = [
  "Business overview",
  "Studio experiences",
  "Schedule & capacity",
  "Instructor performance",
  "Revenue & sales",
  "Member acquisition",
  "Renewals & retention",
  "Booking behaviour",
  "Enquiries & conversion",
  "Member attendance",
  "Instructor economics",
  "Data quality",
  "Late cancellations",
  "AI workspace",
];
export const navigationOrder = [0, 4, 8, 5, 6, 9, 7, 12, 1, 2, 3, 10, 13, 11];
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
  tab: Math.min(13, Math.max(0, Number(params.get("tab") || 0))),
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
  transient: [],
  set: (s) => set(s),
  filter: (s) => set({ filters: { ...get().filters, ...s } }),
  cross: (field, value) =>
    set({
      transient: [
        ...get().transient.filter((t) => t.field !== field),
        { field, value },
      ],
    }),
}));
useStore.subscribe((s) => {
  document.documentElement.dataset.theme = s.theme;
  document.documentElement.dataset.density = s.density;
  localStorage.setItem("floor-theme", s.theme);
  localStorage.setItem("floor-density", s.density);
  localStorage.setItem("floor-rate", String(s.rate));
  const p = new URLSearchParams();
  p.set("tab", String(s.tab));
  p.set("f", JSON.stringify(s.filters));
  p.set("compare", s.compare);
  history.replaceState(null, "", `?${p}`);
});
export const savedPresets = [
  { name: "Monday review", tab: 0 },
  { name: "Schedule audit", tab: 2 },
  { name: "Trainer one-to-ones", tab: 3 },
  { name: "Month-end close", tab: 10 },
];
