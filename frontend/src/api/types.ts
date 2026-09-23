// Mirrors backend/api/service.py response shapes.
export type TrafficLevel = "LOW" | "MODERATE" | "HIGH";
export type AlgorithmId = "qnsga2" | "nsga2";
export type ProfileKey = "fastest" | "least_congested" | "lowest_cost" | "balanced";
export type Band = "free" | "moderate" | "heavy" | "severe";

export interface NetNode { id: number; x: number; y: number; kind: "depot" | "destination" | "intersection" }
export interface NetEdge {
  id: number; u: number; v: number; distance_km: number; lanes: number;
  capacity_vph: number; free_flow_kmh: number; road_class: "arterial" | "collector" | "local";
}
export interface Destination {
  id: string; node: number; demand: number; service_min: number; window: [number, number] | null;
}
export interface Network {
  seed: number; depot: number; nodes: NetNode[]; edges: NetEdge[]; destinations: Destination[];
  levels: TrafficLevel[]; path_policies: string[];
}
export interface EdgeState { id: number; vc: number; time_min: number; free_time_min: number; band: Band; incident: boolean }

export interface Metrics {
  travel_time_min: number; exposure_min: number; cost_inr: number; distance_km: number;
  heavy_traffic_min: number; vehicles_used: number; completion_min: number;
}
export interface VehicleRoute {
  vehicle: number; stops: string[]; policies: string[]; arrivals_min: number[];
  load: number; capacity: number; duration_min: number; driving_min: number; distance_km: number;
  exposure_min: number; heavy_traffic_min: number; lateness_min: number; path: number[]; edge_ids: number[];
}
export interface PlanSolution {
  index?: number; metrics: Metrics; feasible: boolean; violation: number;
  violations: { capacity: number; duration: number; lateness_min: number };
  vehicles: VehicleRoute[]; signature: string;
}
export interface GenerationRecord {
  generation: number; evaluations: number; hypervolume: number; front_size: number; feasible_ratio: number;
  best_time: number | null; best_exposure: number | null; best_cost: number | null;
  delta_theta?: number; qubit_entropy?: number; unique_ratio?: number; diversity_reset?: boolean; migration?: boolean;
}
export interface ProblemSummary {
  destinations: string[]; fleet: { vehicles: number; capacity: number };
  constraints: { max_duration_min: number; time_windows: boolean };
  traffic_level: TrafficLevel;
  incident: { edge_ids: number[]; capacity_factor: number; label: string } | null;
  feasibility: { total_demand: number; fleet_capacity: number; issues: string[] };
  genome_bits: number; cost_model: { per_km_inr: number; per_vehicle_dispatch_inr: number };
}
export interface OptimizeResult {
  run_id: string; algorithm: { id: AlgorithmId; label: string }; problem: ProblemSummary;
  baseline: PlanSolution & { label: string }; pareto: PlanSolution[];
  profiles: Partial<Record<ProfileKey, number>>; history: GenerationRecord[]; explored: number[][];
  hypervolume: number;
  stats: { evaluations: number; runtime_s: number; pareto_size: number; population: number; generations: number;
           local_search_accepted: Record<string, number> };
  edge_states: EdgeState[]; notes: string[]; label: string;
}
export interface TrafficChangeResult {
  change: { from_level: TrafficLevel; to_level: TrafficLevel; warm_start: boolean; generations: number;
            incident: { edge_ids: number[]; label: string; capacity_factor: number } };
  before_run_id: string;
  stale_plans: Partial<Record<ProfileKey, { metrics: Metrics; feasible: boolean }>>;
  after: OptimizeResult;
}
export interface Scenario {
  destinations: string[]; vehicles: number; capacity: number; max_duration_min: number;
  time_windows: boolean; traffic_level: TrafficLevel; algorithm: AlgorithmId;
  population: number; generations: number; local_search: boolean; seed: number;
}
export interface BenchmarkRun {
  seed: number; hypervolume: number; pareto_size: number; evaluations: number; runtime_s: number;
  best: number[] | null; hv_curve: [number, number][];
}
export interface BenchmarkAlgo {
  label: string; runs: BenchmarkRun[]; hv_mean: number; hv_std: number;
  pareto_mean: number; runtime_mean: number; evaluations_mean: number;
}
export interface BenchmarkResult {
  label: string; problem: ProblemSummary;
  setup: { seeds: number[]; population: number; generations: number; local_search: boolean; metric: string };
  algorithms: Record<AlgorithmId, BenchmarkAlgo>;
  planned: string[];
}
