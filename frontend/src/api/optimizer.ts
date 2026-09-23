import axios from "axios";
import API_BASE from "./client";
import type { BenchmarkResult, EdgeState, Network, OptimizeResult, Scenario, TrafficChangeResult, TrafficLevel } from "./types";

const api = axios.create({ baseURL: `${API_BASE}/api`, timeout: 180_000 });

function scenarioBody(s: Scenario) {
  return {
    network_seed: 42,
    destinations: s.destinations,
    fleet: { vehicles: s.vehicles, capacity: s.capacity },
    constraints: { max_duration_min: s.max_duration_min, time_windows: s.time_windows },
    traffic_level: s.traffic_level,
  };
}

export const getNetwork = () => api.get<Network>("/network").then(r => r.data);

export const getTraffic = (level: TrafficLevel) =>
  api.get<{ level: TrafficLevel; edges: EdgeState[] }>("/traffic", { params: { level } }).then(r => r.data.edges);

export const optimize = (s: Scenario) =>
  api.post<OptimizeResult>("/optimize", {
    ...scenarioBody(s),
    algorithm: s.algorithm,
    params: { population: s.population, generations: s.generations, seed: s.seed, local_search: s.local_search },
  }).then(r => r.data);

// `scenario` lets a stateless (serverless) backend rebuild the run deterministically if the
// original one is no longer in memory.
export const simulateTrafficChange = (runId: string, s: Scenario) =>
  api.post<TrafficChangeResult>("/traffic-change", {
    run_id: runId, warm_start: true,
    scenario: { ...scenarioBody(s), algorithm: s.algorithm,
      params: { population: s.population, generations: s.generations, seed: s.seed, local_search: s.local_search } },
  }).then(r => r.data);

export const runBenchmark = (s: Scenario, seeds: number[], local_search: boolean) =>
  api.post<BenchmarkResult>("/benchmark", {
    ...scenarioBody(s), seeds, population: s.population, generations: s.generations, local_search,
  }).then(r => r.data);

export function errorMessage(e: unknown): string {
  if (axios.isAxiosError(e)) {
    if (!e.response) return `The optimisation service at ${API_BASE} is not reachable. Start the backend (uvicorn api.main:app --port 8000), then try again.`;
    const d = e.response.data as { detail?: unknown };
    if (typeof d?.detail === "string") return d.detail;
    if (Array.isArray(d?.detail)) return d.detail.map((x: { msg?: string }) => x.msg).join("; ");
    return `Request failed with status ${e.response.status}.`;
  }
  return String(e);
}
