"""Reference plan: a conventional, traffic-unaware dispatch heuristic.

Nearest-neighbour ordering by road distance, filling one vehicle until the next stop
would exceed capacity, and following shortest-distance paths (what a static planner
without traffic information would produce). It is evaluated under the *current*
simulated traffic so its numbers are directly comparable with optimised plans.
"""
from __future__ import annotations

from evaluation.objectives import Solution, evaluate, Evaluation
from routing.problem import RoutingProblem


def nearest_neighbour_plan(problem: RoutingProblem) -> Solution:
    legs = problem.legs["shortest"]
    cap, m = problem.fleet.capacity, problem.fleet.vehicles
    remaining = set(range(1, problem.n + 1))
    routes: list[list[int]] = [[] for _ in range(m)]
    v, load, cur = 0, 0, 0
    while remaining:
        feasible = [s for s in remaining if load + problem.destinations[s - 1].demand <= cap]
        if not feasible:
            if v < m - 1:
                v, load, cur = v + 1, 0, 0
                continue
            feasible = list(remaining)  # last vehicle takes the rest (may violate capacity)
        s = min(feasible, key=lambda k: (legs[(cur, k)].distance_km, k))
        routes[v].append(s)
        load += problem.destinations[s - 1].demand
        cur = s
        remaining.remove(s)
    return Solution(routes=routes, policies=["shortest"] * (problem.n + 1))


def baseline(problem: RoutingProblem) -> tuple[Solution, Evaluation]:
    sol = nearest_neighbour_plan(problem)
    return sol, evaluate(problem, sol)
