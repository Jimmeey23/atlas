import type { Analysis } from "../../data/analytics";
import { health } from "../../data/duckdb";
import { Register } from "../Register";
import { StudioLeaderboard } from "./StudioLeaderboard";
import { ConversionFunnel } from "./ConversionFunnel";
import { RevenueMix } from "./RevenueMix";
import { GoalRings } from "./GoalRings";
import "./OverviewBoard.css";

/**
 * The cards reload only when loaded rows change. The app-wide version also ticks on every source
 * state change (loading, error), and the cards' own ensureSource calls cause those ticks: a source
 * that fails would be retried, republished and re-requested forever.
 */
const rowsStamp = () => Object.entries(health).map(([key, h]) => `${key}:${h.fetchedAt ?? ""}`).join("|");

export function OverviewBoard({ data }: { data: Analysis; version?: number }) {
  const version = rowsStamp();
  return (
    <Register id="performance-board" index="06" title="Performance board" subtitle="Studios, funnels, revenue mix and goals under the selected filters">
      <div className="board-grid">
        <GoalRings data={data} />
        <StudioLeaderboard version={version} />
        <RevenueMix version={version} />
        <ConversionFunnel version={version} />
      </div>
    </Register>
  );
}
