"""Application service: builds problems, runs optimisers, serialises results.

Kept separate from FastAPI routing so it can be tested and reused directly.
"""
from __future__ import annotations

import copy
import threading
import uuid
from collections import Counter, OrderedDict

import numpy as np

from api.schemas import BenchmarkIn, OptimizeIn, ScenarioIn
from constraints.handling import violation_summary
from evaluation.objectives import Evaluation, Solution, evaluate
from evaluation.pareto import hypervolume_3d
from network.generator import RoadNetwork, generate_network
from optimization import registry
from optimization.base import HV_REF, Params, RunResult
from optimization.baseline import baseline
from routing.problem import (ConstraintConfig, FleetConfig, RoutingProblem, make_problem,
                             PATH_POLICIES, retime_leg)
from traffic.simulator import Incident, TrafficLevel, escalate

_lock = threading.Lock()
_networks: dict[int, RoadNetwork] = {}
_runs: "OrderedDict[str, dict]" = OrderedDict()
MAX_RUNS = 30

PROFILE_ORDER = ["fastest", "least_congested", "lowest_cost", "balanced"]


class RunNotFound(Exception):
    pass


def network(seed: int) -> RoadNetwork:
    if seed not in _networks:
        _networks[seed] = generate_network(seed)
    return _networks[seed]


def build_problem(sc: ScenarioIn, level: str | None = None, incident: Incident | None = None) -> RoutingProblem:
    net = network(sc.network_seed)
    valid = {d.id for d in net.destinations}
    bad = [d for d in sc.destinations if d not in valid]
    if bad:
        raise ValueError(f"Unknown destinations: {bad}")
    if not sc.destinations:
        raise ValueError("Select at least one destination.")
    with _lock:  # traffic application mutates shared graph attributes
        return make_problem(net, list(dict.fromkeys(sc.destinations)),
                            FleetConfig(sc.fleet.vehicles, sc.fleet.capacity),
                            ConstraintConfig(sc.constraints.max_duration_min, sc.constraints.time_windows),
                            level or sc.traffic_level, incident)


# ─── serialisation ────────────────────────────────────────────────────────────

def _metrics(ev: Evaluation) -> dict:
    used = [v for v in ev.vehicles if v.stops]
    return {
        "travel_time_min": round(float(ev.objectives[0]), 2),
        "exposure_min": round(float(ev.objectives[1]), 2),
        "cost_inr": round(float(ev.objectives[2]), 1),
        "distance_km": round(sum(v.distance_km for v in used), 2),
        "heavy_traffic_min": round(sum(v.heavy_min for v in used), 2),
        "vehicles_used": len(used),
        "completion_min": round(max((v.duration_min for v in used), default=0.0), 1),
    }


def serialize_solution(problem: RoutingProblem, sol: Solution, ev: Evaluation) -> dict:
    vehicles = []
    for k, plan in enumerate(ev.vehicles):
        path: list[int] = []
        edges: list[int] = []
        for leg in plan.legs:
            path.extend(leg.nodes if not path else leg.nodes[1:])
            edges.extend(leg.edge_ids)
        vehicles.append({
            "vehicle": k + 1,
            "stops": [problem.destinations[s - 1].id for s in plan.stops],
            "policies": [sol.policies[s] for s in plan.stops],
            "arrivals_min": [round(a, 1) for a in plan.arrivals],
            "load": plan.load, "capacity": problem.fleet.capacity,
            "duration_min": round(plan.duration_min, 1), "driving_min": round(plan.driving_min, 1),
            "distance_km": round(plan.distance_km, 2), "exposure_min": round(plan.exposure, 2),
            "heavy_traffic_min": round(plan.heavy_min, 1), "lateness_min": round(plan.lateness_min, 1),
            "path": path, "edge_ids": edges,
        })
    return {
        "metrics": _metrics(ev),
        "feasible": ev.feasible,
        "violation": round(ev.cv, 4),
        "violations": {k: round(v, 3) for k, v in ev.violations.items()},
        "vehicles": vehicles,
        "signature": " | ".join("→".join(v["stops"]) or "—" for v in vehicles),
    }


