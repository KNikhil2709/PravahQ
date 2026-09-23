"""Multi-objective utilities: constrained domination (Deb), fast non-dominated sort,
crowding distance and exact 3-D hypervolume."""
from __future__ import annotations

import numpy as np


def dominates(fa: np.ndarray, fb: np.ndarray) -> bool:
    return bool(np.all(fa <= fb) and np.any(fa < fb))


def constrained_dominates(fa: np.ndarray, cva: float, fb: np.ndarray, cvb: float) -> bool:
    """Deb's rules: feasible beats infeasible; lower violation beats higher; else Pareto."""
    fa_ok, fb_ok = cva <= 1e-9, cvb <= 1e-9
    if fa_ok and not fb_ok:
        return True
    if not fa_ok and fb_ok:
        return False
    if not fa_ok and not fb_ok:
        return cva < cvb
    return dominates(fa, fb)


def non_dominated_sort(F: np.ndarray, CV: np.ndarray) -> list[list[int]]:
    n = len(F)
    S: list[list[int]] = [[] for _ in range(n)]
    counts = np.zeros(n, dtype=int)
    fronts: list[list[int]] = [[]]
    for p in range(n):
        for q in range(p + 1, n):
            if constrained_dominates(F[p], CV[p], F[q], CV[q]):
                S[p].append(q)
                counts[q] += 1
            elif constrained_dominates(F[q], CV[q], F[p], CV[p]):
                S[q].append(p)
                counts[p] += 1
    fronts[0] = [p for p in range(n) if counts[p] == 0]
    i = 0
    while fronts[i]:
        nxt = []
        for p in fronts[i]:
            for q in S[p]:
                counts[q] -= 1
                if counts[q] == 0:
                    nxt.append(q)
        i += 1
        fronts.append(nxt)
    return fronts[:-1]


def crowding_distance(F: np.ndarray) -> np.ndarray:
    n, m = F.shape
    if n <= 2:
        return np.full(n, np.inf)
    d = np.zeros(n)
    for k in range(m):
        order = np.argsort(F[:, k], kind="stable")
        lo, hi = F[order[0], k], F[order[-1], k]
        d[order[0]] = d[order[-1]] = np.inf
        if hi - lo < 1e-12:
            continue
        d[order[1:-1]] += (F[order[2:], k] - F[order[:-2], k]) / (hi - lo)
    return d


def rank_and_crowding(F: np.ndarray, CV: np.ndarray) -> tuple[np.ndarray, np.ndarray, list[list[int]]]:
    fronts = non_dominated_sort(F, CV)
    rank = np.zeros(len(F), dtype=int)
    crowd = np.zeros(len(F))
    for r, front in enumerate(fronts):
        rank[front] = r
        crowd[front] = crowding_distance(F[front])
    return rank, crowd, fronts


def select_survivors(F: np.ndarray, CV: np.ndarray, k: int) -> np.ndarray:
    """NSGA-II environmental selection: fill by fronts, break ties by crowding."""
    rank, crowd, fronts = rank_and_crowding(F, CV)
    chosen: list[int] = []
    for front in fronts:
        if len(chosen) + len(front) <= k:
            chosen.extend(front)
        else:
            rest = sorted(front, key=lambda i: -crowd[i])
            chosen.extend(rest[: k - len(chosen)])
            break
    return np.array(chosen, dtype=int)


def pareto_indices(F: np.ndarray, CV: np.ndarray) -> list[int]:
    """Feasible, non-dominated, de-duplicated (by objective vector) indices."""
    feas = [i for i in range(len(F)) if CV[i] <= 1e-9]
    out, seen = [], set()
    for i in feas:
        if any(dominates(F[j], F[i]) for j in feas if j != i):
            continue
        key = tuple(np.round(F[i], 6))
        if key in seen:
            continue
        seen.add(key)
        out.append(i)
    return out


def _hv2d(points: np.ndarray, ref: np.ndarray) -> float:
    pts = points[np.argsort(points[:, 0])]
    hv, best_y = 0.0, ref[1]
    for x, y in pts:
        if y < best_y:
            hv += (ref[0] - x) * (best_y - y)
            best_y = y
    return hv


def hypervolume_3d(F: np.ndarray, ref: np.ndarray) -> float:
    """Exact hypervolume of a 3-objective minimisation front w.r.t. reference point."""
    if len(F) == 0:
        return 0.0
    P = F[np.all(F < ref, axis=1)]
    if len(P) == 0:
        return 0.0
    P = P[np.argsort(P[:, 2])]
    hv = 0.0
    for i in range(len(P)):
        z_next = P[i + 1, 2] if i + 1 < len(P) else ref[2]
        if z_next > P[i, 2]:
            hv += _hv2d(P[: i + 1, :2], ref[:2]) * (z_next - P[i, 2])
    return hv
