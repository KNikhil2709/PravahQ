import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import pravahLogo from "../../assets/pravah_logo.png";

// Round 1 top navbar (glass bar that solidifies on scroll, brand, links, clock), Round 2 routes.
const NAV = [
  { path: "/", label: "Route Optimiser", end: true },
  { path: "/benchmark", label: "Benchmark" },
  { path: "/method", label: "How It Works" },
];

function LiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span style={{ fontVariantNumeric: "tabular-nums" }}>
      {time.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} IST
    </span>
  );
}

export default function TopNav() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <nav className={`top-navbar${scrolled ? " scrolled" : ""}`}>
      <div className="navbar-brand" onClick={() => navigate("/")} role="button" tabIndex={0}
        title="PravahAI: go to Route Optimiser" onKeyDown={e => e.key === "Enter" && navigate("/")}>
        <img src={pravahLogo} alt="PravahAI" className="navbar-logo-img" />
      </div>
      <div className="navbar-links">
        {NAV.map(({ path, label, end }) => (
          <NavLink key={path} to={path} end={end} className={({ isActive }) => `navbar-link${isActive ? " active" : ""}`}>
            {label}
          </NavLink>
        ))}
      </div>
      <div className="navbar-right">
        <span className="navbar-sim-chip" title="No live traffic feeds or API keys are used">Simulated traffic</span>
        <div className="navbar-clock"><span className="navbar-clock-dot" /><LiveClock /></div>
      </div>
    </nav>
  );
}