def _pick_profiles(F: np.ndarray) -> dict[str, int]:
    if len(F) == 0:
        return {}
    lo, hi = F.min(axis=0), F.max(axis=0)
    span = np.where(hi - lo > 1e-9, hi - lo, 1.0)
    Z = (F - lo) / span
    return {
        "fastest": int(np.lexsort((F[:, 2], F[:, 1], F[:, 0]))[0]),
        "least_congested": int(np.lexsort((F[:, 2], F[:, 0], F[:, 1]))[0]),
        "lowest_cost": int(np.lexsort((F[:, 1], F[:, 0], F[:, 2]))[0]),
        "balanced": int(np.argmin(np.linalg.norm(Z, axis=1))),  # closest to the ideal point
    }


def _edge_states(problem: RoutingProblem) -> list[dict]:
    return [{"id": eid, "vc": round(s["vc"], 3), "time_min": round(s["time_min"], 3),
             "free_time_min": round(s["free_time_min"], 3), "band": s["band"], "incident": s["incident"]}
            for eid, s in sorted(problem.traffic.edges.items())]


def _problem_summary(problem: RoutingProblem, req: ScenarioIn) -> dict:
    return {
        "destinations": [d.id for d in problem.destinations],
        "fleet": {"vehicles": problem.fleet.vehicles, "capacity": problem.fleet.capacity},
        "constraints": {"max_duration_min": problem.constraints.max_duration_min,
                        "time_windows": problem.constraints.time_windows},
        "traffic_level": problem.traffic.level.value,
        "incident": ({"edge_ids": problem.traffic.incident.edge_ids,
                      "capacity_factor": problem.traffic.incident.capacity_factor,
                      "label": problem.traffic.incident.label} if problem.traffic.incident else None),
        "feasibility": violation_summary(problem),
        "genome_bits": problem.n * 12,
        "cost_model": {"per_km_inr": problem.cost.per_km, "per_vehicle_dispatch_inr": problem.cost.per_vehicle_dispatch},
    }


def _result_payload(run_id: str, req: OptimizeIn, problem: RoutingProblem, result: RunResult,
                    base_sol: Solution, base_ev: Evaluation) -> dict:
    front = [result.archive[i] for i in result.pareto]
    F = np.array([p.ev.objectives for p in front]) if front else np.zeros((0, 3))
    order = np.lexsort((F[:, 2], F[:, 1], F[:, 0])) if len(F) else []
    front = [front[i] for i in order]
    F = F[order] if len(F) else F
    picks = _pick_profiles(F)
    solutions = [{"index": i, **serialize_solution(problem, p.sol, p.ev)} for i, p in enumerate(front)]
    notes = list(result.notes)
    if not front:
        notes.append("No feasible plan found. Relax constraints (capacity, fleet size, max duration) "
                     "or reduce the destination set.")
    return {
        "run_id": run_id,
        "algorithm": {"id": result.algorithm, "label": registry.get(result.algorithm).label},
        "problem": _problem_summary(problem, req),
        "baseline": {"label": "Nearest-neighbour dispatch on shortest-distance paths (traffic-unaware)",
                     **serialize_solution(problem, base_sol, base_ev)},
        "pareto": solutions,
        "profiles": picks,
        "history": result.history,
        "explored": [[round(x, 2) for x in e] for e in result.explored],
        "hypervolume": round(hypervolume_3d(F / base_ev.objectives, HV_REF), 5) if len(F) else 0.0,
        "stats": {"evaluations": result.evaluations, "runtime_s": result.runtime_s,
                  "pareto_size": len(front), "local_search_accepted": result.ls_accepted,
                  "population": req.params.population, "generations": len(result.history)},
        "edge_states": _edge_states(problem),
        "notes": notes,
        "label": "Simulated scenario on a synthetic network. Not real-world traffic data.",
    }


