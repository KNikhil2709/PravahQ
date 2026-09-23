import { Check } from "lucide-react";

interface Props { networkLoaded: boolean; hasResult: boolean; changed: boolean; optimizing: boolean }

export default function WorkflowStrip({ networkLoaded, hasResult, changed, optimizing }: Props) {
  const steps = [
    { label: "Load road network", done: networkLoaded },
    { label: "Set fleet, stops, traffic, constraints", done: hasResult },
    { label: "Optimise with QNSGA-II", done: hasResult, active: optimizing },
    { label: "Compare Pareto plans", done: changed },
    { label: "Traffic change → re-optimise", done: changed },
  ];
  const current = steps.findIndex(s => !s.done);
  return (
    <ol className="workflow" aria-label="Workflow">
      {steps.map((s, i) => (
        <li key={s.label} className={s.done ? "is-done" : i === current ? "is-current" : ""}>
          <span className="wf-num">{s.done ? <Check size={12} strokeWidth={3} /> : i + 1}</span>{s.label}
        </li>
      ))}
    </ol>
  );
}
