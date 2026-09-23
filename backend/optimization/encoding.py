"""Binary genotype <-> route plan.

The genotype never encodes road edges. For each destination k it holds 12 bits:

    [ priority : 6 bits ][ vehicle : 4 bits ][ path policy : 2 bits ]

Decoding:
    vehicle(k)  = int(vehicle bits) * m // 16         (m = fleet size)
    order       = stops of each vehicle sorted by priority (random-key ordering)
    policy(k)   = PATH_POLICIES[int(policy bits)]     (fastest / calm / shortest / balanced)
    -> Depot -> C3 -> C1 -> C5 -> Depot per vehicle, then capacity repair.

Road-level paths between consecutive stops come from the Dijkstra leg tables.
Both QNSGA-II (bits are *measured* from qubits) and classical NSGA-II (bits evolve by
crossover/mutation) use this exact decoder, so benchmark comparisons are like-for-like.
"""
from __future__ import annotations

import numpy as np

from constraints.handling import repair_capacity
from evaluation.objectives import Solution
from routing.problem import RoutingProblem, PATH_POLICIES

B_PRIO, B_VEH, B_POL = 6, 4, 2
B_STOP = B_PRIO + B_VEH + B_POL
_W_PRIO = 2 ** np.arange(B_PRIO - 1, -1, -1)
_W_VEH = 2 ** np.arange(B_VEH - 1, -1, -1)
_W_POL = 2 ** np.arange(B_POL - 1, -1, -1)


def genome_length(problem: RoutingProblem) -> int:
    return problem.n * B_STOP


def decode(problem: RoutingProblem, bits: np.ndarray, repair: bool = True) -> Solution:
    n, m = problem.n, problem.fleet.vehicles
    g = bits.reshape(n, B_STOP)
    prio = g[:, :B_PRIO] @ _W_PRIO
    veh = (g[:, B_PRIO:B_PRIO + B_VEH] @ _W_VEH) * m // (2 ** B_VEH)
    pol = g[:, B_PRIO + B_VEH:] @ _W_POL
    routes: list[list[int]] = [[] for _ in range(m)]
    for k in sorted(range(n), key=lambda k: (prio[k], k)):
        routes[int(veh[k])].append(k + 1)
    policies = ["fastest"] + [PATH_POLICIES[int(p)] for p in pol]
    sol = Solution(routes=routes, policies=policies)
    return repair_capacity(problem, sol) if repair else sol


def _to_bits(value: int, width: int) -> list[int]:
    return [(value >> (width - 1 - i)) & 1 for i in range(width)]


def encode(problem: RoutingProblem, sol: Solution) -> np.ndarray:
    """Inverse of decode (used for Lamarckian write-back after repair / local search)."""
    n, m = problem.n, problem.fleet.vehicles
    out = np.zeros((n, B_STOP), dtype=np.uint8)
    for v, route in enumerate(sol.routes):
        codes = [c for c in range(2 ** B_VEH) if c * m // (2 ** B_VEH) == v]
        vcode = codes[len(codes) // 2]
        L = len(route)
        for p, s in enumerate(route):
            prio = min(2 ** B_PRIO - 1, int((p + 0.5) / L * 2 ** B_PRIO))
            pol = PATH_POLICIES.index(sol.policies[s])
            out[s - 1] = _to_bits(prio, B_PRIO) + _to_bits(vcode, B_VEH) + _to_bits(pol, B_POL)
    return out.reshape(-1)
