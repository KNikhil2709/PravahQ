import { Loader2, Play } from "lucide-react";
import type { AlgorithmId, Network, Scenario, TrafficLevel } from "../../api/types";
import type { Status } from "../../hooks/useOptimizer";

interface Props {
  network: Network | null;
  scenario: Scenario;
  status: Status;
  hasResult: boolean;
  outdated: boolean;
  onLoad: () => void;
  onChange: (p: Partial<Scenario>) => void;
  onRun: () => void;
}

const LEVELS: { id: TrafficLevel; label: string }[] = [
  { id: "LOW", label: "Low" }, { id: "MODERATE", label: "Moderate" }, { id: "HIGH", label: "High" },
];

function Segmented<T extends string | number>({ value, options, onChange, label }:
  { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map(o => (
        <button key={String(o.id)} type="button" role="radio" aria-checked={value === o.id}
          className={value === o.id ? "is-on" : ""} onClick={() => onChange(o.id)}>{o.label}</button>
      ))}
    </div>
  );
}

export default function ScenarioPanel({ network, scenario, status, hasResult, outdated, onLoad, onChange, onRun }: Props) {
  const busy = status !== "idle";
  const dests = network?.destinations ?? [];
  const demand = dests.filter(d => scenario.destinations.includes(d.id)).reduce((a, d) => a + d.demand, 0);
  const fleetCap = scenario.vehicles * scenario.capacity;
  const overCapacity = demand > fleetCap;

  const toggle = (id: string) => onChange({
    destinations: scenario.destinations.includes(id)
      ? scenario.destinations.filter(x => x !== id)
      : dests.map(d => d.id).filter(x => x === id || scenario.destinations.includes(x)),
  });

  if (!network) {
    return (
      <aside className="panel scenario-panel">
        <h2 className="panel-title">Scenario</h2>
        <p className="panel-lead">Start with the built-in demo network: a synthetic 42-intersection city grid with one depot and 12 delivery points. It runs fully offline.</p>
        <button className="btn btn-primary btn-block" onClick={onLoad} disabled={busy}>
          {status === "loading-network" ? <><Loader2 size={16} className="spin" /> Loading network</> : "Load demo network"}
        </button>
      </aside>
    );
  }

  return (
    <aside className="panel scenario-panel">
      <h2 className="panel-title">Scenario</h2>

      <section className="field-group">
        <div className="field-head">
          <span className="field-label">Destinations</span>
          <span className="field-meta">{scenario.destinations.length} of {dests.length}</span>
        </div>
        <div className="chip-grid">
          {dests.map(d => (
            <button key={d.id} type="button"
              className={`chip ${scenario.destinations.includes(d.id) ? "is-on" : ""}`}
              aria-pressed={scenario.destinations.includes(d.id)}
              title={`Demand ${d.demand}${d.window ? ` · window ${d.window[0]}–${d.window[1]} min` : ""}`}
              onClick={() => toggle(d.id)}>
              {d.id}{d.window && <sup>⏱</sup>}
            </button>
          ))}
        </div>
        <div className={`capacity-meter ${overCapacity ? "is-over" : ""}`}>
          <div className="capacity-bar"><span style={{ width: `${Math.min(100, (demand / Math.max(1, fleetCap)) * 100)}%` }} /></div>
          <span>Demand {demand} / fleet capacity {fleetCap}</span>
        </div>
        {overCapacity && <p className="field-warn">Demand exceeds fleet capacity. Add a vehicle, raise capacity or drop stops; otherwise no feasible plan exists.</p>}
      </section>

      <section className="field-group">
        <span className="field-label">Vehicles</span>
        <Segmented label="Number of vehicles" value={scenario.vehicles}
          options={[1, 2, 3].map(n => ({ id: n, label: String(n) }))} onChange={v => onChange({ vehicles: v })} />
        <label className="field-row">
          <span>Capacity per vehicle</span>
          <input type="number" min={1} max={40} value={scenario.capacity}
            onChange={e => onChange({ capacity: Math.max(1, Math.min(40, Number(e.target.value) || 1)) })} />
        </label>
      </section>

      <section className="field-group">
        <span className="field-label">Traffic level</span>
        <Segmented label="Traffic level" value={scenario.traffic_level} options={LEVELS}
          onChange={v => onChange({ traffic_level: v })} />
      </section>

      <section className="field-group">
        <span className="field-label">Constraints</span>
        <label className="field-row">
          <span>Max route duration</span>
          <span className="field-inline">
            <input type="range" min={45} max={240} step={5} value={scenario.max_duration_min}
              onChange={e => onChange({ max_duration_min: Number(e.target.value) })} aria-label="Maximum route duration" />
            <output>{scenario.max_duration_min} min</output>
          </span>
        </label>
        <label className="field-check">
          <input type="checkbox" checked={scenario.time_windows} onChange={e => onChange({ time_windows: e.target.checked })} />
          Respect delivery windows <span className="muted">(⏱ stops)</span>
        </label>
      </section>

      <details className="field-group advanced">
        <summary>Optimiser settings</summary>
        <label className="field-row">
          <span>Algorithm</span>
          <select value={scenario.algorithm} onChange={e => onChange({ algorithm: e.target.value as AlgorithmId })}>
            <option value="qnsga2">Adaptive QNSGA-II</option>
            <option value="nsga2">NSGA-II (classical)</option>
          </select>
        </label>
        <label className="field-row"><span>Population</span>
          <input type="number" min={8} max={120} value={scenario.population}
            onChange={e => onChange({ population: Math.max(8, Math.min(120, Number(e.target.value) || 8)) })} /></label>
        <label className="field-row"><span>Generations</span>
          <input type="number" min={5} max={300} value={scenario.generations}
            onChange={e => onChange({ generations: Math.max(5, Math.min(300, Number(e.target.value) || 5)) })} /></label>
        <label className="field-row"><span>Random seed</span>
          <input type="number" value={scenario.seed} onChange={e => onChange({ seed: Number(e.target.value) || 0 })} /></label>
        <label className="field-check">
          <input type="checkbox" checked={scenario.local_search} onChange={e => onChange({ local_search: e.target.checked })} />
          Local search on elite plans (2-opt, swap, relocate)
        </label>
      </details>

      <div className="panel-footer">
        {outdated && hasResult && <p className="field-note">Settings changed since the last run.</p>}
        <button className="btn btn-primary btn-block" onClick={onRun}
          disabled={busy || scenario.destinations.length === 0}>
          {status === "optimizing"
            ? <><Loader2 size={16} className="spin" /> Optimising…</>
            : <><Play size={15} /> {hasResult ? "Re-optimise routes" : "Optimise routes"}</>}
        </button>
      </div>
    </aside>
  );
}
