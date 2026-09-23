import type { OptimizeResult, PlanSolution, ProfileKey } from "../../api/types";
import { deltaText, METRICS, POLICY_LABEL, PROFILES, VEHICLE_COLORS, fmtMin } from "../../lib/format";

interface Props {
  result: OptimizeResult | null;
  selected: number | null;
  onSelect: (i: number) => void;
  optimizing: boolean;
}

const WHY: Record<ProfileKey, string> = {
  fastest: "Minimises total driving time; accepts busier arterial roads to get there.",
  least_congested: "Keeps vehicles off congested links, usually at the price of longer distances.",
  lowest_cost: "Minimises kilometres and vehicles dispatched.",
  balanced: "The plan closest to the ideal point after scaling all three objectives across the Pareto set.",
};

function ProfileCard({ label, plan, baseline, active, sameAs, onClick }:
  { label: string; plan: PlanSolution; baseline: PlanSolution; active: boolean; sameAs?: string; onClick: () => void }) {
  return (
    <button type="button" className={`profile-card ${active ? "is-active" : ""}`} onClick={onClick} aria-pressed={active}>
      <div className="profile-head">
        <span className="profile-name">{label}</span>
        {sameAs && <span className="profile-same">same plan as {sameAs}</span>}
      </div>
      <dl className="profile-metrics">
        {METRICS.map(m => {
          const v = plan.metrics[m.key], d = deltaText(v, baseline.metrics[m.key]);
          return (
            <div key={m.key}>
              <dt>{m.label}</dt>
              <dd>{m.fmt(v)} <small className={`tone-${d.tone}`}>{d.text}</small></dd>
            </div>
          );
        })}
      </dl>
    </button>
  );
}

export default function SolutionPanel({ result, selected, onSelect, optimizing }: Props) {
  if (!result) {
    return (
      <aside className="panel solution-panel">
        <h2 className="panel-title">Route plans</h2>
        <p className="panel-lead">
          {optimizing ? "Running the optimiser…" :
            "After optimisation this panel lists trade-off plans: the fastest, the least congested, the cheapest and a balanced compromise, each compared with a conventional dispatch plan."}
        </p>
      </aside>
    );
  }

  const { pareto, profiles, baseline, stats, algorithm } = result;
  const plan = selected !== null ? pareto[selected] : null;
  const profileOfSelected = PROFILES.find(p => profiles[p.key] === selected);

  if (!pareto.length) {
    return (
      <aside className="panel solution-panel">
        <h2 className="panel-title">Route plans</h2>
        <div className="empty-alert">
          <strong>No feasible plan found.</strong>
          {result.notes.map(n => <p key={n}>{n}</p>)}
          {result.problem.feasibility.issues.map(n => <p key={n}>{n}</p>)}
        </div>
      </aside>
    );
  }

  return (
    <aside className="panel solution-panel">
      <div className="panel-title-row">
        <h2 className="panel-title">Route plans</h2>
        <span className="panel-meta">{stats.pareto_size} Pareto-optimal</span>
      </div>
      <p className="panel-sub">
        {algorithm.label} · {stats.evaluations.toLocaleString("en-IN")} candidate plans evaluated in {stats.runtime_s.toFixed(1)} s.
        Changes are shown against the baseline plan.
      </p>

      <div className="profile-list">
        {PROFILES.map(p => {
          const i = profiles[p.key];
          if (i === undefined) return null;
          const first = PROFILES.find(q => profiles[q.key] === i);
          return (
            <ProfileCard key={p.key} label={p.label} plan={pareto[i]} baseline={baseline}
              active={selected === i}
              sameAs={first && first.key !== p.key ? first.label : undefined}
              onClick={() => onSelect(i)} />
          );
        })}
      </div>

      {plan && (
        <section className="plan-detail">
          <h3>{profileOfSelected ? profileOfSelected.label : `Pareto plan ${selected! + 1}`} · route detail</h3>
          {profileOfSelected && <p className="plan-why">{WHY[profileOfSelected.key]}</p>}
          <ol className="vehicle-list">
            {plan.vehicles.map((v, vi) => (
              <li key={vi} className={v.stops.length ? "" : "is-idle"}>
                <i className="swatch-line" style={{ background: VEHICLE_COLORS[vi] }} />
                <div>
                  <div className="vehicle-route">
                    <strong>V{v.vehicle}</strong>{" "}
                    {v.stops.length ? <>Depot → {v.stops.join(" → ")} → Depot</> : "Not dispatched"}
                  </div>
                  {v.stops.length > 0 && (
                    <div className="vehicle-meta">
                      {fmtMin(v.duration_min)} total · load {v.load}/{v.capacity}
                      {v.heavy_traffic_min > 0 && <> · {v.heavy_traffic_min.toFixed(0)} min in heavy traffic</>}
                      {v.lateness_min > 0 && <span className="tone-worse"> · {v.lateness_min.toFixed(0)} min late</span>}
                      <br /><span className="muted">Paths: {summarisePolicies(v.policies)}</span>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>

          <table className="compare-table">
            <thead><tr><th /><th>Baseline</th><th>This plan</th><th>Change</th></tr></thead>
            <tbody>
              {METRICS.map(m => {
                const d = deltaText(plan.metrics[m.key], baseline.metrics[m.key]);
                return (
                  <tr key={m.key}>
                    <th>{m.label}</th><td>{m.fmt(baseline.metrics[m.key])}</td>
                    <td>{m.fmt(plan.metrics[m.key])}</td><td className={`tone-${d.tone}`}>{d.text}</td>
                  </tr>
                );
              })}
              <tr><th>Vehicles</th><td>{baseline.metrics.vehicles_used}</td><td>{plan.metrics.vehicles_used}</td><td /></tr>
              <tr><th>All back by</th><td>{fmtMin(baseline.metrics.completion_min)}</td><td>{fmtMin(plan.metrics.completion_min)}</td><td /></tr>
            </tbody>
          </table>
          <p className="fine-print">Baseline: {baseline.label}{baseline.feasible ? "" : " (violates constraints)"}. Evaluated under the same simulated traffic.</p>
        </section>
      )}
    </aside>
  );
}

function summarisePolicies(policies: string[]): string {
  const counts = new Map<string, number>();
  policies.forEach(p => counts.set(p, (counts.get(p) ?? 0) + 1));
  return [...counts.entries()].map(([p, n]) => `${n}× ${POLICY_LABEL[p] ?? p}`).join(", ");
}
