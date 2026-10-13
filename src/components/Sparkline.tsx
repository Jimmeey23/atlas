import {useId} from "react";
export function Sparkline({
  values,
  color = "var(--accent)",
}: {
  values: (number | null)[];
  color?: string;
}) {
  const gradientId = `spark-${useId().replace(/:/g, "")}`;
  const points = values
    .map((v, i) => ({ v, i }))
    .filter((p) => p.v != null && Number.isFinite(p.v));
  if (points.length < 2)
    return (
      <svg className="metric-spark metric-spark-empty" viewBox="0 0 180 40" preserveAspectRatio="none" aria-hidden="true">
        <line
          x1="4"
          y1="20"
          x2="176"
          y2="20"
          stroke="var(--hairline)"
          strokeDasharray="3 3"
        />
      </svg>
    );
  const nums = points.map((p) => p.v!);
  const min = Math.min(...nums),
    max = Math.max(...nums),
    width = 172;
  const x = (i: number) => 4 + (i / (values.length - 1)) * width;
  const y = (v: number) => max === min ? 20 : 32 - ((v - min) / (max - min)) * 24;
  // Keep missing months as gaps rather than implying continuous evidence.
  const segments: typeof points[] = [];
  points.forEach((point, index) => {
    if (!index || point.i !== points[index - 1].i + 1) segments.push([]);
    segments.at(-1)!.push(point);
  });
  const last = points.at(-1)!;
  return (
    <svg
      className="metric-spark"
      viewBox="0 0 180 40"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".24" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      {segments.map((segment) => {
        const coordinates = segment.map(({ v, i }) => `${x(i)},${y(v!)}`).join(" ");
        return <g key={segment[0].i}>
          {segment.length > 1 && <polygon className="metric-spark-area" points={`${x(segment[0].i)},40 ${coordinates} ${x(segment.at(-1)!.i)},40`} fill={`url(#${gradientId})`} />}
          <polyline className="metric-spark-line" points={coordinates} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" pathLength="1" />
        </g>;
      })}
      <circle
        className="metric-spark-dot"
        cx={x(last.i)}
        cy={y(last.v!)}
        r="2.5"
        fill={color}
      />
    </svg>
  );
}
