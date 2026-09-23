"""Routing problem definition and road-level path tables.

High-level optimisation (which vehicle serves which destination, in what order, with
which path policy) is kept separate from road-level path finding. For every ordered
pair of stops and every *path policy*, Dijkstra finds the best road path under that
policy's edge weight. The optimiser only ever chooses between these precomputed legs;
it never manipulates individual road edges.

Path policies (edge weight used by Dijkstra):
    fastest    - traffic-adjusted travel time
    calm       - congestion exposure + 5% of time: avoids congested links
    shortest   - distance (what a static, traffic-unaware planner would use)
    balanced   - time + congestion exposure
"""
from __future__ import annotations

from dataclasses import dataclass, field

import networkx as nx

from network.generator import RoadNetwork, Destination
from traffic.simulator import TrafficState, apply_traffic, Incident, TrafficLevel

PATH_POLICIES = ("fastest", "calm", "shortest", "balanced")
HEAVY_VC = 0.85


def _policy_weight(policy: str):
    if policy == "fastest":
        return lambda u, v, d: d["time_min"]
    if policy == "calm":
        return lambda u, v, d: d["exposure"] + 0.05 * d["time_min"]
    if policy == "shortest":
        return lambda u, v, d: d["distance_km"]
    if policy == "balanced":
        return lambda u, v, d: d["time_min"] + d["exposure"]
    raise ValueError(policy)


@dataclass
class Leg:
    nodes: list[int]
    edge_ids: list[int]
    time_min: float
    distance_km: float
    exposure: float       # congestion-weighted minutes
    heavy_min: float      # minutes spent on links with v/c >= HEAVY_VC


@dataclass
class FleetConfig:
    vehicles: int = 3
    capacity: int = 12


@dataclass
class ConstraintConfig:
    max_duration_min: float = 120.0
    time_windows: bool = True


@dataclass
class CostModel:
    """Illustrative operating cost model (INR). Not calibrated to a real operator."""
    per_km: float = 18.0
    per_vehicle_dispatch: float = 350.0


@dataclass
class RoutingProblem:
    network: RoadNetwork
    traffic: TrafficState
    destinations: list[Destination]
    fleet: FleetConfig
    constraints: ConstraintConfig
    cost: CostModel = field(default_factory=CostModel)
    # legs[policy][(i, j)] where i, j index into stops (0 = depot, k = destinations[k-1])
    legs: dict[str, dict[tuple[int, int], Leg]] = field(default_factory=dict)

    @property
    def n(self) -> int:
        return len(self.destinations)

    @property
    def stop_nodes(self) -> list[int]:
        return [self.network.depot] + [d.node for d in self.destinations]

    @property
    def total_demand(self) -> int:
        return sum(d.demand for d in self.destinations)


def _leg_from_path(g: nx.Graph, path: list[int]) -> Leg:
    t = dist = exp = heavy = 0.0
    eids = []
    for a, b in zip(path[:-1], path[1:]):
        d = g.edges[a, b]
        t += d["time_min"]
        dist += d["distance_km"]
        exp += d["exposure"]
        if d["vc"] >= HEAVY_VC:
            heavy += d["time_min"]
        eids.append(d["eid"])
    return Leg(nodes=path, edge_ids=eids, time_min=t, distance_km=dist, exposure=exp, heavy_min=heavy)


def retime_leg(problem: RoutingProblem, leg: Leg) -> Leg:
    """Same road path as `leg`, re-costed under this problem's traffic snapshot."""
    from traffic.simulator import exposure_weight
    g = problem.network.graph
    t = dist = exp = heavy = 0.0
    for a, b in zip(leg.nodes[:-1], leg.nodes[1:]):
        d = g.edges[a, b]
        st = problem.traffic.edges[d["eid"]]
        t += st["time_min"]
        dist += d["distance_km"]
        exp += st["time_min"] * exposure_weight(st["vc"])
        if st["vc"] >= HEAVY_VC:
            heavy += st["time_min"]
    return Leg(nodes=leg.nodes, edge_ids=leg.edge_ids, time_min=t, distance_km=dist, exposure=exp, heavy_min=heavy)


def build_leg_tables(problem: RoutingProblem) -> None:
    g = problem.network.graph
    stops = problem.stop_nodes
    problem.legs = {}
    for policy in PATH_POLICIES:
        w = _policy_weight(policy)
        table: dict[tuple[int, int], Leg] = {}
        for i, src in enumerate(stops):
            _, paths = nx.single_source_dijkstra(g, src, weight=w)
            for j, dst in enumerate(stops):
                if i == j:
                    continue
                table[(i, j)] = _leg_from_path(g, paths[dst])
        problem.legs[policy] = table


def make_problem(network: RoadNetwork, destination_ids: list[str], fleet: FleetConfig,
                 constraints: ConstraintConfig, level: TrafficLevel | str,
                 incident: Incident | None = None) -> RoutingProblem:
    traffic = apply_traffic(network.graph, level, incident)
    dests = [network.destination(i) for i in destination_ids]
    problem = RoutingProblem(network=network, traffic=traffic, destinations=dests,
                             fleet=fleet, constraints=constraints)
    build_leg_tables(problem)
    return problem
