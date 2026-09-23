"""Deterministic synthetic road network for the demo.

The network is a jittered street grid with a diagonal arterial, laid out in local
kilometre coordinates (x east, y north). It is synthetic by design: the demo must run
offline and must not pretend to be a real city's road data.

Every edge carries: distance, lanes, capacity (veh/h), free-flow speed (km/h), road
class and a base demand ratio used by the traffic simulator.
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
import math

import networkx as nx
import numpy as np

ROAD_CLASSES = {
    #            lanes  capacity_vph  free_flow_kmh
    "arterial": (4, 3600, 50.0),
    "collector": (2, 1700, 40.0),
    "local": (1, 800, 28.0),
}


@dataclass
class Destination:
    id: str
    node: int
    demand: int            # load units
    service_min: float     # unloading time at the stop
    window: tuple[float, float] | None  # optional [earliest, latest], minutes after dispatch


@dataclass
class RoadNetwork:
    seed: int
    graph: nx.Graph
    depot: int
    destinations: list[Destination] = field(default_factory=list)

    def destination(self, dest_id: str) -> Destination:
        for d in self.destinations:
            if d.id == dest_id:
                return d
        raise KeyError(dest_id)

    def to_dict(self) -> dict:
        dest_nodes = {t.node for t in self.destinations}
        nodes = [
            {"id": n, "x": round(d["x"], 4), "y": round(d["y"], 4),
             "kind": "depot" if n == self.depot else ("destination" if n in dest_nodes else "intersection")}
            for n, d in self.graph.nodes(data=True)
        ]
        edges = [
            {"id": d["eid"], "u": u, "v": v,
             "distance_km": round(d["distance_km"], 3), "lanes": d["lanes"],
             "capacity_vph": d["capacity_vph"], "free_flow_kmh": d["free_flow_kmh"],
             "road_class": d["road_class"]}
            for u, v, d in sorted(self.graph.edges(data=True), key=lambda e: e[2]["eid"])
        ]
        dests = [{**asdict(t), "window": list(t.window) if t.window else None} for t in self.destinations]
        return {"seed": self.seed, "depot": self.depot, "nodes": nodes, "edges": edges,
                "destinations": dests, "units": {"x": "km", "y": "km"}}


def generate_network(seed: int = 42, cols: int = 7, rows: int = 6, spacing_km: float = 1.2,
                     n_destinations: int = 12) -> RoadNetwork:
    """Build the demo network. Same seed -> identical network."""
    rng = np.random.default_rng(seed)
    g = nx.Graph()

    def nid(c: int, r: int) -> int:
        return r * cols + c

    for r in range(rows):
        for c in range(cols):
            jx, jy = rng.uniform(-0.2, 0.2, size=2) * spacing_km
            g.add_node(nid(c, r), x=c * spacing_km + jx, y=r * spacing_km + jy, col=c, row=r)

    arterial_row, arterial_col = rows // 2, cols // 2

    def classify(c1, r1, c2, r2) -> str:
        if (r1 == r2 == arterial_row) or (c1 == c2 == arterial_col):
            return "arterial"
        if (r1 == r2 and r1 in (0, rows - 1)) or (c1 == c2 and c1 in (0, cols - 1)):
            return "collector"
        if (r1 == r2 and r1 % 2 == 1) or (c1 == c2 and c1 % 2 == 0):
            return "collector"
        return "local"

    for r in range(rows):
        for c in range(cols):
            if c + 1 < cols:
                g.add_edge(nid(c, r), nid(c + 1, r), road_class=classify(c, r, c + 1, r))
            if r + 1 < rows:
                g.add_edge(nid(c, r), nid(c, r + 1), road_class=classify(c, r, c, r + 1))
    # A diagonal arterial running south-west -> north-east (a radial road)
    for k in range(min(cols - 2, rows - 1)):
        g.add_edge(nid(k + 1, k), nid(k + 2, k + 1), road_class="arterial")

    # Remove some local streets (blocked blocks) while keeping the graph connected
    locals_ = sorted(e for e in g.edges if g.edges[e]["road_class"] == "local")
    order = rng.permutation(len(locals_))
    target, removed = int(0.2 * len(locals_)), 0
    for i in order:
        if removed >= target:
            break
        u, v = locals_[i]
        data = dict(g.edges[u, v])
        g.remove_edge(u, v)
        if nx.is_connected(g) and g.degree(u) >= 2 and g.degree(v) >= 2:
            removed += 1
        else:
            g.add_edge(u, v, **data)

    cx, cy = (cols - 1) * spacing_km / 2, (rows - 1) * spacing_km / 2
    sigma = 0.38 * cols * spacing_km
    edges_sorted = sorted(g.edges(data=True), key=lambda e: (min(e[0], e[1]), max(e[0], e[1])))
    for i, (u, v, d) in enumerate(edges_sorted):
        lanes, cap, ff = ROAD_CLASSES[d["road_class"]]
        x1, y1 = g.nodes[u]["x"], g.nodes[u]["y"]
        x2, y2 = g.nodes[v]["x"], g.nodes[v]["y"]
        dist = math.hypot(x2 - x1, y2 - y1) * 1.12  # street curvature factor
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2
        centrality = math.exp(-((mx - cx) ** 2 + (my - cy) ** 2) / (2 * sigma ** 2))
        class_pull = {"arterial": 0.34, "collector": 0.05, "local": -0.16}[d["road_class"]]
        base_ratio = float(np.clip(0.36 + 0.5 * centrality + class_pull + rng.normal(0, 0.08), 0.18, 1.05))
        d.update(eid=i, distance_km=dist, lanes=lanes, capacity_vph=cap, free_flow_kmh=ff,
                 base_ratio=base_ratio)

    depot = nid(0, 1)  # south-west edge of the city: a typical logistics yard location

    pool = [n for n in sorted(g.nodes) if n != depot and g.degree(n) >= 2]
    pool = [pool[i] for i in rng.permutation(len(pool))]
    chosen: list[int] = []
    for min_gap in (1.3, 1.1, 0.9):
        for n in pool:
            if n in chosen:
                continue
            x, y = g.nodes[n]["x"], g.nodes[n]["y"]
            dx0, dy0 = x - g.nodes[depot]["x"], y - g.nodes[depot]["y"]
            if math.hypot(dx0, dy0) < 1.5 * spacing_km:
                continue
            if all(math.hypot(x - g.nodes[m]["x"], y - g.nodes[m]["y"]) > min_gap * spacing_km for m in chosen):
                chosen.append(n)
            if len(chosen) == n_destinations:
                break
        if len(chosen) == n_destinations:
            break
    chosen.sort(key=lambda n: (g.nodes[n]["row"], g.nodes[n]["col"]))

    dests = []
    for k, n in enumerate(chosen):
        demand = int(rng.integers(1, 5))
        service = float(rng.choice([4.0, 5.0, 6.0, 8.0]))
        window = None
        if k % 4 == 1:  # a quarter of stops have a delivery window
            start = float(rng.choice([0.0, 15.0, 30.0]))
            window = (start, start + float(rng.choice([45.0, 60.0])))
        dests.append(Destination(id=f"C{k + 1}", node=n, demand=demand, service_min=service, window=window))

    return RoadNetwork(seed=seed, graph=g, depot=depot, destinations=dests)
