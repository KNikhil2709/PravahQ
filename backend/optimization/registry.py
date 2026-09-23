"""Import all optimisers so they self-register. Add new algorithms here."""
from optimization.base import REGISTRY, Optimizer, Params  # noqa: F401
from optimization.qnsga2 import optimizer as _qnsga2  # noqa: F401
from optimization.nsga2 import optimizer as _nsga2  # noqa: F401

# Planned (architecture-ready, not implemented): QPSO, QIGA, APSO, HGS.
PLANNED = ["QPSO", "QIGA", "APSO", "HGS"]


def get(name: str) -> Optimizer:
    if name not in REGISTRY:
        raise KeyError(f"Unknown algorithm '{name}'. Available: {sorted(REGISTRY)}")
    return REGISTRY[name]()
