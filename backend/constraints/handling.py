"""Constraint handling.

Two mechanisms, used together:
1. Repair (capacity): move stops out of overloaded vehicles into vehicles with spare
   capacity at their cheapest insertion position (by traffic-adjusted time).
2. Constrained domination (Deb's rules, see evaluation.pareto): any remaining violation
   of capacity / max duration / time windows is carried as `cv` so infeasible plans are
   ranked below feasible ones instead of being silently discarded.

Fleet size, depot start/end and valid road paths are guaranteed by the encoding and the
Dijkstra leg tables, so they never need repair.
"""
from __future__ import annotations

from evaluation.objectives import Solution
from routing.problem import RoutingProblem


def route_load(problem: RoutingProblem, route: list[int]) -> int:
    return sum(problem.destinations[s - 1].demand for s in route)


def _insertion_cost(problem: RoutingProblem, route: list[int], s: int, pos: int) -> float:
    legs = problem.legs["fastest"]
    prev = route[pos - 1] if pos > 0 else 0
    nxt = route[pos] if pos < len(route) else 0
    removed = legs[(prev, nxt)].time_min if prev != nxt else 0.0  # empty route: depot -> depot
    return legs[(prev, s)].time_min + legs[(s, nxt)].time_min - removed


def repair_capacity(problem: RoutingProblem, sol: Solution) -> Solution:
    cap = problem.fleet.capacity
    routes = sol.routes
    for _ in range(problem.n):
        loads = [route_load(problem, r) for r in routes]
        over = [v for v, l in enumerate(loads) if l > cap]
        if not over:
            break
        v = max(over, key=lambda k: loads[k])
        best = None
        for s in routes[v]:
            d = problem.destinations[s - 1].demand
            for w, r in enumerate(routes):
                if w == v or loads[w] + d > cap:
                    continue
                for pos in range(len(r) + 1):
                    c = _insertion_cost(problem, r, s, pos)
                    if best is None or c < best[0]:
                        best = (c, s, w, pos)
        if best is None:
            break  # cannot repair: fleet capacity is insufficient; cv will report it
        _, s, w, pos = best
        routes[v].remove(s)
        routes[w].insert(pos, s)
    return sol


def violation_summary(problem: RoutingProblem) -> dict:
    """Problem-level feasibility checks that the UI should surface before optimising."""
    fleet_cap = problem.fleet.vehicles * problem.fleet.capacity
    issues = []
    if problem.total_demand > fleet_cap:
        issues.append(f"Total demand {problem.total_demand} exceeds fleet capacity {fleet_cap}.")
    too_big = [d.id for d in problem.destinations if d.demand > problem.fleet.capacity]
    if too_big:
        issues.append(f"Stops {', '.join(too_big)} exceed single-vehicle capacity.")
    return {"total_demand": problem.total_demand, "fleet_capacity": fleet_cap, "issues": issues}
