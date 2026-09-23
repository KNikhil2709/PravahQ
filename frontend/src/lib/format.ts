import type { Band, Metrics, ProfileKey } from "../api/types";

export const PROFILES: { key: ProfileKey; label: string; hint: string }[] = [
  { key: "fastest", label: "Fastest", hint: "Lowest total travel time" },
  { key: "least_congested", label: "Least congested", hint: "Least time in congested traffic" },
  { key: "lowest_cost", label: "Lowest cost", hint: "Lowest running + dispatch cost" },
  { key: "balanced", label: "Balanced", hint: "Closest to the best of all three" },
];

// PravahAI Round 1 palette, shared by the map and charts.
export const THEME = {
  bg: "#100F0A", panel: "#0C0B08", ink: "#FFFFFF", muted: "#94A3B8", grid: "rgba(255,255,255,0.06)",
  axis: "#64748B", road: "rgba(255,255,255,0.13)", primary: "#7C3AED", primaryLight: "#9D5FF5",
  pink: "#EC4899", cyan: "#00D4FF", better: "#00E676", worse: "#FF5A5F",
};

// Vehicle colours: distinct from each other and from the congestion ramp on the map.
export const VEHICLE_COLORS = ["#00D4FF", "#B388FF", "#F472B6"];

export const BAND_COLORS: Record<Band, string> = {
  free: "#2F6E57", moderate: "#FFC857", heavy: "#F28C38", severe: "#FF5A5F",
};
export const BAND_LABEL: Record<Band, string> = {
  free: "Free flow", moderate: "Moderate", heavy: "Heavy", severe: "Over capacity",
};

export const POLICY_LABEL: Record<string, string> = {
  fastest: "fastest path", calm: "low-congestion path", shortest: "shortest path", balanced: "balanced path",
};

export const fmtMin = (m: number) => `${m.toFixed(m >= 100 ? 0 : 1)} min`;
export const fmtInr = (v: number) => `₹${Math.round(v).toLocaleString("en-IN")}`;
export const fmtKm = (v: number) => `${v.toFixed(1)} km`;

export type MetricKey = "travel_time_min" | "exposure_min" | "cost_inr" | "distance_km";
export const METRICS: { key: MetricKey; label: string; fmt: (v: number) => string }[] = [
  { key: "travel_time_min", label: "Travel time", fmt: fmtMin },
  { key: "exposure_min", label: "Congestion", fmt: fmtMin },
  { key: "distance_km", label: "Distance", fmt: fmtKm },
  { key: "cost_inr", label: "Cost", fmt: fmtInr },
];

/** Percent change of `v` against `ref` (negative = lower = better for every metric here). */
export function delta(v: number, ref: number): number | null {
  if (!isFinite(ref) || Math.abs(ref) < 1e-9) return null;
  return ((v - ref) / ref) * 100;
}

export function deltaText(v: number, ref: number): { text: string; tone: "better" | "worse" | "same" } {
  const d = delta(v, ref);
  if (d === null || Math.abs(d) < 0.5) return { text: "≈ same", tone: "same" };
  if (d > 300) return { text: `×${(v / ref).toFixed(v / ref >= 10 ? 0 : 1)}`, tone: "worse" };
  return { text: `${d > 0 ? "+" : "−"}${Math.abs(d).toFixed(0)}%`, tone: d < 0 ? "better" : "worse" };
}

export const metricOf = (m: Metrics, k: MetricKey) => m[k];
