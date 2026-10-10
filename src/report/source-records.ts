import { groupValueSQL } from '../data/group-fields';
import type { GroupTable } from './model';
/** Match the complete saved grouping label; never split labels containing the separator. */
export function recordGroupConstraint(table: GroupTable | undefined, group: string | undefined) {
  if (!table || group == null) return '';
  const fields = table.fields ?? [table.field];
  if (!fields.length) throw new Error('The breakdown has no grouping fields');
  const values = fields.map(field => groupValueSQL(field));
  const expression = values.length > 1 ? `CONCAT(${values.join(", ' · ', ")})` : values[0];
  return ` WHERE ${expression}='${group.replaceAll("'", "''")}'`;
}
