import { useCallback, useEffect, useMemo, useState } from "react";
import { errorMessage, getNetwork, getTraffic, optimize, simulateTrafficChange } from "../api/optimizer";
import type { EdgeState, Network, OptimizeResult, ProfileKey, Scenario, TrafficChangeResult } from "../api/types";

export const DEFAULT_SCENARIO: Scenario = {
  destinations: ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9", "C10"],
  vehicles: 3, capacity: 12, max_duration_min: 120, time_windows: true,
  traffic_level: "MODERATE", algorithm: "qnsga2",
  population: 40, generations: 60, local_search: true, seed: 7,
};

export type Status = "idle" | "loading-network" | "optimizing" | "changing";

/** All server interaction and workflow state for the optimizer dashboard. */
export function useOptimizer() {
  const [network, setNetwork] = useState<Network | null>(null);
  const [scenario, setScenario] = useState<Scenario>(DEFAULT_SCENARIO);
  const [preview, setPreview] = useState<EdgeState[] | null>(null);
  const [result, setResult] = useState<OptimizeResult | null>(null);
  const [before, setBefore] = useState<OptimizeResult | null>(null);
  const [change, setChange] = useState<TrafficChangeResult | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [resultScenario, setResultScenario] = useState<Scenario | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const loadNetwork = useCallback(async () => {
    setStatus("loading-network"); setError(null);
    try { setNetwork(await getNetwork()); }
    catch (e) { setError(errorMessage(e)); }
    finally { setStatus("idle"); }
  }, []);

  // Traffic preview for the chosen level (before any optimisation)
  useEffect(() => {
    if (!network) return;
    let alive = true;
    getTraffic(scenario.traffic_level).then(e => alive && setPreview(e)).catch(() => {});
    return () => { alive = false; };
  }, [network, scenario.traffic_level]);

  const update = useCallback((patch: Partial<Scenario>) => setScenario(s => ({ ...s, ...patch })), []);

  const run = useCallback(async () => {
    setStatus("optimizing"); setError(null);
    try {
      const r = await optimize(scenario);
      setResult(r); setResultScenario(scenario); setBefore(null); setChange(null);
      setSelected(r.profiles.balanced ?? (r.pareto.length ? 0 : null));
    } catch (e) { setError(errorMessage(e)); }
    finally { setStatus("idle"); }
  }, [scenario]);

  const trafficChange = useCallback(async () => {
    if (!result) return;
    const selectedProfile = (Object.entries(result.profiles).find(([, i]) => i === selected)?.[0] ?? "balanced") as ProfileKey;
    setStatus("changing"); setError(null);
    try {
      const c = await simulateTrafficChange(result.run_id, resultScenario ?? scenario);
      setBefore(result); setChange(c); setResult(c.after);
      setScenario(s => ({ ...s, traffic_level: c.change.to_level }));
      setResultScenario(s => (s ? { ...s, traffic_level: c.change.to_level } : s));
      setSelected(c.after.profiles[selectedProfile] ?? c.after.profiles.balanced ?? null);
    } catch (e) { setError(errorMessage(e)); }
    finally { setStatus("idle"); }
  }, [result, selected, resultScenario, scenario]);

  const outdated = useMemo(() => {
    if (!result || !resultScenario) return false;
    return JSON.stringify(resultScenario) !== JSON.stringify(scenario);
  }, [result, resultScenario, scenario]);

  const selectedProfile = useMemo<ProfileKey | null>(() => {
    if (!result || selected === null) return null;
    const hit = Object.entries(result.profiles).find(([, i]) => i === selected);
    return (hit?.[0] as ProfileKey) ?? null;
  }, [result, selected]);

  return {
    network, scenario, preview, result, before, change, selected, selectedProfile, status, error, outdated,
    loadNetwork, update, run, trafficChange, select: setSelected, dismissError: () => setError(null),
  };
}

export type OptimizerState = ReturnType<typeof useOptimizer>;