def _store(run_id: str, entry: dict) -> None:
    _runs[run_id] = entry
    while len(_runs) > MAX_RUNS:
        _runs.popitem(last=False)


# ─── use cases ────────────────────────────────────────────────────────────────

def optimize(req: OptimizeIn, level: str | None = None, incident: Incident | None = None,
             warm_state: dict | None = None, generations: int | None = None) -> dict:
    problem = build_problem(req, level, incident)
    base_sol, base_ev = baseline(problem)
    params = Params(population=req.params.population, generations=generations or req.params.generations,
                    seed=req.params.seed, local_search=req.params.local_search)
    result = registry.get(req.algorithm).run(problem, params, base_ev.objectives, warm_state)
    run_id = uuid.uuid4().hex[:10]
    payload = _result_payload(run_id, req, problem, result, base_sol, base_ev)
    _store(run_id, {"request": req, "problem": problem, "result": result, "payload": payload})
    return payload


def evaluate_same_roads(old_problem: RoutingProblem, new_problem: RoutingProblem, sol: Solution) -> Evaluation:
    """Evaluate a plan on exactly the roads it used before, under the new traffic.

    Each (from-stop, to-stop) pair occurs at most once in a plan, so a per-plan leg table
    keyed by pair is unambiguous.
    """
    fixed = copy.copy(new_problem)
    fixed.legs = {pol: {} for pol in PATH_POLICIES}
    for route in sol.routes:
        if not route:
            continue
        prev = 0
        for s_ in route + [0]:
            pol = sol.policies[s_ if s_ else prev]
            fixed.legs[pol][(prev, s_)] = retime_leg(new_problem, old_problem.legs[pol][(prev, s_)])
            prev = s_
    return evaluate(fixed, sol)


def _choose_incident(entry: dict) -> Incident:
    """Place a simulated lane closure on the corridor most used by the current plans."""
    problem: RoutingProblem = entry["problem"]
    g = problem.network.graph
    usage: Counter = Counter()
    for s in entry["payload"]["pareto"]:
        for v in s["vehicles"]:
            usage.update(v["edge_ids"])
    by_id = {d["eid"]: (u, v, d) for u, v, d in g.edges(data=True)}
    if not usage:
        usage.update({eid: d["base_ratio"] for eid, (_, _, d) in by_id.items()})
    seed_eid = max(usage, key=lambda e: (usage[e], by_id[e][2]["road_class"] == "arterial", -e))
    u, v, d = by_id[seed_eid]
    chosen = [seed_eid]
    frontier = [u, v]
    while frontier and len(chosen) < 3:
        n = frontier.pop(0)
        nbrs = sorted(((g.edges[n, m]["eid"], m) for m in g.neighbors(n)
                       if g.edges[n, m]["road_class"] == d["road_class"] and g.edges[n, m]["eid"] not in chosen),
                      key=lambda t: -usage.get(t[0], 0))
        if nbrs:
            chosen.append(nbrs[0][0])
            frontier.append(nbrs[0][1])
    label = f"Simulated lane closure on {len(chosen)} {d['road_class']} links (capacity −60%)"
    return Incident(edge_ids=sorted(chosen), capacity_factor=0.4, label=label)


