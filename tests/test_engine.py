import math

import networkx as nx
import numpy as np
import pytest

from evaluation.objectives import evaluate
from evaluation.pareto import (constrained_dominates, crowding_distance, dominates, hypervolume_3d,
                               non_dominated_sort, pareto_indices)
from network.generator import generate_network
from optimization import registry
from optimization.baseline import baseline
from optimization.encoding import decode, encode, genome_length
from optimization.qnsga2.optimizer import AdaptiveQNSGA2
from routing.problem import ConstraintConfig, FleetConfig, make_problem
from traffic.simulator import Incident, apply_traffic


@pytest.fixture(scope="module")
def net():
    return generate_network(42)


@pytest.fixture()
def problem(net):
    ids = [d.id for d in net.destinations[:10]]
    return make_problem(net, ids, FleetConfig(3, 12), ConstraintConfig(120, True), "MODERATE")


def test_network_is_deterministic_and_connected(net):
    other = generate_network(42)
    assert net.to_dict() == other.to_dict()
    assert nx.is_connected(net.graph)
    assert 30 <= net.graph.number_of_nodes() <= 50
    assert 8 <= len(net.destinations) <= 12
    for _, _, d in net.graph.edges(data=True):
        assert {"distance_km", "capacity_vph", "free_flow_kmh", "lanes"} <= set(d)


def test_traffic_levels_and_incident_increase_travel_time(net):
    times = {}
    for lvl in ["LOW", "MODERATE", "HIGH"]:
        s = apply_traffic(net.graph, lvl)
        times[lvl] = sum(e["time_min"] for e in s.edges.values())
    assert times["LOW"] < times["MODERATE"] < times["HIGH"]
    base = apply_traffic(net.graph, "HIGH").edges[5]["time_min"]
    hit = apply_traffic(net.graph, "HIGH", Incident([5], 0.4)).edges[5]["time_min"]
    assert hit > base


def test_decode_visits_every_destination_once(problem):
    rng = np.random.default_rng(0)
    for _ in range(200):
        bits = rng.integers(0, 2, genome_length(problem)).astype(np.uint8)
        sol = decode(problem, bits)
        visited = sorted(s for r in sol.routes for s in r)
        assert visited == list(range(1, problem.n + 1))
        assert len(sol.routes) == problem.fleet.vehicles


def test_encode_decode_roundtrip(problem):
    rng = np.random.default_rng(1)
    bits = rng.integers(0, 2, genome_length(problem)).astype(np.uint8)
    sol = decode(problem, bits)
    again = decode(problem, encode(problem, sol))
    assert again.key() == sol.key()


def test_paths_are_valid_road_paths_from_depot(problem):
    sol, ev = baseline(problem)
    g = problem.network.graph
    for plan in ev.vehicles:
        if not plan.stops:
            continue
        assert plan.legs[0].nodes[0] == problem.network.depot
        assert plan.legs[-1].nodes[-1] == problem.network.depot
        for leg in plan.legs:
            for a, b in zip(leg.nodes[:-1], leg.nodes[1:]):
                assert g.has_edge(a, b)


def test_capacity_violation_is_reported(net):
    ids = [d.id for d in net.destinations]
    p = make_problem(net, ids, FleetConfig(1, 5), ConstraintConfig(600, False), "LOW")
    sol, ev = baseline(p)
    assert ev.cv > 0 and ev.violations["capacity"] > 0


def test_domination_rules():
    a, b = np.array([1.0, 1, 1]), np.array([2.0, 2, 2])
    assert dominates(a, b) and not dominates(b, a)
    assert constrained_dominates(b, 0.0, a, 0.5)       # feasible beats infeasible
    assert constrained_dominates(a, 0.1, b, 0.5)       # less violation wins
    F = np.array([[1, 5, 1], [5, 1, 1], [3, 3, 3], [6, 6, 6]], dtype=float)
    fronts = non_dominated_sort(F, np.zeros(4))
    assert sorted(fronts[0]) == [0, 1, 2] and fronts[1] == [3]
    cd = crowding_distance(F[:3])
    assert np.isinf(cd).sum() >= 2


def test_hypervolume_simple_box():
    F = np.array([[0.5, 0.5, 0.5]])
    assert math.isclose(hypervolume_3d(F, np.array([1.0, 1, 1])), 0.125)
    F2 = np.array([[0.5, 0.5, 0.5], [0.25, 0.75, 0.5]])
    assert hypervolume_3d(F2, np.array([1.0, 1, 1])) > 0.125


def test_qubit_amplitudes_stay_normalised_and_bounded(problem):
    opt = AdaptiveQNSGA2()
    _, be = baseline(problem)
    r = opt.run(problem, registry.Params(population=12, generations=8, local_search=False), be.objectives)
    theta = r.state["theta"]
    alpha, beta = np.cos(theta), np.sin(theta)
    assert np.allclose(alpha ** 2 + beta ** 2, 1.0)
    assert theta.min() >= opt.margin - 1e-12 and theta.max() <= math.pi / 2 - opt.margin + 1e-12


@pytest.mark.parametrize("alg", ["qnsga2", "nsga2"])
def test_optimizers_return_feasible_non_dominated_front(problem, alg):
    _, be = baseline(problem)
    params = registry.Params(population=20, generations=15, seed=3)
    r = registry.get(alg).run(problem, params, be.objectives)
    assert len(r.pareto) >= 2
    F = np.array([r.archive[i].ev.objectives for i in r.pareto])
    for i in range(len(F)):
        assert r.archive[r.pareto[i]].ev.feasible
        assert not any(dominates(F[j], F[i]) for j in range(len(F)) if j != i)
    assert len(r.history) == params.generations


def test_same_seed_is_reproducible(problem):
    _, be = baseline(problem)
    p = registry.Params(population=12, generations=6, seed=11)
    a = registry.get("qnsga2").run(problem, p, be.objectives)
    b = registry.get("qnsga2").run(problem, p, be.objectives)
    assert [h["hypervolume"] for h in a.history] == [h["hypervolume"] for h in b.history]


def test_equal_budget_without_local_search(problem):
    _, be = baseline(problem)
    p = registry.Params(population=16, generations=10, seed=2, local_search=False)
    q = registry.get("qnsga2").run(problem, p, be.objectives)
    n = registry.get("nsga2").run(problem, p, be.objectives)
    assert q.evaluations == n.evaluations == 160


def test_evaluate_matches_components(problem):
    sol, ev = baseline(problem)
    assert math.isclose(ev.objectives[0], sum(v.driving_min for v in ev.vehicles))
    used = sum(1 for v in ev.vehicles if v.stops)
    dist = sum(v.distance_km for v in ev.vehicles)
    assert math.isclose(ev.objectives[2], dist * problem.cost.per_km + used * problem.cost.per_vehicle_dispatch)
    assert evaluate(problem, sol).objectives.tolist() == ev.objectives.tolist()
