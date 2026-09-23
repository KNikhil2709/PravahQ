import { Fragment, useState } from "react";
import { Loader2 } from "lucide-react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { errorMessage, runBenchmark } from "../api/optimizer";
import type { AlgorithmId, BenchmarkResult, Scenario } from "../api/types";

const COLORS: Record<AlgorithmId, string> = { qnsga2: "#B388FF", nsga2: "#00D4FF" };

export default function Benchmark({ scenario }: { scenario: Scenario }) {
  const [seeds, setSeeds] = useState(5);
  const [ls, setLs] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<BenchmarkResult | null>(null);

  const run = async () => {
    setBusy(true); setError(null);
    try { setRes(await runBenchmark(scenario, Array.from({ length: seeds }, (_, i) => i + 1), ls)); }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };

  const algos = res ? (Object.keys(res.algorithms) as AlgorithmId[]) : [];
  const curve = res ? res.algorithms.qnsga2.runs[0].hv_curve.map((_, g) => {
    const row: Record<string, number> = { generation: g };
    algos.forEach(a => {
      const runs = res.algorithms[a].runs;
      row[a] = runs.reduce((s, r) => s + (r.hv_curve[g]?.[1] ?? 0), 0) / runs.length;
    });
    return row;
  }) : [];

  return (
    <div className="doc-page">
      <header className="doc-header">
        <h1>Algorithm benchmark</h1>
        <p>Runs Adaptive QNSGA-II and classical NSGA-II on the identical routing instance, with the same decoder, constraints, evaluation budget and random seeds. It uses the scenario currently set on the optimiser page ({scenario.destinations.length} stops, {scenario.vehicles} vehicles, {scenario.traffic_level.toLowerCase()} traffic, population {scenario.population} × {scenario.generations} generations).</p>
      </header>

      <div className="bench-controls">
        <label>Seeds
          <select value={seeds} onChange={e => setSeeds(Number(e.target.value))}>
            {[3, 5, 8, 10].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label className="field-check">
          <input type="checkbox" checked={ls} onChange={e => setLs(e.target.checked)} />
          Include local search (budgets may then differ slightly)
        </label>
        <button className="btn btn-primary" onClick={run} disabled={busy}>
          {busy ? <><Loader2 size={15} className="spin" /> Running {seeds * 2} runs…</> : "Run benchmark"}
        </button>
      </div>
      {error && <div className="error-bar" role="alert"><span>{error}</span></div>}

      {res && (
        <>
          <p className="sim-banner">{res.label}</p>
          <div className="bench-summary">
            {algos.map(a => {
              const r = res.algorithms[a];
              return (
                <div key={a} className="bench-card" style={{ borderTopColor: COLORS[a] }}>
                  <h3>{r.label}</h3>
                  <dl>
                    <div><dt>Hypervolume (mean ± sd)</dt><dd>{r.hv_mean.toFixed(3)} ± {r.hv_std.toFixed(3)}</dd></div>
                    <div><dt>Pareto plans (mean)</dt><dd>{r.pareto_mean}</dd></div>
                    <div><dt>Evaluations per run</dt><dd>{r.evaluations_mean.toLocaleString("en-IN")}</dd></div>
                    <div><dt>Runtime per run</dt><dd>{r.runtime_mean.toFixed(2)} s</dd></div>
                  </dl>
                </div>
              );
            })}
          </div>

          <div className="chart-card">
            <div className="chart-head"><h3>Mean hypervolume by generation</h3><p>{res.setup.metric}</p></div>
            <div className="chart-body">
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={curve} margin={{ top: 10, right: 18, bottom: 22, left: 6 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="generation" fontSize={11} stroke="#64748B"
                    label={{ value: "Generation", position: "insideBottom", offset: -12, fontSize: 11, fill: "#94A3B8" }} />
                  <YAxis fontSize={11} stroke="#64748B" width={48} domain={["auto", "auto"]} tickFormatter={v => Number(v).toFixed(2)} />
                  <Tooltip formatter={v => (typeof v === "number" ? v.toFixed(3) : String(v))} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(16,15,10,0.95)", color: "#fff" }} />
                  <Legend verticalAlign="top" height={24} wrapperStyle={{ fontSize: 12 }} />
                  {algos.map(a => <Line key={a} dataKey={a} name={res.algorithms[a].label} stroke={COLORS[a]} strokeWidth={2.2} dot={false} isAnimationActive={false} />)}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <table className="data-table">
            <thead><tr><th>Seed</th>{algos.map(a => <th key={a} colSpan={3}>{res.algorithms[a].label}</th>)}</tr>
              <tr><th />{algos.map(a => <Fragment key={a}><th>HV</th><th>Plans</th><th>Time (s)</th></Fragment>)}</tr></thead>
            <tbody>
              {res.setup.seeds.map((s, i) => (
                <tr key={s}><td>{s}</td>{algos.map(a => {
                  const r = res.algorithms[a].runs[i];
                  return <Fragment key={a}><td>{r.hypervolume.toFixed(3)}</td><td>{r.pareto_size}</td><td>{r.runtime_s.toFixed(2)}</td></Fragment>;
                })}</tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <section className="doc-section">
        <h2>Planned comparisons</h2>
        <p>The optimiser interface accepts further algorithms on the same problem instance. These are not implemented yet, so no results are shown for them: {res?.planned.join(", ") ?? "QPSO, QIGA, APSO, HGS"}.</p>
      </section>
    </div>
  );
}
