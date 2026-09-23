import { useEffect, useMemo, useState } from "react";
import L from "leaflet";
import { CircleMarker, MapContainer, Marker, Polyline, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { EdgeState, Network, PlanSolution } from "../../api/types";
import { BAND_COLORS, BAND_LABEL, THEME, VEHICLE_COLORS } from "../../lib/format";

interface Props {
  network: Network;
  edgeStates: EdgeState[] | null;
  activeDestinations: string[];
  plan: PlanSolution | null;
  planLabel?: string;
  baseline: PlanSolution | null;
  alternatives: PlanSolution[];
  onToggleDestination?: (id: string) => void;
  locked?: boolean;
}

const ROAD_WEIGHT = { arterial: 7, collector: 4.5, local: 3 } as const;

type Pt = [number, number];

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** A dot that travels each vehicle's route in order, so direction and stop sequence are visible. */
function VehicleTracer({ points, color }: { points: Pt[]; color: string }) {
  const map = useMap();
  const key = points.map(p => p.join(",")).join(";");
  useEffect(() => {
    if (points.length < 2 || reducedMotion()) return;
    const cum = [0];
    for (let i = 1; i < points.length; i++) {
      cum.push(cum[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
    }
    const total = cum[cum.length - 1];
    const duration = Math.max(6000, total * 650); // ms; proportional to route length
    const marker = L.circleMarker(points[0], {
      radius: 5, color: "#FFFFFF", weight: 2, fillColor: color, fillOpacity: 1, interactive: false,
      className: "vehicle-tracer",
    }).addTo(map);
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const d = (((now - start) / duration) % 1) * total;
      let i = 1;
      while (i < cum.length - 1 && cum[i] < d) i++;
      const f = (d - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]);
      marker.setLatLng([points[i - 1][0] + (points[i][0] - points[i - 1][0]) * f,
                        points[i - 1][1] + (points[i][1] - points[i - 1][1]) * f]);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); marker.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key, color]);
  return null;
}

export default function NetworkMap({ network, edgeStates, activeDestinations, plan, planLabel, baseline,
  alternatives, onToggleDestination, locked }: Props) {
  const [showTraffic, setShowTraffic] = useState(true);
  const [showBaseline, setShowBaseline] = useState(false);
  const [showAlternatives, setShowAlternatives] = useState(false);

  const pos = useMemo(() => {
    const m = new Map<number, Pt>();
    network.nodes.forEach(n => m.set(n.id, [n.y, n.x]));
    return m;
  }, [network]);

  const bounds = useMemo(() => {
    const ys = network.nodes.map(n => n.y), xs = network.nodes.map(n => n.x);
    return L.latLngBounds([Math.min(...ys) - 0.5, Math.min(...xs) - 0.5], [Math.max(...ys) + 0.5, Math.max(...xs) + 0.5]);
  }, [network]);

  const stateById = useMemo(() => new Map((edgeStates ?? []).map(e => [e.id, e])), [edgeStates]);
  const incidentEdges = (edgeStates ?? []).filter(e => e.incident);

  const pathLine = (path: number[]): Pt[] => path.map(n => pos.get(n)!).filter(Boolean);

  // Which vehicle serves each destination, and in what order (for markers)
  const stopInfo = useMemo(() => {
    const m = new Map<string, { vehicle: number; order: number }>();
    plan?.vehicles.forEach((v, vi) => v.stops.forEach((s, oi) => m.set(s, { vehicle: vi, order: oi + 1 })));
    return m;
  }, [plan]);

  const depotPos = pos.get(network.depot)!;
  const planKey = plan?.signature ?? "none";

  return (
    <div className="map-shell">
      <MapContainer
        crs={L.CRS.Simple}
        bounds={bounds}
        minZoom={4} maxZoom={9} zoomSnap={0.25}
        attributionControl={false}
        className="network-map"
      >
        {/* Road network, coloured by simulated congestion */}
        {network.edges.map(e => {
          const a = pos.get(e.u)!, b = pos.get(e.v)!;
          const st = stateById.get(e.id);
          const color = showTraffic && st ? BAND_COLORS[st.band] : THEME.road;
          return (
            <Polyline key={`r${e.id}`} positions={[a, b]}
              pathOptions={{ color, weight: ROAD_WEIGHT[e.road_class], opacity: showTraffic ? 0.75 : 1, lineCap: "round" }}>
              <Tooltip sticky className="map-tip">
                <strong>{e.road_class[0].toUpperCase() + e.road_class.slice(1)} road</strong> · {e.lanes} lane{e.lanes > 1 ? "s" : ""}<br />
                {e.distance_km.toFixed(2)} km · free flow {e.free_flow_kmh} km/h
                {st && <><br />v/c {st.vc.toFixed(2)} ({BAND_LABEL[st.band]}) · {st.time_min.toFixed(1)} min
                  {st.incident && <><br /><span className="tip-alert">Simulated lane closure</span></>}</>}
              </Tooltip>
            </Polyline>
          );
        })}

        {/* Incident marking */}
        {incidentEdges.map(st => {
          const e = network.edges.find(x => x.id === st.id)!;
          return <Polyline key={`i${st.id}`} positions={[pos.get(e.u)!, pos.get(e.v)!]}
            pathOptions={{ color: "#FFFFFF", weight: 2.5, dashArray: "4 6", opacity: 0.9, className: "incident-line" }} interactive={false} />;
        })}

        {/* Other Pareto plans (context only) */}
        {showAlternatives && alternatives.map((s, si) => s.vehicles.map(v => v.path.length > 1 && (
          <Polyline key={`alt${si}-${v.vehicle}`} positions={pathLine(v.path)} interactive={false}
            pathOptions={{ color: "#C4B5FD", weight: 1.5, opacity: 0.25 }} />
        )))}

        {/* Baseline plan */}
        {showBaseline && baseline?.vehicles.map(v => v.path.length > 1 && (
          <Polyline key={`base${v.vehicle}`} positions={pathLine(v.path)} interactive={false}
            pathOptions={{ color: "#E2E8F0", weight: 2.5, dashArray: "2 7", opacity: 0.85 }} />
        ))}

        {/* Selected optimised plan: white casing + vehicle colour */}
        {plan?.vehicles.map((v, vi) => v.path.length > 1 && (
          <Polyline key={`case${planKey}-${vi}`} positions={pathLine(v.path)} interactive={false}
            pathOptions={{ color: VEHICLE_COLORS[vi], weight: 14, opacity: 0.18, lineJoin: "round", className: "route-glow" }} />
        ))}
        {plan?.vehicles.map((v, vi) => v.path.length > 1 && (
          <Polyline key={`veh${planKey}-${vi}`} positions={pathLine(v.path)}
            pathOptions={{ color: VEHICLE_COLORS[vi], weight: 4.5, opacity: 1, lineJoin: "round", className: "route-draw" }}>
            <Tooltip sticky className="map-tip">
              <strong>Vehicle {v.vehicle}</strong>: Depot → {v.stops.join(" → ")} → Depot<br />
              {v.driving_min.toFixed(1)} min driving · {v.distance_km.toFixed(1)} km · load {v.load}/{v.capacity}
            </Tooltip>
          </Polyline>
        ))}

        {plan?.vehicles.map((v, vi) => v.path.length > 1 && (
          <VehicleTracer key={`trace${vi}`} points={pathLine(v.path)} color={VEHICLE_COLORS[vi]} />
        ))}

        {/* Intersections */}
        {network.nodes.filter(n => n.kind === "intersection").map(n => (
          <CircleMarker key={`n${n.id}`} center={[n.y, n.x]} radius={2}
            pathOptions={{ color: "rgba(255,255,255,0.35)", fillColor: THEME.panel, fillOpacity: 1, weight: 1 }} interactive={false} />
        ))}

        {/* Destinations */}
        {network.destinations.map(d => {
          const active = activeDestinations.includes(d.id);
          const info = stopInfo.get(d.id);
          const color = info ? VEHICLE_COLORS[info.vehicle] : "#9D5FF5";
          const html = `<div class="dest-pin ${active ? "" : "is-off"}" style="--pin:${color}">
              <span>${d.id}</span>${info ? `<em>${info.order}</em>` : ""}</div>`;
          return (
            <Marker key={d.id} position={[pos.get(d.node)![0], pos.get(d.node)![1]]}
              icon={L.divIcon({ html, className: "", iconSize: [34, 22], iconAnchor: [17, 11] })}
              eventHandlers={{ click: () => !locked && onToggleDestination?.(d.id) }}>
              <Tooltip direction="top" offset={[0, -10]} className="map-tip">
                <strong>{d.id}</strong> · demand {d.demand} · service {d.service_min} min
                {d.window && <><br />Delivery window {d.window[0]}–{d.window[1]} min after dispatch</>}
                {info && <><br />Vehicle {info.vehicle + 1}, stop {info.order}</>}
                {!locked && <><br /><span className="tip-muted">Click to {active ? "exclude" : "include"}</span></>}
              </Tooltip>
            </Marker>
          );
        })}

        <Marker position={depotPos}
          icon={L.divIcon({ html: `<div class="depot-pin">Depot</div>`, className: "", iconSize: [48, 24], iconAnchor: [24, 12] })}>
          <Tooltip direction="top" offset={[0, -12]} className="map-tip">Depot: all vehicles start and end here</Tooltip>
        </Marker>
      </MapContainer>

      {/* Layer toggles (pattern reused from Round 1 map) */}
      <div className="map-layers" role="group" aria-label="Map layers">
        <label><input type="checkbox" checked={showTraffic} onChange={e => setShowTraffic(e.target.checked)} /> Traffic</label>
        <label><input type="checkbox" checked={showBaseline} disabled={!baseline} onChange={e => setShowBaseline(e.target.checked)} /> Baseline plan</label>
        <label><input type="checkbox" checked={showAlternatives} disabled={!alternatives.length} onChange={e => setShowAlternatives(e.target.checked)} /> Other Pareto plans</label>
      </div>

      <div className="map-legend">
        {plan && (
          <div className="legend-block">
            <div className="legend-title">{planLabel ?? "Selected plan"}</div>
            {plan.vehicles.map((v, i) => v.stops.length > 0 && (
              <div key={i} className="legend-row"><i style={{ background: VEHICLE_COLORS[i] }} className="swatch-line" />
                Vehicle {v.vehicle} · {v.stops.length} stops</div>
            ))}
            {showBaseline && <div className="legend-row"><i className="swatch-dash" /> Baseline plan</div>}
          </div>
        )}
        {showTraffic && (
          <div className="legend-block">
            <div className="legend-title">Simulated traffic (v/c)</div>
            <div className="legend-ramp">
              {(["free", "moderate", "heavy", "severe"] as const).map(b => (
                <span key={b}><i style={{ background: BAND_COLORS[b] }} />{BAND_LABEL[b]}</span>
              ))}
            </div>
            {incidentEdges.length > 0 && <div className="legend-row"><i className="swatch-incident" /> Lane closure</div>}
          </div>
        )}
      </div>
    </div>
  );
}
