import { useEffect, useState } from "react";

// Layout adapted from the Round 1 Methodology page (sticky section index + content).
const SECTIONS = [
  { id: "problem", label: "The problem" },
  { id: "network", label: "Network and traffic" },
  { id: "encoding", label: "Route encoding" },
  { id: "qnsga", label: "Adaptive QNSGA-II" },
  { id: "objectives", label: "Objectives and constraints" },
  { id: "improvement", label: "Measuring improvement" },
  { id: "reopt", label: "Re-optimisation" },
  { id: "limits", label: "Limitations" },
];

export default function HowItWorks() {
  const [active, setActive] = useState("problem");
  useEffect(() => {
    const obs = new IntersectionObserver(es => es.forEach(e => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: "-30% 0px -60% 0px" });
    SECTIONS.forEach(s => { const el = document.getElementById(s.id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, []);

  return (
    <div className="doc-page doc-with-index">
      <nav className="doc-index" aria-label="Sections">
        {SECTIONS.map(s => <a key={s.id} href={`#${s.id}`} className={active === s.id ? "is-active" : ""}>{s.label}</a>)}
      </nav>
      <article className="doc-body">
        <header className="doc-header">
          <h1>How the route optimiser works</h1>
          <p>Traffic and network inputs → simulated road state → quantum-inspired multi-objective search → a set of trade-off route plans → a chosen plan with measured improvement over a conventional plan.</p>
        </header>

        <section id="problem" className="doc-section">
          <h2>The problem</h2>
          <p>A depot dispatches a small fleet (up to 3 vehicles) to 8–12 delivery points. Each plan decides which vehicle serves which stop, in what order, and which road path each vehicle takes between stops. There is no single best plan: the fastest routes use busy arterials, the calmest routes take longer side streets, and the cheapest plan dispatches fewer vehicles. The system therefore returns a set of Pareto-optimal plans and lets the operator choose.</p>
        </section>

        <section id="network" className="doc-section">
          <h2>Network and traffic</h2>
          <p>The demo network is a synthetic 42-intersection grid (72 roads) generated from a fixed seed, so every run is reproducible and nothing depends on external services. Each road has a length, lane count, capacity (800–3,600 vehicles/hour) and free-flow speed (28–50 km/h) by road class.</p>
          <p>Traffic is simulated. Each road has a base demand; the traffic level (Low, Moderate, High) scales it to a volume/capacity ratio v/c, and travel time follows the BPR link model used in transport planning:</p>
          <div className="formula">t = t₀ × (1 + 0.15 × (v/c)⁴)</div>
          <p>A simulated incident (lane closure) cuts capacity to 40% on selected roads, raising their v/c.</p>
        </section>

        <section id="encoding" className="doc-section">
          <h2>Route encoding</h2>
          <p>The optimiser never manipulates individual roads. Each destination carries 12 bits: 6 for visiting priority, 4 for vehicle assignment and 2 for path policy (fastest, low-congestion, shortest or balanced). Decoding sorts each vehicle's stops by priority to give a sequence such as Depot → C3 → C1 → C5 → Depot. Road paths between consecutive stops come from Dijkstra's algorithm under the chosen policy, precomputed for every pair of stops.</p>
        </section>

        <section id="qnsga" className="doc-section">
          <h2>Adaptive QNSGA-II</h2>
          <p>Each candidate is a register of qubits, one per bit. A qubit is stored as an angle θ with amplitudes α = cos θ and β = sin θ, so |α|² + |β|² = 1 always holds. It runs on an ordinary computer; no quantum hardware or quantum speed-up is involved. "Quantum-inspired" refers to this probabilistic representation and the rotation update.</p>
          <ol className="doc-steps">
            <li><strong>Measure</strong> every register: each bit becomes 1 with probability |β|².</li>
            <li><strong>Decode and repair</strong> into a route plan; overloaded vehicles hand stops to vehicles with spare capacity.</li>
            <li><strong>Evaluate</strong> travel time, congestion exposure and cost, plus any constraint violation.</li>
            <li><strong>Select</strong> survivors by NSGA-II non-dominated sorting and crowding distance (elitism).</li>
            <li><strong>Rotate</strong> each register toward its attractor plan on the bits where they differ. Attractors are re-drawn from the Pareto archive periodically so they spread along the front.</li>
            <li><strong>Local search</strong> (2-opt, swap, relocate) on a few elite plans every 5 generations; a move is kept only if it improves without breaking constraints.</li>
            <li><strong>Mutate</strong> a few qubits with a quantum NOT (swap α and β).</li>
          </ol>
          <p>The rotation step grows from 0.02π to 0.06π over the run: small steps early keep probabilities near 50/50 (exploration), larger steps later commit to good structures (exploitation). If qubit entropy or the share of distinct plans collapses, part of the population is rotated back toward superposition. The convergence chart shows both hypervolume and qubit entropy.</p>
        </section>

        <section id="objectives" className="doc-section">
          <h2>Objectives and constraints</h2>
          <p>Three objectives are minimised separately and never merged into one weighted score:</p>
          <dl className="doc-defs">
            <div><dt>Travel time</dt><dd>Total traffic-adjusted driving minutes across all vehicles.</dd></div>
            <div><dt>Congestion exposure</dt><dd>Minutes driven on congested roads, weighted by severity: zero at or below v/c 0.6, full weight at capacity.</dd></div>
            <div><dt>Cost</dt><dd>Illustrative model: ₹18 per km plus ₹350 per vehicle dispatched.</dd></div>
          </dl>
          <p>Fleet size, depot start/end and valid road paths are guaranteed by the encoding. Vehicle capacity is repaired where possible; maximum route duration and delivery windows are enforced by constrained domination, which ranks any feasible plan above any infeasible one.</p>
        </section>

        <section id="improvement" className="doc-section">
          <h2>Measuring improvement</h2>
          <p>Every result is compared with a conventional plan: nearest-neighbour stop ordering on shortest-distance paths, filling one vehicle at a time and ignoring traffic. It is evaluated under the same simulated traffic, so every percentage on screen is computed, not assumed. Profile cards pick the fastest, least-congested and cheapest Pareto plans, and a balanced plan closest to the ideal point.</p>
        </section>

        <section id="reopt" className="doc-section">
          <h2>Re-optimisation</h2>
          <p>Simulating a traffic change raises the level one step and closes lanes on the roads the current plans use most. The system first shows what happens if vehicles keep the old plan, then re-optimises with a warm start: archived plans are re-evaluated under the new traffic and the qubit amplitudes are relaxed 35% toward superposition so the search can explore again.</p>
        </section>

        <section id="limits" className="doc-section">
          <h2>Limitations</h2>
          <ul>
            <li>Network, traffic and costs are synthetic and simulated; no result here is a real-world measurement.</li>
            <li>Traffic is static within a run (no time-of-day dynamics) and roads are two-way with equal conditions in both directions.</li>
            <li>On this instance and budget, the prototype's QNSGA-II has so far reached a lower mean hypervolume than classical NSGA-II. Run the benchmark page to reproduce the comparison. No superiority is claimed.</li>
            <li>QPSO, QIGA, APSO and HGS are planned comparisons and are not implemented.</li>
          </ul>
        </section>
      </article>
    </div>
  );
}
