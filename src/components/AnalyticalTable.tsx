import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getExpandedRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnPinningState,
  type ColumnSizingState,
  type ExpandedState,
  type VisibilityState,
} from "@tanstack/react-table";
import { DropdownField } from "./ui/DropdownField";
export interface AnalyticalRow {
  id: string;
  period: string | null;
  segment: string;
  value: number | null;
  denominator: number | null;
  records: number;
  prior?: number | null;
  delta?: number | null;
  relative?: number | null;
  points?: number | null;
  children?: AnalyticalRow[];
  isSubtotal?: boolean;
}
export interface AnalyticalColumn {
  id: string;
  label: string;
  format: (value: unknown) => string;
}
export function AnalyticalTable({
  rows,
  groupTotals,
  columns,
  onSelect,
  onInspect,
  visibleRowsRef,
  onLayoutChange,
  initialLayout,
}: {
  rows: AnalyticalRow[];
  groupTotals: AnalyticalRow[];
  columns: AnalyticalColumn[];
  onSelect: (rows: AnalyticalRow[]) => void;
  onInspect: (row: AnalyticalRow) => void;
  visibleRowsRef: (rows: AnalyticalRow[]) => void;
  onLayoutChange?: (layout: TableLayout) => void;
  initialLayout?: Partial<TableLayout>;
}) {
  const [sorting, setSorting] = useState<SortingState>(
    initialLayout?.sorting || [],
  );
  const [search, setSearch] = useState("");
  const [columnSearch, setColumnSearch] = useState("");
  const [pinning, setPinning] = useState<ColumnPinningState>(
    initialLayout?.pinning || { left: ["segment"], right: [] },
  );
  const [sizing, setSizing] = useState<ColumnSizingState>(
    initialLayout?.sizing || {},
  );
  const [visibility, setVisibility] = useState<VisibilityState>(
    initialLayout?.visibility || {},
  );
  const [order, setOrder] = useState<string[]>(initialLayout?.order || []);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<ExpandedState>(true);
  const [grouped, setGrouped] = useState(initialLayout?.grouped || false);
  const [subtotals, setSubtotals] = useState(initialLayout?.subtotals ?? true);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 25 });
  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          !search ||
          `${r.segment} ${r.period || ""}`
            .toLowerCase()
            .includes(search.toLowerCase()),
      ),
    [rows, search],
  );
  const data = useMemo(() => {
    if (!grouped) return filtered;
    const by = new Map<string, AnalyticalRow[]>();
    for (const r of filtered) {
      const children = by.get(r.segment) || [];
      children.push(r);
      by.set(r.segment, children);
    }
    return [...by].map(([segment, children]) => {
      const total = groupTotals.find((t) => t.segment === segment);
      return {
        id: `group:${segment}`,
        period: null,
        segment,
        value: subtotals && !search ? (total?.value ?? null) : null,
        denominator: subtotals && !search ? (total?.denominator ?? null) : null,
        records: subtotals && !search ? (total?.records ?? 0) : 0,
        children,
        isSubtotal: true,
      };
    });
  }, [filtered, groupTotals, grouped, subtotals, search]);
  const defs = useMemo<ColumnDef<AnalyticalRow>[]>(
    () =>
      columns.map((c) => ({
        id: c.id,
        header: c.label,
        accessorFn: (r) => r[c.id as keyof AnalyticalRow],
        size: c.id === "segment" ? 220 : 135,
        minSize: 90,
        maxSize: 600,
        cell: ({ getValue, row }) =>
          c.id === "trend" ? (
            <TableSparkline
              rows={rows.filter((r) => r.segment === row.original.segment)}
            />
          ) : (
            c.format(getValue())
          ),
        sortUndefined: "last",
      })),
    [columns, rows],
  );
  const table = useReactTable({
    data,
    columns: defs,
    state: {
      sorting,
      columnPinning: pinning,
      columnSizing: sizing,
      columnVisibility: visibility,
      columnOrder: order,
      expanded,
      pagination,
    },
    onSortingChange: setSorting,
    onColumnPinningChange: setPinning,
    onColumnSizingChange: setSizing,
    onColumnVisibilityChange: setVisibility,
    onColumnOrderChange: setOrder,
    onExpandedChange: setExpanded,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSubRows: (r) => r.children,
    getRowId: (r) => r.id,
    columnResizeMode: "onChange",
    sortDescFirst: false,
  });
  const visible = table.getRowModel().rows;
  // Effects notify the owner outside rendering; selected groups never duplicate member counts.
  const layout = {
    sorting,
    pinning,
    sizing,
    visibility,
    order,
    grouped,
    subtotals,
  };
  const notifySelection = (next: Record<string, boolean>) => {
    setSelected(next);
    onSelect(rows.filter((r) => next[r.id]));
  };
  const style = (id: string): CSSProperties => {
    const c = table.getColumn(id)!;
    return {
      width: c.getSize(),
      minWidth: c.getSize(),
      maxWidth: c.getSize(),
      position: c.getIsPinned() ? "sticky" : undefined,
      left: c.getIsPinned() === "left" ? c.getStart("left") : undefined,
      right: c.getIsPinned() === "right" ? c.getAfter("right") : undefined,
      zIndex: c.getIsPinned() ? 2 : undefined,
      background: c.getIsPinned() ? "var(--surface-1)" : undefined,
    };
  };
  const move = (id: string, target: string) => {
    const current = table.getAllLeafColumns().map((c) => c.id);
    current.splice(current.indexOf(id), 1);
    current.splice(current.indexOf(target), 0, id);
    setOrder(current);
  };
  const reset = () => {
    setSearch("");
    setSorting([]);
    setPinning({ left: ["segment"], right: [] });
    setSizing({});
    setVisibility({});
    setOrder([]);
    notifySelection({});
    setGrouped(false);
    setSubtotals(true);
    setExpanded(true);
    setPagination({ pageIndex: 0, pageSize: 25 });
  };
  return (
    <div className="analytical-table" data-advanced-table>
      <div className="advanced-actions">
        <input
          aria-label="Search analytical rows"
          placeholder="Search groups or periods…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPagination((p) => ({ ...p, pageIndex: 0 }));
          }}
        />
        <details className="advanced-column-picker">
          <summary>Columns & pinning</summary>
          <div>
            <input
              aria-label="Search analytical columns"
              placeholder="Find a column…"
              value={columnSearch}
              onChange={(e) => setColumnSearch(e.target.value)}
            />
            {table
              .getAllLeafColumns()
              .filter((c) =>
                String(c.columnDef.header)
                  .toLowerCase()
                  .includes(columnSearch.toLowerCase()),
              )
              .map((c) => (
                <div className="advanced-column-option" key={c.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={c.getIsVisible()}
                      onChange={c.getToggleVisibilityHandler()}
                    />
                    {String(c.columnDef.header)}
                  </label>
                  <DropdownField
                    aria-label={`Pin ${String(c.columnDef.header)}`}
                    value={c.getIsPinned() || "none"}
                    onChange={(e) =>
                      c.pin(
                        e.target.value === "none"
                          ? false
                          : (e.target.value as "left" | "right"),
                      )
                    }
                  >
                    <option value="none">Unpinned</option>
                    <option value="left">Pin left</option>
                    <option value="right">Pin right</option>
                  </DropdownField>
                  <button
                    title="Move column left"
                    aria-label={`Move ${String(c.columnDef.header)} left`}
                    onClick={() => {
                      const index = table
                        .getAllLeafColumns()
                        .findIndex((x) => x.id === c.id);
                      if (index > 0)
                        move(c.id, table.getAllLeafColumns()[index - 1].id);
                    }}
                  >
                    ←
                  </button>
                  <input
                    type="number"
                    aria-label={`Width of ${String(c.columnDef.header)}`}
                    min={90}
                    max={600}
                    key={`${c.id}:${c.getSize()}`}
                    defaultValue={Math.round(c.getSize())}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                    onBlur={(e) =>
                      setSizing((s) => ({
                        ...s,
                        [c.id]: Math.max(
                          90,
                          Math.min(600, Number(e.target.value)),
                        ),
                      }))
                    }
                  />
                </div>
              ))}
          </div>
        </details>
        <label>
          <input
            type="checkbox"
            checked={grouped}
            onChange={(e) => {
              setGrouped(e.target.checked);
              setPagination((p) => ({ ...p, pageIndex: 0 }));
            }}
          />
          Group rows
        </label>
        {grouped && (
          <>
            <label>
              <input
                type="checkbox"
                checked={subtotals}
                onChange={(e) => setSubtotals(e.target.checked)}
              />
              Subtotals
            </label>
            <button onClick={() => setExpanded(true)}>Expand all</button>
            <button onClick={() => setExpanded({})}>Collapse all</button>
          </>
        )}
        <button onClick={reset}>Reset table</button>
        <button
          onClick={() => {
            onLayoutChange?.(layout);
            visibleRowsRef(
              visible
                .filter((r) => !r.original.isSubtotal)
                .map((r) => r.original),
            );
          }}
        >
          Save table layout
        </button>
      </div>
      {grouped && search && (
        <p className="muted">
          Group subtotals are hidden while searching. Select the matching rows
          to recompute their combined measure.
        </p>
      )}
      <div className="advanced-actions advanced-sort-controls">
        <span>Sort priority</span>
        {sorting.map((rule, i) => (
          <span key={rule.id}>
            {i + 1}. {columns.find((c) => c.id === rule.id)?.label}{" "}
            {rule.desc ? "↓" : "↑"}{" "}
            <button
              aria-label={`Remove sort ${rule.id}`}
              onClick={() =>
                setSorting((s) => s.filter((r) => r.id !== rule.id))
              }
            >
              ×
            </button>
          </span>
        ))}
        <DropdownField
          aria-label="Add sort column"
          value=""
          onChange={(e) =>
            setSorting((s) => [
              ...s.filter((r) => r.id !== e.target.value),
              { id: e.target.value, desc: false },
            ])
          }
        >
          <option value="">Add sort…</option>
          {columns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </DropdownField>
        <button
          onClick={() =>
            setSorting((s) => s.map((r) => ({ ...r, desc: !r.desc })))
          }
        >
          Reverse sort
        </button>
      </div>
      <div className="table-scroll advanced-table-scroll">
        <table
          style={{ width: table.getTotalSize() + 40, tableLayout: "fixed" }}
        >
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                <th style={{ width: 40 }}>
                  <input
                    type="checkbox"
                    aria-label="Select all filtered rows"
                    checked={
                      filtered.length > 0 &&
                      filtered.every((r) => selected[r.id])
                    }
                    onChange={(e) =>
                      notifySelection(
                        e.target.checked
                          ? Object.fromEntries(
                              filtered.map((r) => [r.id, true]),
                            )
                          : {},
                      )
                    }
                  />
                </th>
                {group.headers.map((h) => (
                  <th
                    key={h.id}
                    style={style(h.column.id)}
                    aria-sort={
                      h.column.getIsSorted() === "asc"
                        ? "ascending"
                        : h.column.getIsSorted() === "desc"
                          ? "descending"
                          : "none"
                    }
                    draggable
                    onDragStart={(e) =>
                      e.dataTransfer.setData("text/atlas-column", h.column.id)
                    }
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const id = e.dataTransfer.getData("text/atlas-column");
                      if (table.getColumn(id)) move(id, h.column.id);
                    }}
                  >
                    <button onClick={h.column.getToggleSortingHandler()}>
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {h.column.getIsSorted() === "asc"
                        ? " ↑"
                        : h.column.getIsSorted() === "desc"
                          ? " ↓"
                          : ""}
                    </button>
                    <span
                      className="advanced-resizer"
                      onMouseDown={h.getResizeHandler()}
                      onTouchStart={h.getResizeHandler()}
                    />
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr
                key={r.id}
                className={r.original.isSubtotal ? "advanced-subtotal" : ""}
              >
                <td>
                  {!r.original.isSubtotal && (
                    <input
                      type="checkbox"
                      aria-label={`Select ${r.original.segment} ${r.original.period || "undated"}`}
                      checked={!!selected[r.id]}
                      onChange={(e) =>
                        notifySelection({
                          ...selected,
                          [r.id]: e.target.checked,
                        })
                      }
                    />
                  )}
                </td>
                {r.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    style={style(cell.column.id)}
                    title={String(cell.getValue() ?? "Unavailable")}
                  >
                    {r.original.isSubtotal &&
                    (!subtotals || search) &&
                    !["segment", "period", "trend"].includes(cell.column.id) ? (
                      "—"
                    ) : cell.column.id === "segment" && r.getCanExpand() ? (
                      <button
                        aria-expanded={r.getIsExpanded()}
                        onClick={r.getToggleExpandedHandler()}
                      >
                        {r.getIsExpanded() ? "▾" : "▸"} {r.original.segment}
                      </button>
                    ) : cell.column.id === "value" && !r.original.isSubtotal ? (
                      <button
                        className="scorecard-cell"
                        onClick={() => onInspect(r.original)}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </button>
                    ) : (
                      flexRender(cell.column.columnDef.cell, cell.getContext())
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <p>No records match this analysis.</p>}
      <div className="advanced-actions">
        <span>
          {filtered.length.toLocaleString("en-IN")} filtered analytical rows ·
          Shift-click headers to sort multiple columns
        </span>
        <label>
          Rows per page
          <DropdownField
            value={pagination.pageSize}
            onChange={(e) => table.setPageSize(Number(e.target.value))}
          >
            {[25, 50, 100, 250].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </DropdownField>
        </label>
        <button
          disabled={!table.getCanPreviousPage()}
          onClick={() => {
            table.previousPage();
            visibleRowsRef(table.getRowModel().rows.map((r) => r.original));
          }}
        >
          Previous
        </button>
        <span>
          {table.getState().pagination.pageIndex + 1} /{" "}
          {Math.max(1, table.getPageCount())}
        </span>
        <button
          disabled={!table.getCanNextPage()}
          onClick={() => {
            table.nextPage();
            visibleRowsRef(table.getRowModel().rows.map((r) => r.original));
          }}
        >
          Next
        </button>
      </div>
      <TableNotifications
        rows={visible
          .filter((r) => !r.original.isSubtotal)
          .map((r) => r.original)}
        onVisible={visibleRowsRef}
      />
    </div>
  );
}
function TableNotifications({
  rows,
  onVisible,
}: {
  rows: AnalyticalRow[];
  onVisible: (rows: AnalyticalRow[]) => void;
}) {
  const signature = JSON.stringify(rows);
  useEffect(() => onVisible(rows), [signature, onVisible]);
  return null;
}
export interface TableLayout {
  sorting: SortingState;
  pinning: ColumnPinningState;
  sizing: ColumnSizingState;
  visibility: VisibilityState;
  order: string[];
  grouped: boolean;
  subtotals: boolean;
}

function TableSparkline({ rows }: { rows: AnalyticalRow[] }) {
  const values = rows
    .filter((r) => r.value != null)
    .map((r) => Number(r.value));
  if (values.length < 2) return <span>n/a</span>;
  const min = Math.min(...values),
    max = Math.max(...values);
  const points = values
    .map(
      (value, i) =>
        `${(i * 80) / (values.length - 1)},${22 - ((value - min) / (max - min || 1)) * 18}`,
    )
    .join(" ");
  return (
    <svg
      width="84"
      height="26"
      viewBox="0 0 84 26"
      role="img"
      aria-label={`Trend across ${values.length} periods`}
    >
      <polyline
        points={points}
        stroke="currentColor"
        fill="none"
        strokeWidth="1.5"
      />
    </svg>
  );
}
