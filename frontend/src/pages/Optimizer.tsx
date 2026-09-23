import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowDown, Atom, ChevronRight, Route, TrafficCone, X } from "lucide-react";
import pravahLogo from "../assets/pravah_logo.png";
import HeroCanvas from "../components/layout/HeroCanvas";
import NetworkMap from "../components/map/NetworkMap";
import ScenarioPanel from "../components/dashboard/ScenarioPanel";
import SolutionPanel from "../components/dashboard/SolutionPanel";
import TrafficChangeStrip from "../components/dashboard/TrafficChangeStrip";
import WorkflowStrip from "../components/dashboard/WorkflowStrip";
import ParetoChart from "../components/charts/ParetoChart";
import ConvergenceChart from "../components/charts/ConvergenceChart";
import type { OptimizerState } from "../hooks/useOptimizer";
import { useReveal } from "../hooks/useReveal";
import { PROFILES } from "../lib/format";

const PILLARS = [
  { icon: <TrafficCone size={32} />, stage: "01 — Simulate", name: "Traffic Model", color: "#00D4FF",
    desc: "A seeded road network with capacities and speeds. Traffic levels set each road's volume/capacity ratio, and the BPR model turns it into travel time. Lane closures cut capacity." },
  { icon: <Atom size={32} />, stage: "02 — Search", name: "Adaptive QNSGA-II", color: "#B388FF",
    desc: "Candidate plans live in qubit registers. Measuring them yields route plans; NSGA-II keeps the non-dominated ones, and adaptive quantum rotation steers the qubits toward them." },
  { icon: <Route size={32} />, stage: "03 — Decide", name: "Pareto Route Plans", color: "#F472B6",
    desc: "Instead of one answer, the operator gets the trade-offs: fastest, least congested, cheapest and balanced, each measured against a conventional dispatch plan." },
];

const PIPELINE = [
  { name: "Road Network", sub: "42 nodes · 72 roads" },
  { name: "Traffic State", sub: "BPR · v/c" },
  { name: "Qubit Population", sub: "|α|² + |β|² = 1" },
  { name: "Pareto Front", sub: "3 objectives" },
  { name: "Re-optimise", sub: "Warm start" },
];

