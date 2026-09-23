"""Feasibility-preserving local search applied to selected elite solutions.

Moves: 2-opt (reverse a segment inside one route), swap (exchange two stops, possibly
across vehicles) and relocate (move one stop to another position/vehicle).
A move is accepted only if the new plan constrained-dominates the current one, so a
feasible plan can never become infeasible and no objective gets worse.
"""
from __future__ import annotations

import numpy as np

from evaluation.objectives import Solution, evaluate, Evaluation
from evaluation.pareto import constrained_dominates
from routing.problem import RoutingProblem


def _two_opt(sol: Solution, rng) -> Solution | None:
    cands = [v for v, r in enumerate(sol.routes) if len(r) >= 3]
    if not cands:
        return None
    v = cands[rng.integers(len(cands))]
    r = sol.routes[v]
    i, j = sorted(rng.choice(len(r), size=2, replace=False))
    if j - i < 1:
        return None
    new = sol.copy()
    new.routes[v] = r[:i] + r[i:j + 1][::-1] + r[j + 1:]
    return new


def _swap(sol: Solution, rng) -> Solution | None:
    stops = [(v, p) for v, r in enumerate(sol.routes) for p in range(len(r))]
    if len(stops) < 2:
        return None
    a, b = rng.choice(len(stops), size=2, replace=False)
    (va, pa), (vb, pb) = stops[a], stops[b]
    new = sol.copy()
    new.routes[va][pa], new.routes[vb][pb] = sol.routes[vb][pb], sol.routes[va][pa]
    return new


def _relocate(sol: Solution, rng) -> Solution | None:
    stops = [(v, p) for v, r in enumerate(sol.routes) for p in range(len(r))]
    if not stops:
        return None
    v, p = stops[rng.integers(len(stops))]
    new = sol.copy()
    s = new.routes[v].pop(p)
    w = int(rng.integers(len(new.routes)))
    new.routes[w].insert(int(rng.integers(len(new.routes[w]) + 1)), s)
    return new


MOVES = {"2-opt": _two_opt, "swap": _swap, "relocate": _relocate}


def improve(problem: RoutingProblem, sol: Solution, ev: Evaluation, rng: np.random.Generator,
            budget: int = 30) -> tuple[Solution, Evaluation, int, dict]:
    """Returns (solution, evaluation, evaluations_used, accepted_move_counts)."""
    used = 0
    accepted = {k: 0 for k in MOVES}
    names = list(MOVES)
    while used < budget:
        name = names[int(rng.integers(len(names)))]
        cand = MOVES[name](sol, rng)
        if cand is None:
            used += 1  # count failed move draws so the loop always terminates
            continue
        cev = evaluate(problem, cand)
        used += 1
        if constrained_dominates(cev.objectives, cev.cv, ev.objectives, ev.cv):
            sol, ev = cand, cev
            accepted[name] += 1
    return sol, ev, used, accepted
