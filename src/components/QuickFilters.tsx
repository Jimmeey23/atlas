import { periods, relativePeriod } from "../data/periods";
import { useStore } from "../state/store";
const studios = [
  ["Kemps Corner", "Kwality House, Kemps Corner"],
  ["Kenkere", "Kenkere House"],
  ["Plash", "Plash Pilates"],
];
export function QuickFilters() {
  const s = useStore();
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
        {studios.map(([label, value]) => (
          <button
            key={value}
            className={s.filters.location.includes(value) ? "selected" : ""}
            onClick={() =>
              s.filter({
                location: s.filters.location.includes(value)
                  ? s.filters.location.filter((v) => v !== value)
                  : [...s.filters.location, value],
              })
            }
          >
            {label}
          </button>
        ))}
      </div>
      <span className="quick-filter-note">
        Global scope · MoM ignores dates
      </span>
    </div>
  );
}
