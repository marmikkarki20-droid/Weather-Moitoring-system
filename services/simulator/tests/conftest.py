"""Make the simulator package importable from repository-root pytest runs."""

from __future__ import annotations

import sys
from pathlib import Path

SIMULATOR_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SIMULATOR_ROOT))
