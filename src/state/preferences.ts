import { create } from "zustand";
export const themeOptions = [
  { id: "matte", name: "Matte", type: "Dark" },
  { id: "gloss", name: "Gloss", type: "Light" },
  { id: "midnight", name: "Midnight blue", type: "Dark" },
  { id: "obsidian", name: "Obsidian soft", type: "Dark · Neumorphic" },
  { id: "dark-glass", name: "Nocturne glass", type: "Dark · Glass" },
  { id: "ivory", name: "Warm ivory", type: "Light" },
  { id: "porcelain", name: "Porcelain soft", type: "Light · Neumorphic" },
  { id: "light-glass", name: "Daylight glass", type: "Light · Glass" },
];
export const sections = [
  "metrics",
  "charts",
  "register",
  "rankings",
  "heatmap",
  "monthly",
  "secondary",
  "retention",
  "sources",
  "insights",
  "saved",
] as const;
export type Section = (typeof sections)[number];
export type PagePreference = {
  name?: string;
  hidden?: boolean;
  sections?: Partial<Record<Section, boolean>>;
  groups?: string[];
  columns?: string[];
  columnSizing?: Record<string, number>;
  heading?: string;
  subtitle?: string;
  accent?: string;
  sectionTitles?: Record<string, string>;
};
export const defaultPreferences = {
  fontSize: 13,
  radius: 12,
  chartHeight: 320,
  contentWidth: 0,
  animation: true,
  legend: true,
  grid: true,
  chatWidth: 580,
  chatModel: "gpt-4.1",
  chatTokens: 3500,
  chatEvidence: true,
  chatSaveHistory: true,
  page: {} as Record<number, PagePreference>,
};
export type Preferences = typeof defaultPreferences;
function load() {
  try {
    return {
      ...defaultPreferences,
      ...JSON.parse(localStorage.getItem("atlas-preferences") || "{}"),
    };
  } catch {
    return { ...defaultPreferences };
  }
}
export const usePreferences = create<{
  preferences: Preferences;
  update: (p: Partial<Preferences>) => void;
  page: (id: number, p: PagePreference) => void;
}>((set) => ({
  preferences: load(),
  update: (p) => set((s) => ({ preferences: { ...s.preferences, ...p } })),
  page: (id, p) =>
    set((s) => ({
      preferences: {
        ...s.preferences,
        page: {
          ...s.preferences.page,
          [id]: { ...s.preferences.page[id], ...p },
        },
      },
    })),
}));
usePreferences.subscribe((s) => {
  localStorage.setItem("atlas-preferences", JSON.stringify(s.preferences));
  window.dispatchEvent(new Event("p57-preferences"));
});
export function hydratePreferences() {
  usePreferences.getState().update(load());
}
