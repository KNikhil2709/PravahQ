"""Request models for the HTTP API."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class FleetIn(BaseModel):
    vehicles: int = Field(3, ge=1, le=3)
    capacity: int = Field(12, ge=1, le=40)


class ConstraintsIn(BaseModel):
    max_duration_min: float = Field(120, ge=20, le=480)
    time_windows: bool = True


class ParamsIn(BaseModel):
    population: int = Field(40, ge=8, le=120)
    generations: int = Field(60, ge=5, le=300)
    seed: int = 7
    local_search: bool = True


class ScenarioIn(BaseModel):
    network_seed: int = 42
    destinations: list[str] = Field(default_factory=lambda: [f"C{i}" for i in range(1, 11)])
    fleet: FleetIn = FleetIn()
    constraints: ConstraintsIn = ConstraintsIn()
    traffic_level: Literal["LOW", "MODERATE", "HIGH"] = "MODERATE"


class OptimizeIn(ScenarioIn):
    algorithm: Literal["qnsga2", "nsga2"] = "qnsga2"
    params: ParamsIn = ParamsIn()


class TrafficChangeIn(BaseModel):
    run_id: str
    warm_start: bool = True
    # Serverless instances are stateless, so the run that `run_id` refers to may live in
    # another instance's memory. Sending the original scenario lets the server rebuild that
    # run exactly (every run is seeded and deterministic) instead of failing.
    scenario: OptimizeIn | None = None


class BenchmarkIn(ScenarioIn):
    seeds: list[int] = Field(default_factory=lambda: [1, 2, 3, 4, 5], min_length=1, max_length=10)
    population: int = Field(40, ge=8, le=120)
    generations: int = Field(60, ge=5, le=200)
    local_search: bool = False
