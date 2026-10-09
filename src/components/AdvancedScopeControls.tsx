import { useState } from "react";
import { useStore, type Filters } from "../state/store";
import { AdvancedFilterEditor } from "./AdvancedFilterEditor";
import { compileFilters, emptyGroup } from "../data/advanced-controls";
import { sqlTypes } from "../data/normalise";
import { DropdownField } from "./ui/DropdownField";
import { readLocal } from "../data/control-storage";
type Preset = { id: string; name: string; filters: Filters };
export function AdvancedScopeControls() {
  const store = useStore();
  const [draft, setDraft] = useState(
    () => store.filters.advanced || emptyGroup(),
  );
  const [presets, setPresets] = useState<Preset[]>(() =>
    readLocal("atlas-filter-presets", []),
  );
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const save = (next: Preset[]) => {
    setPresets(next);
    localStorage.setItem("atlas-filter-presets", JSON.stringify(next));
  };
  return (
    <details
      className="advanced-scope"
      onToggle={(e) => {
        if (e.currentTarget.open)
          setDraft(store.filters.advanced || emptyGroup());
      }}
    >
      <summary>
        Advanced filters & presets
        {store.filters.advanced?.rules.length
          ? ` · ${store.filters.advanced.rules.length} groups / conditions`
          : ""}
      </summary>
      <p className="muted">
        Global scope. Conditions apply to source fields; unavailable fields
        remain missing rather than being silently ignored.
      </p>
      <AdvancedFilterEditor value={draft} onChange={setDraft} />
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      <div className="advanced-actions">
        <button
          onClick={() => {
            try {
              compileFilters(draft, sqlTypes);
              store.filter({
                advanced: draft.rules.length ? draft : undefined,
              });
              setError("");
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Apply global conditions
        </button>
        <button
          onClick={() => {
            setDraft(emptyGroup());
            store.filter({ advanced: undefined });
            setError("");
          }}
        >
          Clear conditions
        </button>
      </div>
      <div className="advanced-actions">
        <input
          aria-label="Filter preset name"
          placeholder="Name this filter preset"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          disabled={!name.trim()}
          onClick={() => {
            save([
              ...presets,
              {
                id: crypto.randomUUID(),
                name: name.trim(),
                filters: structuredClone(store.filters),
              },
            ]);
            setName("");
          }}
        >
          Save current filters
        </button>
        <DropdownField
          aria-label="Apply saved filter preset"
          value=""
          onChange={(e) => {
            const p = presets.find((p) => p.id === e.target.value);
            if (p) {
              store.set({ filters: p.filters, transient: [] });
              setDraft(p.filters.advanced || emptyGroup());
            }
          }}
        >
          <option value="">Saved presets…</option>
          {presets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </DropdownField>
      </div>
      {!!presets.length && (
        <div className="advanced-preset-list">
          {presets.map((p) => (
            <span key={p.id}>
              {p.name}
              <button
                aria-label={`Delete filter preset ${p.name}`}
                onClick={() => save(presets.filter((v) => v.id !== p.id))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </details>
  );
}
