import { periods, relativePeriod } from "../data/periods";
import { useStore } from "../state/store";
import { shortLocation } from "../data/normalise";
export function QuickFilters({ locations }: { locations: string[] }) {
  const s = useStore();
  const studios = [...new Set([...locations, ...s.filters.location])].sort((a, b) => a.localeCompare(b));
  return (
    <div className="quick-filters">
      <div className="quick-periods" aria-label="Quick date periods">
        {periods.slice(0, 6).map((name) => {
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
      </div>
      <div className="quick-studios" aria-label="Quick studio filters">
        <button
          className={!s.filters.location.length ? "selected" : ""}
          onClick={() => s.filter({ location: [] })}
        >
          All studios
        </button>
        {studios.map((value) => (
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
        ))}
      </div>
      <span className="quick-filter-note">
        Global scope · MoM ignores dates
      </span>
    </div>
  );
}
