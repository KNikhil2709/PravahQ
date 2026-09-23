from fastapi.testclient import TestClient

from api.main import app

client = TestClient(app)
FAST = {"params": {"population": 16, "generations": 10, "seed": 1}}


def test_health_and_network():
    assert client.get("/api/health").json()["status"] == "ok"
    net = client.get("/api/network").json()
    assert net["depot"] in {n["id"] for n in net["nodes"]}
    assert len(net["destinations"]) == 12


def test_traffic_endpoint_validates_level():
    assert client.get("/api/traffic", params={"level": "HIGH"}).status_code == 200
    assert client.get("/api/traffic", params={"level": "EXTREME"}).status_code == 422


def test_optimize_and_profiles():
    r = client.post("/api/optimize", json=FAST)
    assert r.status_code == 200
    body = r.json()
    assert body["pareto"] and set(body["profiles"]) == {"fastest", "least_congested", "lowest_cost", "balanced"}
    for idx in body["profiles"].values():
        assert 0 <= idx < len(body["pareto"])
    assert body["baseline"]["metrics"]["travel_time_min"] > 0
    assert len(body["history"]) == 10


def test_unknown_destination_rejected():
    r = client.post("/api/optimize", json={**FAST, "destinations": ["C99"]})
    assert r.status_code == 422


def test_traffic_change_reoptimizes_with_warm_start():
    run = client.post("/api/optimize", json=FAST).json()
    r = client.post("/api/traffic-change", json={"run_id": run["run_id"]})
    assert r.status_code == 200
    ch = r.json()
    assert ch["change"]["from_level"] == "MODERATE" and ch["change"]["to_level"] == "HIGH"
    assert ch["change"]["warm_start"] is True and ch["change"]["incident"]["edge_ids"]
    assert ch["after"]["problem"]["incident"] is not None
    assert set(ch["stale_plans"]) == set(run["profiles"])


def test_traffic_change_unknown_run():
    assert client.post("/api/traffic-change", json={"run_id": "nope"}).status_code == 404


def test_benchmark_labels_results_as_simulated():
    r = client.post("/api/benchmark", json={"seeds": [1], "population": 12, "generations": 5})
    body = r.json()
    assert "Simulated benchmark" in body["label"]
    assert set(body["algorithms"]) == {"qnsga2", "nsga2"}
    a, b = body["algorithms"]["qnsga2"], body["algorithms"]["nsga2"]
    assert a["evaluations_mean"] == b["evaluations_mean"]


def test_old_plan_is_evaluated_on_the_same_roads():
    run = client.post("/api/optimize", json=FAST).json()
    ch = client.post("/api/traffic-change", json={"run_id": run["run_id"]}).json()
    for key, idx in run["profiles"].items():
        before = run["pareto"][idx]["metrics"]
        stale = ch["stale_plans"][key]["metrics"]
        assert abs(stale["distance_km"] - before["distance_km"]) < 1e-6   # identical roads
        assert abs(stale["cost_inr"] - before["cost_inr"]) < 1e-6
        assert stale["travel_time_min"] >= before["travel_time_min"] - 1e-6  # traffic only got worse


def test_traffic_change_survives_a_lost_run_store():
    """Serverless instances are stateless: the run may live in another instance's memory.
    With the scenario attached, the server rebuilds it deterministically."""
    from api import service

    run = client.post("/api/optimize", json=FAST).json()
    before = run["pareto"][run["profiles"]["balanced"]]["metrics"]
    service._runs.clear()                       # simulate a cold serverless instance

    assert client.post("/api/traffic-change", json={"run_id": run["run_id"]}).status_code == 404
    r = client.post("/api/traffic-change", json={"run_id": run["run_id"], "scenario": FAST})
    assert r.status_code == 200
    ch = r.json()
    rebuilt = ch["stale_plans"]["balanced"]["metrics"]
    # The rebuilt run reproduces the original plan exactly (same seed, same roads)
    assert abs(rebuilt["distance_km"] - before["distance_km"]) < 1e-6
    assert ch["change"]["warm_start"] is True
