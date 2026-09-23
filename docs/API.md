# API reference

Base URL: `http://localhost:8000`. Interactive OpenAPI docs are served at `/docs`.
All traffic data is simulated.

## GET /api/health
Returns `{status, algorithms: [{id, label, implemented}]}`.

## GET /api/network?seed=42
Returns the demo network:

- `nodes[{id, x, y, kind}]` in km coordinates
- `edges[{id, u, v, distance_km, lanes, capacity_vph, free_flow_kmh, road_class}]`
- `depot`
- `destinations[{id, node, demand, service_min, window}]`
- `levels`, `path_policies`

## GET /api/traffic?level=MODERATE
Returns `{level, edges[{id, vc, time_min, free_time_min, band, incident}]}`.
`band` is one of `free` (v/c < 0.6), `moderate` (< 0.85), `heavy` (< 1.0) or `severe`.

## POST /api/optimize
```json
{
  "network_seed": 42,
  "destinations": ["C1","C2","C3","C4","C5","C6","C7","C8","C9","C10"],
  "fleet": {"vehicles": 3, "capacity": 12},
  "constraints": {"max_duration_min": 120, "time_windows": true},
  "traffic_level": "MODERATE",
  "algorithm": "qnsga2",
  "params": {"population": 40, "generations": 60, "seed": 7, "local_search": true}
}
```
All fields are optional (the defaults are shown). The response contains:

| Field | Content |
|---|---|
| `run_id` | Use with `/api/traffic-change` |
| `pareto[]` | Feasible non-dominated plans, sorted by travel time. Each has `metrics {travel_time_min, exposure_min, cost_inr, distance_km, heavy_traffic_min, vehicles_used, completion_min}`, `vehicles[]` (stops, path policies, node `path`, `edge_ids`, load, duration, lateness) and `signature` |
| `profiles` | `{fastest, least_congested, lowest_cost, balanced}`, each an index into `pareto` |
| `baseline` | The reference plan, in the same shape as a Pareto plan |
| `history[]` | Per generation: `hypervolume`, `front_size`, `feasible_ratio`, best objectives; for QNSGA-II also `delta_theta`, `qubit_entropy`, `unique_ratio`, `diversity_reset`, `migration` |
| `explored[]` | Sampled `[time, exposure, cost]` of evaluated feasible candidates |
| `edge_states` | Per-edge traffic state for this run |
| `stats` | Run statistics |
| `problem` | Scenario summary, including feasibility issues |
| `notes`, `label` | Messages and the simulated-data label |

An unknown destination returns 422. When no feasible plan exists, the response has an empty
`pareto` and an explanation in `notes`.

## POST /api/traffic-change
Request: `{"run_id": "…", "warm_start": true}`. Response:

- `change {from_level, to_level, incident {edge_ids, label, capacity_factor}, warm_start, generations}`
- `stale_plans` — per profile, the old plan evaluated on the same roads under the new traffic
- `after` — a full optimise response

An unknown or expired run returns 404.

## POST /api/benchmark
Takes the scenario fields plus `seeds[]`, `population`, `generations` and `local_search`
(default false, so both algorithms get exactly the same budget).

The response returns, per algorithm:

- `runs[{seed, hypervolume, pareto_size, evaluations, runtime_s, best, hv_curve}]`
- `hv_mean`, `hv_std`, `pareto_mean`, `runtime_mean`, `evaluations_mean`

It also returns `label` ("Simulated benchmark …"), `setup.metric` and `planned`.
