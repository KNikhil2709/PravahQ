"""FastAPI entry point.  Run from backend/:  uvicorn api.main:app --reload --port 8000"""
from __future__ import annotations

import os

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from api import service
from api.schemas import BenchmarkIn, OptimizeIn, TrafficChangeIn

app = FastAPI(
    title="PravahAI Route Optimizer API",
    description="Adaptive quantum-inspired NSGA-II for multi-objective fleet routing on a simulated "
                "traffic network. All traffic data is simulated.",
    version="2.0.0",
)
# Set ALLOWED_ORIGINS (comma-separated) in production, e.g. "https://pravah-route.vercel.app".
# Defaults to "*" so local development works with no configuration.
_origins = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "*").split(",") if o.strip()]
app.add_middleware(CORSMiddleware, allow_origins=_origins, allow_methods=["*"], allow_headers=["*"])


@app.get("/api/health")
def health():
    return {"status": "ok", "algorithms": service.algorithms()}


@app.get("/api/network")
def get_network(seed: int = Query(42)):
    """Demo road network: nodes, edges (distance, lanes, capacity, free-flow speed), depot, destinations."""
    return {**service.network(seed).to_dict(), "levels": service.levels(),
            "path_policies": service.path_policies()}


@app.get("/api/traffic")
def get_traffic(seed: int = Query(42), level: str = Query("MODERATE")):
    """Per-edge simulated traffic state (v/c, travel time, congestion band) for a level."""
    if level not in service.levels():
        raise HTTPException(422, f"level must be one of {service.levels()}")
    return {"level": level, "edges": service.traffic_preview(seed, level)}


@app.post("/api/optimize")
def post_optimize(req: OptimizeIn):
    """Run an optimiser on the scenario and return the Pareto set, profiles, baseline and history."""
    try:
        return service.optimize(req)
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.post("/api/traffic-change")
def post_traffic_change(req: TrafficChangeIn):
    """Escalate traffic + simulated incident on the most-used corridor, then re-optimise (warm start)."""
    try:
        return service.traffic_change(req.run_id, req.warm_start, req.scenario)
    except service.RunNotFound as e:
        raise HTTPException(404, str(e))


@app.post("/api/benchmark")
def post_benchmark(req: BenchmarkIn):
    """Adaptive QNSGA-II vs NSGA-II on the identical instance, budget and seeds (simulated benchmark)."""
    try:
        return service.benchmark(req)
    except ValueError as e:
        raise HTTPException(422, str(e))
