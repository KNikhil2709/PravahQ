"""Write the deterministic demo network (seed 42) and its simulated traffic states to JSON.

The application generates this data at runtime from the same seed; the exported file is
for inspection and reproducibility.  Run from backend/:  python -m data.export_demo
"""
import json
from pathlib import Path

from network.generator import generate_network
from traffic.simulator import apply_traffic


def main(seed: int = 42) -> Path:
    net = generate_network(seed)
    out = net.to_dict()
    out["traffic"] = {}
    for level in ("LOW", "MODERATE", "HIGH"):
        st = apply_traffic(net.graph, level)
        out["traffic"][level] = {str(k): {"vc": round(v["vc"], 4), "time_min": round(v["time_min"], 4), "band": v["band"]}
                                 for k, v in st.edges.items()}
    path = Path(__file__).parent / f"demo_network_seed{seed}.json"
    path.write_text(json.dumps(out, indent=1))
    return path


if __name__ == "__main__":
    print(f"Wrote {main()}")
