import { ArrowRight, Loader2, TrafficCone } from "lucide-react";
import type { Metrics, OptimizeResult, ProfileKey, TrafficChangeResult } from "../../api/types";
import { PROFILES, deltaText, fmtInr, fmtMin } from "../../lib/format";

interface Props {
  result: OptimizeResult | null;
  before: OptimizeResult | null;
  change: TrafficChangeResult | null;
  profile: ProfileKey | null;
  busy: boolean;
  changing: boolean;
  onSimulate: () => void;
}

const LEVEL = { LOW: "Low", MODERATE: "Moderate", HIGH: "High" } as const;

// Each profile is judged on the objective it optimises; Balanced on the mean change of all three.
const OBJ: Record<ProfileKey, { label: string; keys: (keyof Metrics)[] }> = {
  fastest: { label: "travel time", keys: ["travel_time_min"] },
  least_congested: { label: "congestion", keys: ["exposure_min"] },
  lowest_cost: { label: "cost", keys: ["cost_inr"] },
  balanced: { label: "all three (mean)", keys: ["travel_time_min", "exposure_min", "cost_inr"] },
};

function recovery(key: ProfileKey, after: Metrics, old: Metrics) {
  const ks = OBJ[key].keys;
  const pct = ks.reduce((acc, k) => acc + ((after[k] as number) - (old[k] as number)) / Math.max(1e-9, old[k] as number), 0) / ks.length * 100;
  if (Math.abs(pct) < 0.5) return { text: "no change", tone: "same" as const };
  return { text: `${pct > 0 ? "+" : "−"}${Math.abs(pct).toFixed(0)}% ${OBJ[key].label}`, tone: pct < 0 ? "better" as const : "worse" as const };
}

function MetricRows({ m, base: r }: { m: Metrics; base?: Metrics }) {
  const rows: [string, number, number | undefined, (v: number) => string][] = [
    ["Travel time", m.travel_time_min, r?.travel_time_min, fmtMin],
    ["Congestion", m.exposure_min, r?.exposure_min, fmtMin],
    ["Cost", m.cost_inr, r?.cost_inr, fmtInr],
  ];
  return (
    <dl className="tc-metrics">
      {rows.map(([label, v, ref, fmt]) => {
        const d = ref !== undefined ? deltaText(v, ref) : null;
        return <div key={label}><dt>{label}</dt><dd>{fmt(v)} {d && <small className={`tone-${d.tone}`}>{d.text}</small>}</dd></div>;
      })}
    </dl>
  );
}

export default function TrafficChangeStrip({ result, before, change, profile, busy, changing, onSimulate }: Props) {
  if (!result) return null;
  const key: ProfileKey = profile ?? "balanced";
  const label = PROFILES.find(p => p.key === key)!.label;

  if (!change || !before) {
    return (
      <section className="traffic-strip is-idle">
        <TrafficCone size={22} className="tc-icon" aria-hidden />
        <div className="tc-copy">
          <h3>What if traffic gets worse?</h3>
          <p>Raises traffic one level (from {LEVEL[result.problem.traffic_level]}) and closes lanes on the corridor these plans use most, then re-optimises starting from the current qubit population and archive.</p>
        </div>
        <button className="btn btn-secondary" onClick={onSimulate} disabled={busy || !result.pareto.length}>
          {changing ? <><Loader2 size={15} className="spin" /> Re-optimising…</> : "Simulate traffic change"}
        </button>
      </section>
    );
  }

  const bIdx = before.profiles[key], aIdx = change.after.profiles[key];
  const bPlan = bIdx !== undefined ? before.pareto[bIdx] : null;
  const aPlan = aIdx !== undefined ? change.after.pareto[aIdx] : null;
  const stale = change.stale_plans[key];

  return (
    <section className="traffic-strip">
      <div className="tc-header">
        <h3>Traffic change: {label} plan</h3>
        <p>Select another profile card to compare it. All values are from the simulation.</p>
        <button className="btn btn-ghost" onClick={onSimulate} disabled={busy}>
          {changing ? <><Loader2 size={15} className="spin" /> Re-optimising…</> : "Simulate another change"}
        </button>
      </div>
      <div className="tc-flow">
        <div className="tc-step">
          <span className="tc-step-label">Before</span>
          <div className="tc-step-title">{LEVEL[change.change.from_level]} traffic{before.problem.incident ? " + closure" : ""}</div>
          {bPlan && <MetricRows m={bPlan.metrics} />}
        </div>
        <ArrowRight className="tc-arrow" aria-hidden />
        <div className="tc-step is-change">
          <span className="tc-step-label">Traffic change</span>
          <div className="tc-step-title">{LEVEL[change.change.from_level]} → {LEVEL[change.change.to_level]}</div>
          <p className="tc-incident">{change.change.incident.label}</p>
          {stale && bPlan && <>
            <div className="tc-sub">If vehicles keep the old plan on the same roads:</div>
            <MetricRows m={stale.metrics} base={bPlan.metrics} />
            {!stale.feasible && <p className="tone-worse tc-note">Old plan now breaks a constraint.</p>}
          </>}
        </div>
        <ArrowRight className="tc-arrow" aria-hidden />
        <div className="tc-step is-after">
          <span className="tc-step-label">After re-optimisation</span>
          <div className="tc-step-title">{change.after.stats.pareto_size} new Pareto plans · {change.change.generations} generations{change.change.warm_start ? ", warm start" : ""}</div>
          {aPlan && <MetricRows m={aPlan.metrics} base={stale?.metrics} />}
          <div className="tc-sub">{aPlan && bPlan && aPlan.signature === bPlan.signature
            ? "Re-optimisation confirmed the existing plan is still the best option for this profile."
            : "Change shown against keeping the old plan."}</div>
        </div>
      </div>

      <table className="tc-table">
        <thead>
          <tr><th>Profile</th><th>Before</th><th>Old plan, same roads, new traffic</th><th>Re-optimised</th><th>Re-optimised vs old plan</th></tr>
        </thead>
        <tbody>
          {PROFILES.map(p => {
            const bi = before.profiles[p.key], ai = change.after.profiles[p.key], st = change.stale_plans[p.key];
            if (bi === undefined || ai === undefined || !st) return null;
            const b = before.pareto[bi].metrics, a = change.after.pareto[ai].metrics, o = st.metrics;
            const cell = (m: Metrics) => <>{fmtMin(m.travel_time_min)} <span className="muted">· {fmtMin(m.exposure_min)} cong.</span></>;
            const d = recovery(p.key, a, o);
            return (
              <tr key={p.key} className={p.key === key ? "is-selected" : ""}>
                <th>{p.label}</th><td>{cell(b)}</td><td>{cell(o)}{!st.feasible && <span className="tone-worse"> · breaks constraint</span>}</td>
                <td>{cell(a)}</td><td className={`tone-${d.tone}`}>{d.text}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="fine-print">Each profile is compared on the objective it optimises. "Old plan" keeps the same stops, order and roads, re-timed under the new simulated traffic.</p>
    </section>
  );
}