def traffic_change(run_id: str, warm_start: bool = True, scenario: OptimizeIn | None = None) -> dict:
    entry = _runs.get(run_id)
    if entry is None and scenario is not None:
        # Rebuild the missing run deterministically (same seed -> identical result), then
        # continue as if it had been in memory. Keeps the feature working on serverless.
        rebuilt = optimize(scenario)
        entry = _runs[rebuilt["run_id"]]
        run_id = rebuilt["run_id"]
    if entry is None:
        raise RunNotFound("Run not found or expired. Optimise again, then simulate the change.")
    req: OptimizeIn = entry["request"]
    old_problem: RoutingProblem = entry["problem"]
    old_level = old_problem.traffic.level
    new_level = escalate(old_level)
    incident = _choose_incident(entry)

    warm = entry["result"].state if warm_start and req.algorithm == entry["result"].algorithm else None
    gens = max(10, req.params.generations // 2) if warm else req.params.generations
    after = optimize(req, new_level.value, incident, warm_state=warm, generations=gens)

    # Impact of the change on the plans the operator was already following
    new_problem: RoutingProblem = _runs[after["run_id"]]["problem"]
    before_payload = entry["payload"]
    old_front = [entry["result"].archive[i] for i in entry["result"].pareto]
    old_F = np.array([p.ev.objectives for p in old_front]) if old_front else np.zeros((0, 3))
    order = np.lexsort((old_F[:, 2], old_F[:, 1], old_F[:, 0])) if len(old_F) else []
    old_front = [old_front[i] for i in order]
    stale = {}
    for name, idx in before_payload["profiles"].items():
        sol = old_front[idx].sol
        ev = evaluate_same_roads(old_problem, new_problem, sol)
        stale[name] = {"metrics": _metrics(ev), "feasible": ev.feasible}

    return {
        "change": {
            "from_level": old_level.value, "to_level": new_level.value,
            "incident": {"edge_ids": incident.edge_ids, "label": incident.label,
                         "capacity_factor": incident.capacity_factor},
            "warm_start": warm is not None, "generations": gens,
        },
        "before_run_id": run_id,
        "stale_plans": stale,
        "after": after,
    }


def benchmark(req: BenchmarkIn) -> dict:
    problem = build_problem(req)
    _, base_ev = baseline(problem)
    norm = base_ev.objectives
    out = {}
    for alg in ["qnsga2", "nsga2"]:
        runs = []
        for seed in req.seeds:
            r = registry.get(alg).run(problem, Params(population=req.population, generations=req.generations,
                                                      seed=seed, local_search=req.local_search), norm)
            F = np.array([r.archive[i].ev.objectives for i in r.pareto]) if r.pareto else np.zeros((0, 3))
            runs.append({
                "seed": seed, "hypervolume": round(hypervolume_3d(F / norm, HV_REF), 5),
                "pareto_size": len(r.pareto), "evaluations": r.evaluations, "runtime_s": r.runtime_s,
                "best": F.min(axis=0).round(2).tolist() if len(F) else None,
                "hv_curve": [[h["evaluations"], h["hypervolume"]] for h in r.history],
            })
        hv = np.array([x["hypervolume"] for x in runs])
        out[alg] = {"label": registry.get(alg).label, "runs": runs,
                    "hv_mean": round(float(hv.mean()), 5), "hv_std": round(float(hv.std()), 5),
                    "pareto_mean": round(float(np.mean([x["pareto_size"] for x in runs])), 1),
                    "runtime_mean": round(float(np.mean([x["runtime_s"] for x in runs])), 3),
                    "evaluations_mean": round(float(np.mean([x["evaluations"] for x in runs])), 0)}
    return {
        "label": "Simulated benchmark — prototype experiment on a synthetic network, not a validated result.",
        "problem": _problem_summary(problem, req),
        "setup": {"seeds": req.seeds, "population": req.population, "generations": req.generations,
                  "local_search": req.local_search,
                  "metric": "Hypervolume in baseline-normalised objective space, reference point (2, 2, 2). Higher is better."},
        "algorithms": out,
        "planned": registry.PLANNED,
    }


def algorithms() -> list[dict]:
    return [{"id": k, "label": v.label, "implemented": True} for k, v in registry.REGISTRY.items()] + \
           [{"id": p.lower(), "label": p, "implemented": False} for p in registry.PLANNED]


def path_policies() -> list[str]:
    return list(PATH_POLICIES)


def traffic_preview(seed: int, level: str) -> list[dict]:
    """Edge states for a traffic level before any optimisation (for the map)."""
    sc = ScenarioIn(network_seed=seed, traffic_level=level)  # type: ignore[arg-type]
    return _edge_states(build_problem(sc))


def levels() -> list[str]:
    return [l.value for l in TrafficLevel]
