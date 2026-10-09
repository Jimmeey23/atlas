import { DropdownField } from "./ui/DropdownField";
import {
  emptyGroup,
  isGroup,
  type FilterGroup,
  type FilterRule,
} from "../data/advanced-controls";
import { sqlTypes } from "../data/normalise";
export const fieldLabel = (field: string) =>
  field.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
export function AdvancedFilterEditor({
  value,
  onChange,
  depth = 0,
}: {
  value: FilterGroup;
  onChange: (group: FilterGroup) => void;
  depth?: number;
}) {
  const update = (id: string, next: FilterRule | FilterGroup) =>
    onChange({
      ...value,
      rules: value.rules.map((rule) => (rule.id === id ? next : rule)),
    });
  return (
    <fieldset className="advanced-filter-group">
      <legend>{depth ? "Condition group" : "Advanced conditions"}</legend>
      <div className="advanced-group-actions">
        <label>
          Match
          <DropdownField
            aria-label={`Match conditions at level ${depth + 1}`}
            value={value.join}
            onChange={(e) =>
              onChange({ ...value, join: e.target.value as "and" | "or" })
            }
          >
            <option value="and">All conditions (AND)</option>
            <option value="or">Any condition (OR)</option>
          </DropdownField>
        </label>
        <button
          type="button"
          onClick={() =>
            onChange({
              ...value,
              rules: [
                ...value.rules,
                {
                  id: crypto.randomUUID(),
                  field: "location",
                  operator: "in",
                  value: "",
                },
              ],
            })
          }
        >
          Add condition
        </button>
        {depth < 3 && (
          <button
            type="button"
            onClick={() =>
              onChange({ ...value, rules: [...value.rules, emptyGroup()] })
            }
          >
            Add group
          </button>
        )}
      </div>
      {value.rules.map((rule) => (
        <div
          key={rule.id}
          className={
            isGroup(rule) ? "advanced-subgroup" : "advanced-filter-rule"
          }
        >
          {isGroup(rule) ? (
            <AdvancedFilterEditor
              value={rule}
              onChange={(next) => update(rule.id, next)}
              depth={depth + 1}
            />
          ) : (
            <>
              <DropdownField
                aria-label="Condition field"
                value={rule.field}
                onChange={(e) =>
                  update(rule.id, {
                    ...rule,
                    field: e.target.value,
                    value: "",
                    upper: "",
                  })
                }
              >
                {Object.keys(sqlTypes)
                  .filter(
                    (f) =>
                      ![
                        "email",
                        "phone",
                        "member",
                        "row_id",
                        "source_snapshot",
                      ].includes(f),
                  )
                  .sort()
                  .map((f) => (
                    <option key={f} value={f}>
                      {fieldLabel(f)}
                    </option>
                  ))}
              </DropdownField>
              <DropdownField
                aria-label="Condition operator"
                value={rule.operator}
                onChange={(e) =>
                  update(rule.id, {
                    ...rule,
                    operator: e.target.value as FilterRule["operator"],
                  })
                }
              >
                <option value="in">Include values</option>
                <option value="not_in">Exclude values</option>
                <option value="eq">Equals</option>
                <option value="neq">Does not equal</option>
                <option value="contains">Contains</option>
                <option value="not_contains">Does not contain</option>
                <option value="between">Between</option>
                <option value="gte">At least</option>
                <option value="lte">At most</option>
                <option value="missing">Is missing</option>
                <option value="present">Is present</option>
              </DropdownField>
              {!["missing", "present"].includes(rule.operator) && (
                <input
                  aria-label={`Value for ${fieldLabel(rule.field)}`}
                  type={
                    sqlTypes[rule.field] === "DOUBLE" &&
                    !["in", "not_in"].includes(rule.operator)
                      ? "number"
                      : "text"
                  }
                  value={rule.value}
                  placeholder={
                    ["in", "not_in"].includes(rule.operator)
                      ? "Separate values with |"
                      : "Value"
                  }
                  onChange={(e) =>
                    update(rule.id, { ...rule, value: e.target.value })
                  }
                />
              )}
              {rule.operator === "between" && (
                <input
                  aria-label="Range maximum"
                  type={sqlTypes[rule.field] === "DOUBLE" ? "number" : "text"}
                  value={rule.upper || ""}
                  onChange={(e) =>
                    update(rule.id, { ...rule, upper: e.target.value })
                  }
                  placeholder="Maximum"
                />
              )}
            </>
          )}
          <button
            type="button"
            aria-label={
              isGroup(rule) ? "Remove condition group" : "Remove condition"
            }
            onClick={() =>
              onChange({
                ...value,
                rules: value.rules.filter((r) => r.id !== rule.id),
              })
            }
          >
            Remove
          </button>
        </div>
      ))}
      {!value.rules.length && (
        <p className="muted">
          Add inclusion, exclusion, ranges or missing-value conditions.
        </p>
      )}
    </fieldset>
  );
}
