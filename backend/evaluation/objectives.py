"""Solution representation and evaluation of the three objectives.

Objectives (all minimised, never combined into a single weighted score):
    f1  total travel time    - driving minutes summed over all vehicles (traffic-adjusted)
    f2  congestion exposure  - minutes on congested links weighted by severity
                               (0 below v/c 0.6, 1.0 at capacity; see traffic.simulator)
    f3  operating cost (INR) - per-km running cost + fixed dispatch cost per vehicle used

Constraints produce a single aggregate violation `cv` (0 = feasible):
    capacity, maximum route duration, and (optionally) time-window lateness.
Fleet size, depot start/end and valid road paths are guaranteed by construction.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from routing.problem import RoutingProblem, Leg


@dataclass
class Solution:
    routes: list[list[int]]          # per vehicle: stop indices 1..n in visiting order
    policies: list[str]              # per stop index 0..n (index 0 unused): path policy into that stop

    def copy(self) -> "Solution":
        return Solution([list(r) for r in self.routes], list(self.policies))

    def key(self) -> tuple:
        return tuple(tuple((s, self.policies[s]) for s in r) for r in self.routes)


@dataclass
class VehiclePlan:
    stops: list[int]
    legs: list[Leg]
    load: int
    driving_min: float
    duration_min: float
    distance_km: float
    exposure: float
    heavy_min: float
    lateness_min: float
    arrivals: list[float]


@dataclass
class Evaluation:
    objectives: np.ndarray           # [time, exposure, cost]
    cv: float
    vehicles: list[VehiclePlan] = field(default_factory=list)
    violations: dict = field(default_factory=dict)

    @property
    def feasible(self) -> bool:
        return self.cv <= 1e-9


def evaluate(problem: RoutingProblem, sol: Solution) -> Evaluation:
    cap = problem.fleet.capacity
    tmax = problem.constraints.max_duration_min
    use_tw = problem.constraints.time_windows
    total_t = total_exp = total_dist = 0.0
    used = 0
    cap_excess = dur_excess = late_total = 0.0
    plans: list[VehiclePlan] = []

    for route in sol.routes:
        if not route:
            plans.append(VehiclePlan([], [], 0, 0, 0, 0, 0, 0, 0, []))
            continue
        used += 1
        clock = drive = dist = exp = heavy = late = 0.0
        load = 0
        legs: list[Leg] = []
        arrivals: list[float] = []
        prev = 0
        for s in route:
            leg = problem.legs[sol.policies[s]][(prev, s)]
            legs.append(leg)
            clock += leg.time_min
            drive += leg.time_min
            dist += leg.distance_km
            exp += leg.exposure
            heavy += leg.heavy_min
            dest = problem.destinations[s - 1]
            arrivals.append(clock)
            if use_tw and dest.window:
                early, latest = dest.window
                if clock < early:
                    clock = early
                late += max(0.0, clock - latest)
            clock += dest.service_min
            load += dest.demand
            prev = s
        back = problem.legs[sol.policies[route[-1]]][(prev, 0)]
        legs.append(back)
        clock += back.time_min
        drive += back.time_min
        dist += back.distance_km
        exp += back.exposure
        heavy += back.heavy_min

        cap_excess += max(0, load - cap) / cap
        dur_excess += max(0.0, clock - tmax) / tmax
        late_total += late
        total_t += drive
        total_exp += exp
        total_dist += dist
        plans.append(VehiclePlan(list(route), legs, load, drive, clock, dist, exp, heavy, late, arrivals))

    cost = total_dist * problem.cost.per_km + used * problem.cost.per_vehicle_dispatch
    tw_term = late_total / 30.0 if use_tw else 0.0
    cv = cap_excess + dur_excess + tw_term
    return Evaluation(
        objectives=np.array([total_t, total_exp, cost], dtype=float),
        cv=float(cv),
        vehicles=plans,
        violations={"capacity": cap_excess, "duration": dur_excess, "lateness_min": late_total if use_tw else 0.0},
    )
