import test from "node:test";
import assert from "node:assert/strict";
const values = new Map<string, string>();
Object.assign(globalThis, {
  location: { search: "?tab=4&compare=none" },
  localStorage: {
    getItem: (key: string) => values.get(key) || null,
    setItem: (key: string, value: string) => values.set(key, value),
  },
  document: { documentElement: { dataset: {} } },
  history: {
    replaceState: (_state: unknown, _title: string, url: string) => {
      (globalThis as any).location.search = url;
    },
  },
});
const { useStore, emptyFilters } = await import("../src/state/store.ts");
test("undo and redo restore scopes, comparisons and consolidated navigation", () => {
  const initial = useStore.getState();
  useStore.getState().filter({ from: "2026-01-01", to: "2026-01-31" });
  useStore.getState().set({ compare: "year" });
  assert.equal(useStore.getState().past.length, 2);
  useStore.getState().undo();
  assert.equal(useStore.getState().compare, "none");
  assert.equal(useStore.getState().filters.from, "2026-01-01");
  useStore.getState().undo();
  assert.deepEqual(useStore.getState().filters, initial.filters);
  useStore.getState().redo();
  useStore.getState().redo();
  assert.equal(useStore.getState().compare, "year");
  useStore.getState().set({ tab: 2 });
  assert.equal(useStore.getState().tab, 1);
  useStore.getState().undo();
  assert.equal(useStore.getState().tab, 4);
  useStore.getState().filter({ location: ["Bandra"] });
  assert.equal(
    useStore.getState().future.length,
    0,
    "a new scope replaces the redo branch",
  );
});
test("member-specific filter values stay out of URL parameters", () => {
  useStore
    .getState()
    .set({
      filters: {
        ...emptyFilters,
        advanced: {
          id: "root",
          join: "and",
          rules: [
            {
              id: "member",
              field: "member_id",
              operator: "eq",
              value: "private-member-123",
            },
          ],
        },
      },
    });
  const search = (globalThis as any).location.search as string;
  assert.ok(!decodeURIComponent(search).includes("private-member-123"));
  const params = new URLSearchParams(search);
  assert.ok(params.get("localScope"));
  assert.ok(
    values
      .get("atlas-private-scope-" + params.get("localScope"))
      ?.includes("private-member-123"),
  );
});
