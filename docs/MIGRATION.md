# Round 1 → Round 2 migration record

Round 1 (PravahAI / ShadowEvent-AI) mined historical incident data for recurring "shadow
events". Round 2 optimises fleet routes under traffic. The uploads contained no Round 2 code,
so the backend is new. The frontend is built on Round 1's stack and patterns.

## Kept
- **The Round 1 visual identity:**
  - The dark theme tokens, aurora background, glass cards and buttons, and Inter type. The rules are extracted whole from Round 1's `index.css`.
  - The hero with the animated traffic-particle canvas (`HeroCanvas.tsx`, verbatim).
  - The fixed glass navbar that solidifies on scroll, with the live clock.
  - The section headers, the three-pillar "how it works" band, the pipeline strip and the footer.
  - The fade, pulse and bounce animations.
- The stack: Vite, React 19, TypeScript, react-router, react-leaflet, Recharts, lucide-react and axios.
- Build, TypeScript, ESLint and Vercel configuration.
- The PravahAI logo and brand.
- The API base-URL client (`src/api/client.ts`).

## Adapted
- **Top navbar.** Same brand and NavLink structure, now with three Round 2 destinations. The live clock was removed because it implied live data.
- **Map.** The react-leaflet map and the layer-toggle panel pattern now show a synthetic network on a simple coordinate system with no tiles. Real Bengaluru tiles under a synthetic network would misrepresent the data.
- **Methodology page.** Its sticky section-index layout is now "How it works".
- **"Map + side panel" command-centre layout.** Now scenario | map | Pareto plans.
- **Recharts usage.** Now the Pareto front, convergence and benchmark charts.

## Removed (not relevant to route optimisation)
- Shadow events, SERI, risk calendar, forecast, similarity explorer, what-if simulator, learning engine, incident repository and analytics pages.
- The Gemini advisory, the heatmap layer, the MapMyIndia overlay and the operational SERI panel.
- The dependencies `@asymmetrik/ngx-leaflet-markercluster` (an Angular package) and `leaflet.heat`.
- The duplicate Leaflet load from a CDN.
- The out-of-sync lockfile, which was regenerated.

## Created
- The whole backend engine: network, traffic, routing, constraints, evaluation, QNSGA-II, NSGA-II, local search, baseline, API and tests.
- Frontend:
  - the scenario panel
  - the Pareto profile cards with baseline deltas
  - the route detail
  - the BEFORE → CHANGE → AFTER traffic strip
  - the Pareto and convergence charts
  - the workflow strip
  - the benchmark page

## Decisions
- **Recharts instead of Plotly** (the PRD lists Plotly). Recharts is already in the stack and covers both required charts; Plotly would add about 3 MB.
- **Round 1's dark theme and landing structure are kept.** The optimiser dashboard sits in the command-centre slot where Round 1 had its intelligence map.
- **New motion is tied to meaning:**
  - Routes draw in when a plan is selected.
  - A dot travels each vehicle's route in stop order.
  - Closed lanes flash.
  - The selected Pareto point pulses.
  - Sections reveal on scroll.
- **All motion is disabled under `prefers-reduced-motion`.**
- **The Round 1 theme-toggle button was not brought back.** It never did anything.
