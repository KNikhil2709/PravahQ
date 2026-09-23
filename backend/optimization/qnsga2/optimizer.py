"""Adaptive Quantum-Inspired NSGA-II (runs classically; no quantum hardware).

Representation
    Each individual is a register of L qubits. Qubit j is stored as an angle theta_j:
        q_j = alpha_j|0> + beta_j|1>,  alpha = cos(theta), beta = sin(theta)
    so |alpha|^2 + |beta|^2 = 1 holds by construction. theta = pi/4 is the uniform
    superposition (P(1) = 0.5).

One generation
    1. Measure every register: bit_j = 1 with probability |beta_j|^2  -> binary genotype
    2. Decode genotype -> route plan (see optimization.encoding), repair capacity
    3. Evaluate the three objectives + constraint violation
    4. Merge with the elite archive; constrained non-dominated sorting + crowding
       distance select the next archive (elitism)
    5. Adaptive quantum rotation: each register i is rotated toward its attractor B_i on
       the bits where the measured genotype differs from B_i. B_i is replaced when the
       register measures a plan that constrained-dominates it (local update), and every
       few generations B_i is re-drawn from the Pareto archive by binary tournament on
       (rank, crowding) - global migration that spreads attractors along the front.
    6. Local search (2-opt / swap / relocate) on a few elite plans every few generations
    7. Quantum NOT mutation on a small fraction of qubits

Adaptation
    Rotation step grows from dtheta_min to dtheta_max across the run: small steps keep
    probabilities near 0.5 early (exploration); larger steps later concentrate them
    around elite plans (exploitation). If diversity collapses (qubit entropy or share of
    distinct measured plans falls below a threshold), part of the population is rotated
    back toward superposition and the step is halved for that generation.
    theta is clamped to [margin, pi/2 - margin] so no qubit ever becomes deterministic.
"""
from __future__ import annotations

import math
import time

import numpy as np

from optimization.base import (EvalCounter, Individual, Optimizer, Params, RunResult, arrays,
                               generation_record, register, run_local_search, survivors,
                               tournament)
from optimization.encoding import genome_length
from evaluation.pareto import rank_and_crowding, constrained_dominates
from routing.problem import RoutingProblem

QUARTER = math.pi / 4


@register
class AdaptiveQNSGA2(Optimizer):
    name = "qnsga2"
    label = "Adaptive QNSGA-II"

    def __init__(self, dtheta_min: float = 0.02 * math.pi, dtheta_max: float = 0.06 * math.pi,
                 margin: float = 0.01 * math.pi, entropy_floor: float = 0.12,
                 unique_floor: float = 0.3, not_rate: float = 0.001, reset_share: float = 0.4,
                 migration_period: int = 20):
        self.migration_period = migration_period
        self.dtheta_min, self.dtheta_max = dtheta_min, dtheta_max
        self.margin = margin
        self.entropy_floor, self.unique_floor = entropy_floor, unique_floor
        self.not_rate, self.reset_share = not_rate, reset_share

    def run(self, problem: RoutingProblem, params: Params, norm: np.ndarray,
            warm_state: dict | None = None) -> RunResult:
        t0 = time.perf_counter()
        rng = np.random.default_rng(params.seed)
        N, G, L = params.population, params.generations, genome_length(problem)
        counter = EvalCounter(problem, norm, rng)
        notes: list[str] = []
        accepted: dict = {}

        theta = np.full((N, L), QUARTER)
        parents: list[Individual] = []
        if warm_state and warm_state.get("theta") is not None and warm_state["theta"].shape == (N, L):
            # Warm start: keep learned amplitudes but pull them part-way back to
            # superposition so the new traffic situation can be explored.
            theta = warm_state["theta"] + 0.35 * (QUARTER - warm_state["theta"])
            parents = [counter.individual(b) for b in warm_state.get("archive_bits", [])]
            notes.append(f"Warm start: {len(parents)} archived plans re-evaluated under the new traffic; "
                         "qubit amplitudes relaxed 35% toward superposition.")

        history: list[dict] = []
        attractors: list[Individual] = []
        lo, hi = self.margin, math.pi / 2 - self.margin
        for g in range(G):
            # 1-3. measure -> decode (+repair) -> evaluate
            X = (rng.random((N, L)) < np.sin(theta) ** 2).astype(np.uint8)
            offspring = [counter.individual(x) for x in X]

            # 4. elitist non-dominated selection into the archive
            parents = survivors(parents + offspring, N)

            # 6. local search on elite plans
            if params.local_search and g % params.ls_every == params.ls_every - 1:
                parents = run_local_search(counter, parents, params, rng, accepted)

            # attractor update: local replacement + periodic global migration from archive
            F, CV = arrays(parents)
            rank, crowd, _ = rank_and_crowding(F, CV)
            if not attractors:
                attractors = [parents[tournament(rng, rank, crowd)] for _ in range(N)]
            migrated = g % self.migration_period == 0
            for i, child in enumerate(offspring):
                if migrated:
                    attractors[i] = parents[tournament(rng, rank, crowd)]
                elif constrained_dominates(child.ev.objectives, child.ev.cv,
                                           attractors[i].ev.objectives, attractors[i].ev.cv):
                    attractors[i] = child

            # 5. adaptive rotation
            progress = g / max(1, G - 1)
            dtheta = self.dtheta_min + (self.dtheta_max - self.dtheta_min) * progress
            p1 = np.sin(theta) ** 2
            entropy = float(np.mean(4 * p1 * (1 - p1)))
            unique = len({o.sol.key() for o in offspring}) / N
            reset = False
            if g > 2 and (entropy < self.entropy_floor or unique < self.unique_floor):
                rows = rng.choice(N, size=max(1, int(self.reset_share * N)), replace=False)
                theta[rows] += 0.5 * (QUARTER - theta[rows])
                dtheta *= 0.5
                reset = True
            B = np.stack([a.bits for a in attractors])
            diff = X != B                                   # measured bits vs attractor bits
            theta += np.where(diff, np.where(B == 1, dtheta, -dtheta), 0.0)

            # 7. quantum NOT gate: swap alpha and beta on a few qubits
            mask = rng.random((N, L)) < self.not_rate
            theta[mask] = math.pi / 2 - theta[mask]
            np.clip(theta, lo, hi, out=theta)

            rec = generation_record(g, counter, parents)
            rec.update({"delta_theta": round(dtheta, 5), "qubit_entropy": round(entropy, 4),
                        "unique_ratio": round(unique, 3), "diversity_reset": reset,
                        "migration": migrated})
            history.append(rec)

        state = {"theta": theta.copy(), "archive_bits": [p.bits.copy() for p in parents]}
        return self._finish(self.name, parents, history, counter, t0, accepted, state, notes)
