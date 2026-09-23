"""Classical NSGA-II on the same binary genotype (benchmark reference).

Binary tournament selection -> uniform crossover -> bit-flip mutation, followed by the
same decoder, evaluation, elitist non-dominated selection and (optionally) the same
local search as QNSGA-II. Budget: N initial + N per generation for G-1 generations =
N x G evaluations, identical to QNSGA-II.
"""
from __future__ import annotations

import time

import numpy as np

from optimization.base import (EvalCounter, Individual, Optimizer, Params, arrays,
                               generation_record, register, run_local_search, survivors,
                               tournament)
from optimization.encoding import genome_length
from evaluation.pareto import rank_and_crowding
from routing.problem import RoutingProblem


@register
class NSGA2(Optimizer):
    name = "nsga2"
    label = "NSGA-II (classical)"

    def __init__(self, crossover_rate: float = 0.9):
        self.pc = crossover_rate

    def run(self, problem: RoutingProblem, params: Params, norm: np.ndarray,
            warm_state: dict | None = None):
        t0 = time.perf_counter()
        rng = np.random.default_rng(params.seed)
        N, G, L = params.population, params.generations, genome_length(problem)
        pm = 1.0 / L
        counter = EvalCounter(problem, norm, rng)
        accepted: dict = {}
        notes: list[str] = []

        seeds = list(warm_state.get("archive_bits", [])) if warm_state else []
        if seeds:
            notes.append(f"Warm start: {len(seeds)} archived plans re-evaluated under the new traffic.")
        init = seeds[:N] + [rng.integers(0, 2, L).astype(np.uint8) for _ in range(N - len(seeds[:N]))]
        parents: list[Individual] = [counter.individual(b) for b in init]
        history = [generation_record(0, counter, parents)]

        for g in range(1, G):
            F, CV = arrays(parents)
            rank, crowd, _ = rank_and_crowding(F, CV)
            children = []
            for _ in range(N):
                a = parents[tournament(rng, rank, crowd)].bits
                b = parents[tournament(rng, rank, crowd)].bits
                child = np.where(rng.random(L) < 0.5, a, b) if rng.random() < self.pc else a.copy()
                flip = rng.random(L) < pm
                child = (child ^ flip).astype(np.uint8)
                children.append(counter.individual(child))
            parents = survivors(parents + children, N)
            if params.local_search and g % params.ls_every == params.ls_every - 1:
                parents = run_local_search(counter, parents, params, rng, accepted)
            history.append(generation_record(g, counter, parents))

        state = {"archive_bits": [p.bits.copy() for p in parents]}
        return self._finish(self.name, parents, history, counter, t0, accepted, state, notes)
