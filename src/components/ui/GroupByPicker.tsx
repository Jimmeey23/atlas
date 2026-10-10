import { useState } from "react";
import { GripVertical, X } from "lucide-react";
import { DropdownField } from "./DropdownField";
import { readLocal } from "../../data/control-storage";
import type { GroupField } from "../../data/group-fields";

/**
 * Multi-level group-by control: change, add, remove and drag to reorder levels.
 * `fields` usually comes from useGroupFields(source); computed dimensions may be mixed in.
 */
export function GroupByPicker({ value, onChange, fields, name = "Table", label = "Group by", min = 1, max = 4, defaults, emptyLabel }: {
  value: string[]; onChange: (next: string[]) => void; fields: GroupField[]; name?: string; label?: string;
  min?: number; max?: number; defaults?: string[]; emptyLabel?: string;
}) {
  const [drag, setDrag] = useState(-1);
  const labelled = (f: string) => fields.find((x) => x.field === f)?.label ?? f;
  const options = (current: string) => fields.filter((f) => f.field === current || !value.includes(f.field));
  const set = (next: string[]) => onChange(next.filter(Boolean));
  const changed = defaults && defaults.join() !== value.join();
  return <div className="grouping group-by-picker" role="group" aria-label={`${name} grouping`}>
    <span>{label}</span>
    {!value.length && emptyLabel && <span className="group-chip group-chip-empty">{emptyLabel}</span>}
    {value.map((g, i) => <div className="group-chip" key={`${i}:${g}`} draggable={value.length > 1}
      onDragStart={() => setDrag(i)} onDragOver={(e) => e.preventDefault()}
      onDrop={() => { if (drag < 0 || drag === i) return; const next = [...value]; next.splice(i, 0, next.splice(drag, 1)[0]); setDrag(-1); set(next); }}>
      {value.length > 1 && <GripVertical size={10} aria-hidden="true" />}
      <DropdownField aria-label={`${name} grouping level ${i + 1}`} title={labelled(g)} value={g}
        onChange={(e) => set(value.map((x, j) => (j === i ? e.target.value : x)))}>
        {options(g).map((f) => <option key={f.field} value={f.field}>{f.label}</option>)}
      </DropdownField>
      {value.length > min && <button type="button" className="group-chip-remove" aria-label={`Remove ${labelled(g)} grouping`}
        onClick={() => set(value.filter((_, j) => j !== i))}><X size={10} /></button>}
    </div>)}
    {value.length < max && options("").length > 0 && <DropdownField className="group-add" aria-label={`Add ${name} grouping level`} value=""
      onChange={(e) => e.target.value && set([...value, e.target.value])}>
      <option value="">{value.length ? "+ Then by…" : "+ Group by…"}</option>
      {options("").map((f) => <option key={f.field} value={f.field}>{f.label}</option>)}
    </DropdownField>}
    {changed && <button type="button" className="group-reset" onClick={() => onChange(defaults!)}>Reset</button>}
  </div>;
}

const storageKey = (key: string) => `atlas-groups:${key}`;
/** Per-table grouping remembered in this browser; falls back to `defaults` when unset or corrupt. */
export function usePersistentGroups(key: string, defaults: string[]) {
  const [groups, setGroups] = useState<string[]>(() => {
    const saved = readLocal<unknown>(storageKey(key), null);
    return Array.isArray(saved) && saved.every((g) => typeof g === "string") ? saved : defaults;
  });
  const update = (next: string[]) => {
    setGroups(next);
    try {
      if (next.join() === defaults.join()) localStorage.removeItem(storageKey(key));
      else localStorage.setItem(storageKey(key), JSON.stringify(next));
    } catch { /* storage is optional */ }
  };
  return [groups, update] as const;
}
