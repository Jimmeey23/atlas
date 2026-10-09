import { useRef, useState } from "react";
import {
  Maximize2,
  RotateCcw,
  Table2,
  Download,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import * as echarts from "echarts";
import { formatField } from "../semantics/formats";
import { exportCSV } from "./exports";
import { DataInsightAction } from "./DataInsightAction";
export function ChartControls({
  rows = [],
  title = "Chart",
}: {
  rows?: Record<string, any>[];
  title?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [table, setTable] = useState(false);
  const [zoom, setZoom] = useState(100);
  function chart() {
    const parent = ref.current?.closest(
      ".chart-surface,.register,.intelligence-panel,.pulse-wrapper",
    );
    const dom = parent?.querySelector(".chart");
    return dom ? echarts.getInstanceByDom(dom as HTMLElement) : null;
  }
  function changeZoom(delta: number) {
    const next = Math.max(20, Math.min(100, zoom + delta));
    setZoom(next);
    const instance = chart();
    if (instance)
      instance.setOption({
        dataZoom: [
          { type: "inside", start: 0, end: next },
          { type: "slider", start: 0, end: next },
        ],
      });
    else {
      const target = ref.current
        ?.closest(".chart-surface,.register,.pulse-wrapper")
        ?.querySelector("svg,.heatmap,.ranking-list") as HTMLElement;
      if (target) target.style.zoom = String(100 / next);
    }
  }
  return (
    <div className="chart-controls" ref={ref}>
      <div className="chart-control-buttons">
        <button
          aria-label={"Zoom in " + title}
          title="Zoom in"
          onClick={() => changeZoom(-20)}
        >
          <ZoomIn size={14} />
        </button>
        <button
          aria-label={"Zoom out " + title}
          title="Zoom out"
          onClick={() => changeZoom(20)}
        >
          <ZoomOut size={14} />
        </button>
        <button
          aria-label={"Reset " + title}
          title="Reset this chart view"
          onClick={() => {
            setZoom(100);
            chart()?.dispatchAction({ type: "restore" });
            const target = ref.current
              ?.closest(".chart-surface,.register,.pulse-wrapper")
              ?.querySelector("svg,.heatmap,.ranking-list") as HTMLElement;
            if (target) target.style.zoom = "1";
          }}
        >
          <RotateCcw size={14} />
        </button>
        <button
          aria-label={"Data table for " + title}
          title="Data table"
          onClick={() => setTable(!table)}
        >
          <Table2 size={14} />
        </button>
        <button
          aria-label={"Export data for " + title}
          title="Export CSV"
          onClick={() =>
            exportCSV("atlas-" + title.toLowerCase().replaceAll(" ", "-"), rows)
          }
        >
          <Download size={14} />
        </button>
        <button
          aria-label={"Expand " + title}
          title="Expand chart"
          onClick={() => {
            const container = ref.current?.closest(
              ".chart-surface,.register,.intelligence-panel,.pulse-wrapper",
            ) as HTMLElement;
            void container?.requestFullscreen?.().catch(() => {});
          }}
        >
          <Maximize2 size={14} />
        </button>
        <DataInsightAction
          compact
          subject={title}
          detail="Chart/table controls for the currently displayed section data."
          buttonLabel="Summarise this view"
          rows={rows}
        />
      </div>
      {table && (
        <div className="chart-data-preview">
          <table>
            <thead>
              <tr>
                {Object.keys(rows[0] || {}).map((k) => (
                  <th key={k}>{k}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 500).map((row, i) => (
                <tr key={i}>
                  {Object.keys(rows[0] || {}).map((k) => (
                    <td key={k}>{formatField(k, row[k])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
