"""Common optimiser interface.

Every algorithm (Adaptive QNSGA-II, classical NSGA-II, and later QPSO / QIGA / APSO /
HGS) implements `Optimizer.run` against the same RoutingProblem, the same decoder, the
same evaluation and the same evaluation budget, so results are comparable.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
import time

import numpy as np

from evaluation.objectives import Solution, Evaluation, evaluate
from evaluation.pareto import (hypervolume_3d, pareto_indices, rank_and_crowding,
                               select_survivors)
from optimization.encoding import decode, encode
from constraints.handling import repair_capacity
from optimization import local_search
from routing.problem import RoutingProblem

HV_REF = np.array([2.0, 2.0, 2.0])  # in baseline-normalised objective space


@dataclass
class Params:
    population: int = 40
    generations: int = 60
    seed: int = 7
    local_search: bool = True
    ls_every: int = 5
    ls_elites: int = 4
    ls_budget: int = 25


@dataclass
class Individual:
    bits: np.ndarray
    sol: Solution
    ev: Evaluation


@dataclass
class RunResult:
    algorithm: str
    archive: list[Individual]
    pareto: list[int]                   # indices into archive
    history: list[dict]
    evaluations: int
    runtime_s: float
    explored: list[list[float]]         # sampled objective vectors of evaluated candidates
    ls_accepted: dict = field(default_factory=dict)
    state: dict = field(default_factory=dict)   # for warm start
    notes: list[str] = field(default_factory=list)


class EvalCounter:
    def __init__(self, problem: RoutingProblem, norm: np.ndarray, rng: np.random.Generator):
        self.problem = problem
        self.norm = norm
        self.count = 0
        self.rng = rng
        self._explored: list[list[float]] = []

    def individual(self, bits: np.ndarray) -> Individual:
        raw = decode(self.problem, bits, repair=False)
        before = raw.key()
        sol = repair_capacity(self.problem, raw)
        ev = evaluate(self.problem, sol)
        self.count += 1
        if ev.feasible:
            self._explored.append([float(x) for x in ev.objectives])
        # Lamarckian write-back only when repair changed the plan, so the genotype always
        # decodes to the plan that was evaluated without disturbing unchanged keys.
        out = bits.astype(np.uint8) if sol.key() == before else encode(self.problem, sol)
        return Individual(bits=out, sol=sol, ev=ev)

    def explored(self, limit: int = 700) -> list[list[float]]:
        e = self._explored
        if len(e) <= limit:
            return e
        idx = self.rng.choice(len(e), size=limit, replace=False)
        return [e[i] for i in sorted(idx)]


def arrays(pop: list[Individual]) -> tuple[np.ndarray, np.ndarray]:
    F = np.array([p.ev.objectives for p in pop])
    CV = np.array([p.ev.cv for p in pop])
    return F, CV


def survivors(pool: list[Individual], k: int) -> list[Individual]:
    F, CV = arrays(pool)
    return [pool[i] for i in select_survivors(F, CV, k)]


def run_local_search(counter: EvalCounter, parents: list[Individual], params: Params,
                     rng: np.random.Generator, accepted_total: dict) -> list[Individual]:
    F, CV = arrays(parents)
    rank, crowd, _ = rank_and_crowding(F, CV)
    elite = [i for i in np.argsort(-crowd) if rank[i] == 0][: params.ls_elites]
    out = list(parents)
    for i in elite:
        sol, ev, used, acc = local_search.improve(counter.problem, parents[i].sol, parents[i].ev, rng,
                                                  budget=params.ls_budget)
        counter.count += used
        for k, v in acc.items():
            accepted_total[k] = accepted_total.get(k, 0) + v
        if sum(acc.values()):
            out[i] = Individual(bits=encode(counter.problem, sol), sol=sol, ev=ev)
            if ev.feasible:
                counter._explored.append([float(x) for x in ev.objectives])
    return out


def generation_record(gen: int, counter: EvalCounter, parents: list[Individual]) -> dict:
    F, CV = arrays(parents)
    feas = CV <= 1e-9
    front = pareto_indices(F, CV)
    Fn = F[front] / counter.norm if front else np.zeros((0, 3))
    best = F[feas].min(axis=0).tolist() if feas.any() else [None, None, None]
    return {
        "generation": gen,
        "evaluations": counter.count,
        "hypervolume": round(hypervolume_3d(Fn, HV_REF), 5),
        "front_size": len(front),
        "feasible_ratio": round(float(feas.mean()), 3),
        "best_time": best[0], "best_exposure": best[1], "best_cost": best[2],
    }


def tournament(rng: np.random.Generator, rank: np.ndarray, crowd: np.ndarray) -> int:
    a, b = rng.integers(len(rank), size=2)
    if rank[a] != rank[b]:
        return int(a if rank[a] < rank[b] else b)
    return int(a if crowd[a] >= crowd[b] else b)


class Optimizer(ABC):
    name: str = "base"
    label: str = "Base"

    @abstractmethod
    def run(self, problem: RoutingProblem, params: Params, norm: np.ndarray,
            warm_state: dict | None = None) -> RunResult: ...

    @staticmethod
    def _finish(name: str, parents: list[Individual], history: list[dict], counter: EvalCounter,
                t0: float, accepted: dict, state: dict, notes: list[str]) -> RunResult:
        F, CV = arrays(parents)
        return RunResult(algorithm=name, archive=parents, pareto=pareto_indices(F, CV), history=history,
                         evaluations=counter.count, runtime_s=round(time.perf_counter() - t0, 3),
                         explored=counter.explored(), ls_accepted=accepted, state=state, notes=notes)


REGISTRY: dict[str, type[Optimizer]] = {}


def register(cls: type[Optimizer]) -> type[Optimizer]:
    REGISTRY[cls.name] = cls
    return cls
