import { useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { GenerationRecord, OptimizeResult } from "../../api/types";

type Key = "hypervolume" | "best_time" | "best_exposure" | "best_cost";
const OPTIONS: { key: Key; label: string; unit: string }[] = [
  { key: "hypervolume", label: "Hypervolume", unit: "" },
  { key: "best_time", label: "Best travel time", unit: "min" },
  { key: "best_exposure", label: "Best congestion", unit: "min" },
  { key: "best_cost", label: "Best cost", unit: "₹" },
];

export default function ConvergenceChart({ result }: { result: OptimizeResult }) {
  const [key, setKey] = useState<Key>("hypervolume");
  const quantum = result.algorithm.id === "qnsga2";
  const data = result.history.map((h: GenerationRecord) => ({ ...h, entropy: h.qubit_entropy }));
  const resets = result.history.filter(h => h.diversity_reset).map(h => h.generation);
  const opt = OPTIONS.find(o => o.key === key)!;

  return (
    <div className="chart-card">
      <div className="chart-head">
        <h3>Convergence</h3>
        <div className="chart-tabs" role="tablist">
          {OPTIONS.map(o => (
            <button key={o.key} role="tab" aria-selected={key === o.key} className={key === o.key ? "is-on" : ""}
              onClick={() => setKey(o.key)}>{o.label}</button>
          ))}
        </div>
        <p>{key === "hypervolume"
          ? "Hypervolume measures how much of the objective space the current plan set dominates (relative to the baseline). Higher means better and wider trade-offs."
          : `Best feasible value of this objective found so far in the archive, per generation.`}
          {quantum && " The dashed line is qubit entropy: 1 means undecided (exploring), near 0 means the qubits have committed to a plan structure (exploiting)."}</p>
      </div>
      <div className="chart-body">
        <ResponsiveContainer width="100%" height={236}>
          <LineChart data={data} margin={{ top: 10, right: quantum ? 4 : 18, bottom: 22, left: 6 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="generation" stroke="#64748B" fontSize={11}
              label={{ value: "Generation", position: "insideBottom", offset: -12, fontSize: 11, fill: "#94A3B8" }} />
            <YAxis yAxisId="l" stroke="#64748B" fontSize={11} width={52} domain={["auto", "auto"]}
              tickFormatter={v => key === "hypervolume" ? Number(v).toFixed(3) : Math.round(Number(v)).toString()} />
            {quantum && <YAxis yAxisId="r" orientation="right" domain={[0, 1]} stroke="#B388FF" fontSize={11} width={34} />}
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(16,15,10,0.95)", color: "#fff" }}
              formatter={(v, name) => [typeof v === "number" ? (name === opt.label && key === "hypervolume" ? v.toFixed(3) : v.toFixed(name === "Qubit entropy" ? 3 : 1)) : String(v), name]} />
            <Legend verticalAlign="top" height={22} iconType="plainline" wrapperStyle={{ fontSize: 11 }} />
            {resets.map(g => <ReferenceLine key={g} x={g} yAxisId="l" stroke="#FFC857" strokeDasharray="3 3" />)}
            <Line yAxisId="l" type="monotone" dataKey={key} name={opt.label} stroke="#00D4FF" strokeWidth={2.2} dot={false} isAnimationActive={false} />
            {quantum && <Line yAxisId="r" type="monotone" dataKey="entropy" name="Qubit entropy" stroke="#B388FF" strokeDasharray="5 4" strokeWidth={1.6} dot={false} isAnimationActive={false} />}
          </LineChart>
        </ResponsiveContainer>
        {resets.length > 0 && <p className="fine-print">Amber lines: diversity dropped below threshold, so part of the population was rotated back toward superposition.</p>}
      </div>
    </div>
  );
}
