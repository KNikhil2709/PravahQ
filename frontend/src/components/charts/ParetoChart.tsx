import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import type { OptimizeResult } from "../../api/types";
import { PROFILES, fmtInr, fmtMin } from "../../lib/format";

interface Props { result: OptimizeResult; selected: number | null; onSelect: (i: number) => void }

type P = { x: number; y: number; cost: number; idx?: number; kind: "explored" | "pareto" | "baseline"; tag?: string };

// Cost ramp: cyan (cheap) → pink (expensive), the Round 1 accent pair
function costColor(t: number) {
  const a = [0, 212, 255], b = [236, 72, 153];
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c.join(",")})`;
}

export default function ParetoChart({ result, selected, onSelect }: Props) {
  const costs = result.pareto.map(s => s.metrics.cost_inr);
  const lo = Math.min(...costs), hi = Math.max(...costs);
  const norm = (c: number) => (hi - lo < 1e-6 ? 0.5 : (c - lo) / (hi - lo));
  const tagOf = (i: number) => PROFILES.filter(p => result.profiles[p.key] === i).map(p => p.label).join(" / ");

  const explored: P[] = result.explored.map(e => ({ x: e[1], y: e[0], cost: e[2], kind: "explored" }));
  const pareto: P[] = result.pareto.map((s, i) => ({ x: s.metrics.exposure_min, y: s.metrics.travel_time_min,
    cost: s.metrics.cost_inr, idx: i, kind: "pareto", tag: tagOf(i) }));
  const b = result.baseline.metrics;
  const base: P[] = [{ x: b.exposure_min, y: b.travel_time_min, cost: b.cost_inr, kind: "baseline" }];
  // Frame the view on the front and the baseline; far-off explored candidates are clipped.
  const xMax = Math.max(b.exposure_min, ...pareto.map(p => p.x)) * 1.35 + 1;
  const yVals = [b.travel_time_min, ...pareto.map(p => p.y)];
  const yMin = Math.max(0, Math.min(...yVals) * 0.85), yMax = Math.max(...yVals) * 1.15;
  const exploredIn = explored.filter(e => e.x <= xMax && e.y <= yMax && e.y >= yMin);

  return (
    <div className="chart-card">
      <div className="chart-head">
        <h3>Pareto front</h3>
        <p>Grey dots are candidate plans explored during the search. Coloured dots are non-dominated: no other plan is better on all three objectives. Size and shade show cost. Click one to show it on the map.</p>
      </div>
      <div className="chart-body">
        <ResponsiveContainer width="100%" height={260}>
          <ScatterChart margin={{ top: 12, right: 18, bottom: 26, left: 6 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" />
            <XAxis type="number" dataKey="x" name="Congestion" tickFormatter={v => `${v}`} stroke="#64748B" fontSize={11}
              label={{ value: "Congestion exposure (min)", position: "insideBottom", offset: -14, fontSize: 11, fill: "#94A3B8" }} domain={[0, Math.ceil(xMax)]} allowDataOverflow />
            <YAxis type="number" dataKey="y" name="Travel time" stroke="#64748B" fontSize={11} width={48}
              label={{ value: "Travel time (min)", angle: -90, position: "insideLeft", offset: 12, fontSize: 11, fill: "#94A3B8" }} domain={[Math.floor(yMin), Math.ceil(yMax)]} allowDataOverflow />
            <Tooltip cursor={false} content={({ payload }) => {
              const p = payload?.[0]?.payload as P | undefined;
              if (!p) return null;
              return (
                <div className="chart-tip">
                  <strong>{p.kind === "baseline" ? "Baseline plan" : p.kind === "explored" ? "Explored candidate" : p.tag || `Pareto plan ${p.idx! + 1}`}</strong>
                  <div>Travel time {fmtMin(p.y)}</div><div>Congestion {fmtMin(p.x)}</div><div>Cost {fmtInr(p.cost)}</div>
                </div>
              );
            }} />
            <Scatter data={exploredIn} isAnimationActive={false}
              shape={(props: { cx?: number; cy?: number }) => <circle cx={props.cx} cy={props.cy} r={2} fill="#94A3B8" opacity={0.28} />} />
            <Scatter data={base} isAnimationActive={false}
              shape={(props: { cx?: number; cy?: number }) => {
                const { cx = 0, cy = 0 } = props;
                return <g><path d={`M${cx - 6},${cy - 6}L${cx + 6},${cy + 6}M${cx - 6},${cy + 6}L${cx + 6},${cy - 6}`} stroke="#E2E8F0" strokeWidth={2.2} />
                  <text x={cx + 9} y={cy + 4} fontSize={11} fill="#E2E8F0" stroke="#100F0A" strokeWidth={3} paintOrder="stroke">Baseline</text></g>;
              }} />
            <Scatter data={pareto} isAnimationActive={false}
              shape={(props: { cx?: number; cy?: number; payload?: P }) => {
                const { cx = 0, cy = 0, payload } = props;
                if (!payload) return <g />;
                const t = norm(payload.cost);
                const r = 5 + t * 6;
                const on = payload.idx === selected;
                return (
                  <g style={{ cursor: "pointer" }} onClick={() => onSelect(payload.idx!)}>
                    {on && <circle cx={cx} cy={cy} r={r + 5} fill="none" stroke="#FFFFFF" strokeWidth={2} className="pulse-ring" />}
                    <circle cx={cx} cy={cy} r={r} fill={costColor(t)} stroke="#100F0A" strokeWidth={1.5} />
                    {payload.tag && <text x={cx + r + 6} y={cy + 4} fontSize={11} fontWeight={700} fill="#FFFFFF"
                      stroke="#100F0A" strokeWidth={3} paintOrder="stroke">{payload.tag}</text>}
                  </g>
                );
              }} />
          </ScatterChart>
        </ResponsiveContainer>
        <div className="cost-scale">
          <span>{fmtInr(lo)}</span><i /><span>{fmtInr(hi)}</span>
        </div>
      </div>
    </div>
  );
}
