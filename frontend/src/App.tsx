import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import TopNav from "./components/layout/TopNav";
import Optimizer from "./pages/Optimizer";
import Benchmark from "./pages/Benchmark";
import HowItWorks from "./pages/HowItWorks";
import { useOptimizer } from "./hooks/useOptimizer";

export default function App() {
  // Lifted to the app so optimiser state survives navigating to the other pages.
  const state = useOptimizer();
  return (
    <BrowserRouter>
      <div className="app-layout">
      <TopNav />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Optimizer state={state} />} />
          <Route path="/benchmark" element={<Benchmark scenario={state.scenario} />} />
          <Route path="/method" element={<HowItWorks />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      </div>
    </BrowserRouter>
  );
}
