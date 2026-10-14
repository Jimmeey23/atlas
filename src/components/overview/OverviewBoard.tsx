import type { Analysis } from "../../data/analytics";
import { Register } from "../Register";
import { StudioLeaderboard } from "./StudioLeaderboard";
import { ConversionFunnel } from "./ConversionFunnel";
import { RevenueMix } from "./RevenueMix";
import { GoalRings } from "./GoalRings";
import "./OverviewBoard.css";

export function OverviewBoard({ data, version }: { data: Analysis; version: number }) {
  return (
    <Register index="06" title="Performance board" subtitle="Studios, funnels, revenue mix and goals under the selected filters">
      <div className="board-grid">
        <GoalRings data={data} />
        <StudioLeaderboard version={version} />
        <RevenueMix version={version} />
        <ConversionFunnel version={version} />
      </div>
    </Register>
  );
}
