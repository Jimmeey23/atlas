import type { Row } from "./duckdb";
import type { TreeRow } from "../components/NestedTable";
export function tree(rows: Row[], groups: string[]): TreeRow[] {
  const roots: TreeRow[] = [];
  const map = new Map<string, TreeRow>();
  for (const row of rows) {
    const depth = groups.length - Math.round(Math.log2(Number(row.level) + 1));
    const path = groups.slice(0, depth).map((field, i) => ({
      field,
      value: String(row["g" + i] ?? "Unspecified"),
    }));
    const id = JSON.stringify(path);
    const node = {
      id,
      label: path.at(-1)!.value,
      path,
      values: row,
      children: [],
    };
    map.set(id, node);
  }
  for (const node of map.values()) {
    const parent = map.get(JSON.stringify(node.path.slice(0, -1)));
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}
