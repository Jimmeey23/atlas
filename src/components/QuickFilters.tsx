import "./QuickFilters.css";
import { periods, relativePeriod } from "../data/periods";
import { useStore } from "../state/store";
import { shortLocation } from "../data/normalise";
import { useEffect, useRef } from "react";
import { ChevronDown } from "lucide-react";

const primaryPeriods = ["This week", "Last week", "This month", "Last month", "Last 30 days", "This quarter"];
const mainStudios = [/kemps corner/i, /bandra/i, /kenkere/i];
export function QuickFilters({ locations }: { locations: string[] }) {
  const s = useStore();
  const studios = [...new Set([...locations, ...s.filters.location])].sort((a, b) => a.localeCompare(b));
  // The three flagship studios stay one click away; every other location folds into "Others".
  const isPrimary = (value: string) => /kemps corner|bandra|kenkere/i.test(value);
  const primary = mainStudios
    .map((pattern) => studios.find((value) => pattern.test(value)))
    .filter((value): value is string => !!value);
  const others = studios.filter((value) => !isPrimary(value));
  const othersSelected = others.filter((value) => s.filters.location.includes(value)).length;
  const datesRef = useRef<HTMLDetailsElement>(null);
  const othersRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (datesRef.current?.open && !datesRef.current.contains(e.target as Node)) datesRef.current.open = false;
      if (othersRef.current?.open && !othersRef.current.contains(e.target as Node)) othersRef.current.open = false;
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  const studioButton = (value: string) => (
    <button
      key={value}
      aria-pressed={s.filters.location.includes(value)}
      title={value}
      className={s.filters.location.includes(value) ? "selected" : ""}
      onClick={() =>
        s.filter({
          location: s.filters.location.includes(value)
            ? s.filters.location.filter((v) => v !== value)
            : [...s.filters.location, value],
        })
      }
    >
      {shortLocation(value)}
    </button>
  );
  return (
    <div className="quick-filters">
      <div className="quick-periods" aria-label="Quick date periods">
        <span className="quick-label" aria-hidden="true">Period</span>
        {primaryPeriods.map((name) => {
          const range = relativePeriod(name);
          return (
            <button
              key={name}
              className={
                s.filters.from === range.from && s.filters.to === range.to
                  ? "selected"
                  : ""
              }
              onClick={() => s.filter(range)}
            >
              {name}
            </button>
          );
        })}
        <details className="quick-others quick-date-others" ref={datesRef} onToggle={e => {
          const el = e.currentTarget, menu = el.querySelector<HTMLElement>('.quick-others-menu');
          if (!el.open || !menu) return;
          const box = el.querySelector('summary')!.getBoundingClientRect();
          menu.style.top = `${box.bottom + 6}px`;
          menu.style.left = `${Math.max(12, Math.min(box.left, window.innerWidth - menu.offsetWidth - 12))}px`;
        }}>
          <summary aria-label="Other date periods">Other <ChevronDown size={12} /></summary>
          <div className="quick-others-menu" role="group" aria-label="Additional date periods">
            {periods.filter(name => !primaryPeriods.includes(name)).map(name => {
              const range = relativePeriod(name), selected = s.filters.from === range.from && s.filters.to === range.to;
              return <button key={name} aria-pressed={selected} className={selected ? 'selected' : ''} onClick={() => { s.filter(range); if (datesRef.current) datesRef.current.open = false; }}>{name}</button>;
            })}
            <button onClick={() => { s.set({ filterOpen: true }); if (datesRef.current) datesRef.current.open = false; }}>Custom…</button>
          </div>
        </details>
      </div>
      <div className="quick-studios" aria-label="Quick studio filters">
        <span className="quick-label" aria-hidden="true">Studios</span>
        <button
          className={!s.filters.location.length ? "selected" : ""}
          onClick={() => s.filter({ location: [] })}
        >
          All studios
        </button>
        {primary.map(studioButton)}
        {others.length > 0 && (
          <details
            className="quick-others"
            ref={othersRef}
            onToggle={(e) => {
              const el = e.currentTarget;
              const menu = el.querySelector<HTMLElement>(".quick-others-menu");
              if (!el.open || !menu) return;
              const box = el.querySelector("summary")!.getBoundingClientRect();
              menu.style.top = `${box.bottom + 6}px`;
              menu.style.left = `${Math.max(12, Math.min(box.right - menu.offsetWidth, window.innerWidth - menu.offsetWidth - 12))}px`;
            }}
          >
            <summary className={othersSelected ? "selected" : ""} aria-label="Other studios">
              Others{othersSelected ? ` · ${othersSelected}` : ""}
              <ChevronDown size={12} aria-hidden="true" />
            </summary>
            <div className="quick-others-menu" role="group" aria-label="Other studio filters">
              {others.map(studioButton)}
            </div>
          </details>
        )}
      </div>
      <span className="quick-filter-note">
        Global scope · MoM ignores dates
      </span>
    </div>
  );
}
