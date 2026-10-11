import type { ChapterSpec } from "./chapters";

type Breakdown = { id?: string; field: string; fields?: string[]; title: string; columns: string[] };

/** One table per distinct grouping, in the chapter's authored priority order. */
export function distinctBreakdowns<T extends Breakdown>(groups: T[]) {
  const seen = new Set<string>();
  return groups.filter(group => {
    const key = (group.fields ?? [group.field]).join("+");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function curatedBreakdowns<T extends Breakdown>(groups: T[], limit = 2) {
  return distinctBreakdowns(groups).slice(0, limit);
}

/** Configured source breakdowns that can actually be built from the loaded fields. */
export const explorerBreakdowns = (spec: Pick<ChapterSpec, "groups">, available: string[]) => distinctBreakdowns(spec.groups)
  .map(group => ({ id: group.id ?? group.field, title: group.title, fields: [...new Set([group.field, ...(group.fields ?? [])])].filter(field => available.includes(field)), metrics: group.columns }))
  .filter(group => group.fields.length);
