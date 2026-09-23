"""Simulated traffic conditions (no live data).

Each edge has a base demand ratio (from the generator). A traffic level scales it into a
volume/capacity ratio (v/c). Travel time follows the BPR link-performance function

    t = t0 * (1 + alpha * (v/c) ** beta)

the standard static link model used in transport planning. An optional incident reduces
capacity on a set of edges (e.g. a lane closure), raising v/c on those edges only.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum

import networkx as nx

BPR_ALPHA = 0.15
BPR_BETA = 4.0
# Congestion exposure: minutes driven on congested links, weighted by severity.
# Weight is 0 at or below v/c = EXPOSURE_ONSET and 1.0 at capacity (v/c = 1).
EXPOSURE_ONSET = 0.6


def exposure_weight(vc: float) -> float:
    return max(0.0, (vc - EXPOSURE_ONSET) / (1.0 - EXPOSURE_ONSET))


class TrafficLevel(str, Enum):
    LOW = "LOW"
    MODERATE = "MODERATE"
    HIGH = "HIGH"


LEVEL_MULTIPLIER = {TrafficLevel.LOW: 0.55, TrafficLevel.MODERATE: 0.9, TrafficLevel.HIGH: 1.2}
LEVEL_ORDER = [TrafficLevel.LOW, TrafficLevel.MODERATE, TrafficLevel.HIGH]


@dataclass
class Incident:
    edge_ids: list[int]
    capacity_factor: float = 0.4   # remaining share of capacity on affected edges
    label: str = "Simulated lane closure"


@dataclass
class TrafficState:
    level: TrafficLevel = TrafficLevel.MODERATE
    incident: Incident | None = None
    edges: dict[int, dict] = field(default_factory=dict)  # eid -> per-edge state


def congestion_band(vc: float) -> str:
    if vc < 0.6:
        return "free"
    if vc < 0.85:
        return "moderate"
    if vc < 1.0:
        return "heavy"
    return "severe"


def apply_traffic(graph: nx.Graph, level: TrafficLevel | str, incident: Incident | None = None) -> TrafficState:
    """Compute per-edge v/c and traffic-adjusted travel time, writing them onto the graph."""
    level = TrafficLevel(level)
    mult = LEVEL_MULTIPLIER[level]
    affected = set(incident.edge_ids) if incident else set()
    state = TrafficState(level=level, incident=incident)
    for _u, _v, d in graph.edges(data=True):
        cap_factor = incident.capacity_factor if d["eid"] in affected else 1.0
        vc = d["base_ratio"] * mult / cap_factor
        t0 = d["distance_km"] / d["free_flow_kmh"] * 60.0
        t = t0 * (1.0 + BPR_ALPHA * vc ** BPR_BETA)
        d["vc"] = vc
        d["time_min"] = t
        d["free_time_min"] = t0
        d["exposure"] = t * exposure_weight(vc)  # severity-weighted congested minutes
        state.edges[d["eid"]] = {"vc": vc, "time_min": t, "free_time_min": t0,
                                 "band": congestion_band(vc), "incident": d["eid"] in affected}
    return state


def escalate(level: TrafficLevel | str) -> TrafficLevel:
    level = TrafficLevel(level)
    i = LEVEL_ORDER.index(level)
    return LEVEL_ORDER[min(i + 1, len(LEVEL_ORDER) - 1)]