export default function Optimizer({ state }: { state: OptimizerState }) {
  const navigate = useNavigate();
  const commandRef = useRef<HTMLElement>(null);
  const [howRef, howReveal] = useReveal<HTMLElement>();
  const [chartsRef, chartsReveal] = useReveal<HTMLDivElement>();
  const { network, scenario, preview, result, before, change, selected, selectedProfile, status, error, outdated } = state;
  const plan = result && selected !== null ? result.pareto[selected] ?? null : null;
  const planLabel = selectedProfile ? `${PROFILES.find(p => p.key === selectedProfile)!.label} plan`
    : selected !== null ? `Pareto plan ${selected + 1}` : undefined;
  const edgeStates = result && !outdated ? result.edge_states : preview;
  const busy = status !== "idle";

  const start = () => {
    if (!network && status === "idle") state.loadNetwork();
    commandRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const toggleDestination = (id: string) => state.update({
    destinations: scenario.destinations.includes(id)
      ? scenario.destinations.filter(x => x !== id)
      : (network?.destinations.map(d => d.id) ?? []).filter(x => x === id || scenario.destinations.includes(x)),
  });

  return (
    <div className="landing-page">
      {/* ═══ HERO ═══ */}
      <section className="hero-section">
        <HeroCanvas />
        <div className="hero-overlay" />
        <div className="hero-content fade-in">
          <img src={pravahLogo} alt="PravahAI" className="hero-logo" />
          <p className="hero-tagline">Quantum-Inspired Route Optimisation</p>
          <p className="hero-description">
            PravahAI plans fleet routes that balance travel time, congestion and cost,
            and re-plans them the moment traffic changes.
          </p>
          <div className="hero-stats-row">
            {[["42", "Intersections"], ["72", "Road Links"], ["12", "Delivery Points"], ["3", "Objectives"]].map(([v, l], i) => (
              <div key={l} style={{ display: "contents" }}>
                {i > 0 && <div className="hero-stat-sep" />}
                <div className="hero-stat"><div className="hero-stat-value">{v}</div><div className="hero-stat-label">{l}</div></div>
              </div>
            ))}
          </div>
          <div className="hero-actions">
            <button className="hero-btn-primary" onClick={start}>
              Start Optimising <ArrowDown className="hero-btn-arrow" size={18} />
            </button>
            <button className="hero-btn-secondary" onClick={() => navigate("/method")}>How It Works</button>
          </div>
        </div>
        <button className="hero-scroll-hint" onClick={start} aria-label="Scroll to the optimiser">
          <div className="hero-scroll-chevron" />
          <span>Scroll to optimise</span>
        </button>
      </section>

      {/* ═══ COMMAND CENTRE ═══ */}
      <section className="command-section" ref={commandRef}>
        <div className="section-header-block">
          <div className="section-eyebrow">Command Centre</div>
          <h2 className="section-heading">Fleet Route Optimiser</h2>
          <p className="section-subheading">Synthetic network · simulated traffic · Adaptive QNSGA-II</p>
        </div>

        <WorkflowStrip networkLoaded={!!network} hasResult={!!result} changed={!!change} optimizing={status === "optimizing"} />

        {error && (
          <div className="error-bar" role="alert">
            <span>{error}</span>
            <button onClick={state.dismissError} aria-label="Dismiss"><X size={16} /></button>
          </div>
        )}

        <div className="workspace">
          <ScenarioPanel network={network} scenario={scenario} status={status} hasResult={!!result} outdated={outdated}
            onLoad={state.loadNetwork} onChange={state.update} onRun={state.run} />

          <section className="map-area" aria-label="Road network map">
            {network ? (
              <>
                <NetworkMap network={network} edgeStates={edgeStates} activeDestinations={scenario.destinations}
                  plan={outdated ? null : plan} planLabel={planLabel}
                  baseline={result && !outdated ? result.baseline : null}
                  alternatives={result && !outdated ? result.pareto.filter((_, i) => i !== selected) : []}
                  onToggleDestination={toggleDestination} locked={busy} />
                {status === "optimizing" && <div className="map-busy pulse-glow">Optimising {scenario.destinations.length} stops across {scenario.vehicles} vehicles…</div>}
                {status === "changing" && <div className="map-busy pulse-glow">Applying traffic change and re-optimising…</div>}
              </>
            ) : (
              <div className="map-empty"><p>Load the demo network to see the road map.</p></div>
            )}
          </section>

          <SolutionPanel result={outdated ? null : result} selected={selected} onSelect={state.select} optimizing={status === "optimizing"} />
        </div>

        {result && !outdated && (
          <>
            <TrafficChangeStrip result={result} before={before} change={change} profile={selectedProfile}
              busy={busy} changing={status === "changing"} onSimulate={state.trafficChange} />
            {result.pareto.length > 0 && (
              <div ref={chartsRef} className={`charts-row ${chartsReveal}`}>
                <ParetoChart result={result} selected={selected} onSelect={state.select} />
                <ConvergenceChart result={result} />
              </div>
            )}
            <p className="sim-note">{result.label} Cost model is illustrative: ₹{result.problem.cost_model.per_km_inr}/km plus ₹{result.problem.cost_model.per_vehicle_dispatch_inr} per vehicle dispatched.</p>
          </>
        )}
      </section>

      {/* ═══ HOW IT WORKS ═══ */}
      <section ref={howRef} className={`how-section ${howReveal}`}>
        <div className="section-header-block">
          <div className="section-eyebrow">Optimisation Pipeline</div>
          <h2 className="section-heading">How PravahAI Routes</h2>
          <p className="section-subheading">From a simulated road state to a set of defensible route choices</p>
        </div>
        <div className="how-pillars">
          {PILLARS.map((p, i) => (
            <div key={p.name} style={{ display: "contents" }}>
              {i > 0 && <div className="how-arrow"><ChevronRight size={32} /></div>}
              <div className="how-pillar" onClick={() => navigate("/method")} role="button" tabIndex={0}
                onKeyDown={e => e.key === "Enter" && navigate("/method")}>
                <div className="pillar-icon-wrap" style={{ background: `${p.color}14`, borderColor: `${p.color}4D`, color: p.color }}>{p.icon}</div>
                <div className="pillar-stage" style={{ color: p.color }}>{p.stage}</div>
                <div className="pillar-name">{p.name}</div>
                <div className="pillar-desc">{p.desc}</div>
                <div className="pillar-cta">Read the method →</div>
              </div>
            </div>
          ))}
        </div>
        <div className="pipeline-strip">
          <div className="pipeline-label">Optimisation Pipeline</div>
          <div className="pipeline-steps">
            {PIPELINE.map((s, i, arr) => (
              <div key={s.name} style={{ display: "flex", alignItems: "center" }}>
                <div className="pipeline-step">
                  <div className="pipeline-step-num">{i + 1}</div>
                  <div className="pipeline-step-name">{s.name}</div>
                  <div className="pipeline-step-sub">{s.sub}</div>
                </div>
                {i < arr.length - 1 && <div className="pipeline-chevron"><ChevronRight size={20} /></div>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className="landing-footer">
        <div className="footer-grid">
          <div className="footer-brand">
            <img src={pravahLogo} alt="PravahAI" className="footer-logo" />
            <div className="footer-tagline">Quantum-Inspired Route Optimisation</div>
            <div className="footer-desc">Multi-objective fleet routing that balances travel time, congestion exposure and cost under changing traffic.</div>
            <div className="footer-disclaimer">All networks, traffic and costs are synthetic and simulated. Results are prototype experiments, not real-world measurements.</div>
          </div>
          <div className="footer-col">
            <div className="footer-col-title">Technology Stack</div>
            {["Adaptive QNSGA-II", "NSGA-II Benchmark", "FastAPI · NetworkX", "NumPy · Pandas", "React · Leaflet", "Recharts"].map(t => (
              <div key={t} className="footer-tech-chip">{t}</div>
            ))}
          </div>
          <div className="footer-col">
            <div className="footer-col-title">Quick Links</div>
            {[{ label: "Route Optimiser", path: "/" }, { label: "Algorithm Benchmark", path: "/benchmark" }, { label: "How It Works", path: "/method" }].map(l => (
              <button key={l.path} className="footer-nav-link" onClick={() => { navigate(l.path); window.scrollTo({ top: 0 }); }}>{l.label}</button>
            ))}
          </div>
          <div className="footer-col">
            <div className="footer-col-title">Demo Network</div>
            <div className="footer-dataset-name"><span className="footer-dataset-dot" />Synthetic city grid</div>
            <div className="footer-dataset-meta">
              Seed 42 · fully reproducible<br />42 intersections · 72 roads<br />12 delivery points · 1 depot<br />Low / Moderate / High traffic
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <span>PravahAI · Route Optimiser · Round 2 prototype</span>
          <span>Smart India Hackathon · Problem SIH26137</span>
        </div>
      </footer>
    </div>
  );
}
