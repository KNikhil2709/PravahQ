# PravahAI Route Optimizer (SIH Round 2 prototype)

Quantum-inspired, multi-objective route optimisation for a delivery fleet on a road network
with simulated traffic. It returns a **Pareto set** of route plans that trade off:

1. **Travel time**: total traffic-adjusted driving minutes
2. **Congestion exposure**: minutes on congested roads, weighted by severity
3. **Operating cost**: ₹ per km plus a fixed cost per vehicle dispatched (illustrative model)

It shows the plans on a map, compares them with a conventional dispatch plan, and
re-optimises when traffic changes.

> Everything runs locally with no API keys. The network, traffic and costs are **synthetic
> and simulated**. No result in this prototype is a real-world measurement.

## Quick start

Requirements: Python 3.10+ and Node 18+.

```bash
# 1. Backend (http://localhost:8000, docs at /docs)
cd backend
pip install -r requirements-dev.txt        # requirements.txt = runtime only (used by Vercel)
uvicorn api.main:app --reload --port 8000

# 2. Frontend (http://localhost:5173)
cd frontend
npm install
npm run dev
```

Set `VITE_API_URL` if the backend is not on `http://localhost:8000`.
To put it online, see [docs/DEPLOY.md](docs/DEPLOY.md) (two Vercel projects, free tier).

Run the tests from the repository root:

```bash
python -m pytest tests -q
```

## Demo script (PRD §14)

1. Open the dashboard and click **Load demo network**: depot and 12 destinations appear.
2. Choose destinations (chips or click on the map), vehicles, capacity, traffic = **Moderate**,
   and the maximum route duration.
3. Click **Optimise routes**. Adaptive QNSGA-II runs in about 1.5 s.
4. Pareto plans appear. Select **Fastest**, **Least congested** and **Balanced** to see a
   different route on the map each time.
5. Click **Simulate traffic change**. Traffic rises one level and lanes close on the corridor
   the plans use most. The system shows what happens if vehicles keep the old roads, then
   re-optimises with a warm start. The Pareto front, convergence chart and map update.

## Architecture

```
backend/
  network/        deterministic synthetic road graph (seed 42: 42 nodes, 72 roads, 12 stops)
  traffic/        LOW / MODERATE / HIGH levels, BPR travel times, simulated lane closures
  routing/        problem definition + Dijkstra leg tables per path policy
  constraints/    capacity repair, feasibility checks
  evaluation/     3 objectives, constrained domination, NDS, crowding, exact 3-D hypervolume
  optimization/
    encoding.py     12-bit genotype per destination <-> route plan (shared by all algorithms)
    base.py         Optimizer interface, registry, shared machinery
    qnsga2/         Adaptive Quantum-Inspired NSGA-II
    nsga2/          classical binary NSGA-II (benchmark reference)
    local_search.py 2-opt / swap / relocate (feasibility-preserving)
    baseline.py     nearest-neighbour, shortest-path, traffic-unaware reference plan
  api/            FastAPI app (main.py), request schemas, service layer
  data/           export_demo.py -> demo_network_seed42.json
frontend/
  src/api/        typed API client (all server calls live here)
  src/hooks/      useOptimizer: workflow state
  src/components/ map/, charts/, dashboard/, layout/
  src/pages/      Optimizer (main dashboard), Benchmark, How it works
tests/            engine + API tests (22)
docs/             API.md, MIGRATION.md
```

The optimiser is independent of the UI and API: `optimization.registry.get("qnsga2").run(problem, params, norm)`.

### Route encoding

The genotype never contains road edges. Each destination has 12 bits:
6 bits of visiting priority, 4 bits of vehicle assignment and 2 bits of path policy
(fastest / low-congestion / shortest / balanced).
Decoding gives e.g. `Depot → C3 → C1 → C5 → Depot` per vehicle. Road paths between
consecutive stops come from Dijkstra under the chosen policy.

### Adaptive QNSGA-II

Each qubit is stored as an angle θ, with α = cos θ and β = sin θ, so |α|² + |β|² = 1.
Each generation runs:

1. **Measure** each qubit (P(1) = |β|²).
2. **Decode** the bits into a route plan and **repair** capacity violations.
3. **Evaluate** the three objectives plus the constraint violation.
4. **Select** survivors by constrained non-dominated sorting and crowding distance (elitism).
5. **Rotate** each register toward its attractor plan. The attractor is replaced whenever the register measures a plan that dominates it, and is periodically re-drawn from the Pareto archive.
6. **Local search** on elite plans.
7. **Quantum NOT mutation** on a small fraction of qubits.

Adaptation works like this:

- The rotation step grows from 0.02π to 0.06π over the run: exploration first, exploitation later.
- If qubit entropy or plan diversity collapses, part of the population is rotated back toward superposition.
- θ is clamped away from 0 and π/2, so no qubit ever becomes deterministic.

It runs classically; there is no quantum hardware and no speed-up claim.

### Constraints

| Constraint | Handling |
|---|---|
| Fleet size, depot start/end, valid road paths | Guaranteed by encoding and Dijkstra |
| Vehicle capacity | Repair (cheapest insertion into a vehicle with spare capacity), then penalty |
| Max route duration, optional time windows | Constrained domination (Deb's rules) |

### Dynamic re-optimisation

`POST /api/traffic-change` escalates the traffic level and closes lanes on the 3 most-used
links (capacity −60%). It then:

- re-evaluates the old plans **on the same roads** under the new traffic;
- re-optimises with a warm start: the archive is re-evaluated and the qubit amplitudes are relaxed 35% toward superposition.

## Results so far (prototype experiment)

Setup: 10 stops, 3 vehicles, moderate traffic, population 40, no local search, same seeds for both algorithms.

| Budget | Adaptive QNSGA-II HV | NSGA-II HV |
|---|---|---|
| 60 generations (2,400 evals), 5 seeds | about 0.88–0.90 × NSGA-II | reference |
| 150 generations (6,000 evals), 3 seeds | 2.430 | 2.433 |

On this instance QNSGA-II converges more slowly, and reaches parity at the larger budget.
These are simulated results on a synthetic network, not validated findings. Reproduce them
on the Benchmark page or with `POST /api/benchmark`.

QPSO, QIGA, APSO and HGS are planned. The optimiser interface is ready for them, but they are
not implemented.

## Limitations

- The network, traffic and cost model are synthetic.
- Traffic is static within a run and roads are symmetric.
- The fleet is limited to 3 vehicles and the 12 demo destinations.
- The in-memory run store keeps the last 30 runs and is single-user; runs are lost on restart.
  On serverless hosting the client re-sends the scenario so a lost run is rebuilt deterministically.
