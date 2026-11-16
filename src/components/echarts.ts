// The only ECharts entry the app imports. Registering just the series and components
// the dashboards draw keeps the unused chart types (maps, 3D, gauges, trees, …) out of
// the bundle. Add a chart or component here before using it in an option.
import * as echarts from "echarts/core";
import { BarChart, HeatmapChart, LineChart, PieChart, SankeyChart, ScatterChart } from "echarts/charts";
import {
  AriaComponent, BrushComponent, CalendarComponent, DataZoomComponent, DatasetComponent, GraphicComponent,
  GridComponent, LegendComponent, MarkAreaComponent, MarkLineComponent, MarkPointComponent, TitleComponent,
  ToolboxComponent, TooltipComponent, VisualMapComponent,
} from "echarts/components";
import { LabelLayout, UniversalTransition } from "echarts/features";
import { CanvasRenderer, SVGRenderer } from "echarts/renderers";

echarts.use([
  BarChart, HeatmapChart, LineChart, PieChart, SankeyChart, ScatterChart,
  AriaComponent, BrushComponent, CalendarComponent, DataZoomComponent, DatasetComponent, GraphicComponent,
  GridComponent, LegendComponent, MarkAreaComponent, MarkLineComponent, MarkPointComponent, TitleComponent,
  ToolboxComponent, TooltipComponent, VisualMapComponent,
  LabelLayout, UniversalTransition, CanvasRenderer, SVGRenderer,
]);

export * from "echarts/core";
export type { EChartsOption, SeriesOption } from "echarts";
