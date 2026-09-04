"""Atomic, non-sensitive per-device sequence-number persistence."""

from __future__ import annotations

import json
import logging
import os
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)


class StateFileError(RuntimeError):
    """Raised when existing state cannot be trusted safely."""


class SequenceState:
    def __init__(self, device_id: str, state_dir: Path) -> None:
        self.device_id = device_id
        self.state_dir = state_dir
        self.state_file = state_dir / f"{device_id}.json"
        self._last_sequence_number = self._load()

    def _load(self) -> int:
        if not self.state_file.exists():
            return 0
        try:
            raw = json.loads(self.state_file.read_text(encoding="utf-8"))
            if raw.get("deviceId") != self.device_id:
                raise ValueError("device ID does not match the state filename")
            value = raw["lastSequenceNumber"]
            if isinstance(value, bool) or not isinstance(value, int) or value < 0:
                raise ValueError("lastSequenceNumber must be a non-negative integer")
        except (json.JSONDecodeError, KeyError, OSError, TypeError, ValueError) as exc:
            # Silently restarting at 1 could duplicate messages after a corrupt
            # state file, so fail safely and let the developer inspect it.
            raise StateFileError(f"Invalid sequence state at {self.state_file}: {exc}") from exc

        logger.info(
            "device=%s restored_sequence=%d state_file=%s",
            self.device_id,
            value,
            self.state_file,
        )
        return value

    @property
    def last_sequence_number(self) -> int:
        return self._last_sequence_number

    def next_sequence_number(self) -> int:
        next_value = self._last_sequence_number + 1
        self._save(next_value)
        self._last_sequence_number = next_value
        return next_value

    def _save(self, value: int) -> None:
        self.state_dir.mkdir(parents=True, exist_ok=True)
        payload = json.dumps(
            {"deviceId": self.device_id, "lastSequenceNumber": value},
            separators=(",", ":"),
        )

        fd, temp_name = tempfile.mkstemp(
            dir=self.state_dir,
            prefix=f".{self.device_id}.",
            suffix=".tmp",
        )
        temp_path = Path(temp_name)
        try:
            with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as temp_file:
                temp_file.write(payload)
                temp_file.write("\n")
                temp_file.flush()
                os.fsync(temp_file.fileno())
            os.replace(temp_path, self.state_file)
        finally:
            temp_path.unlink(missing_ok=True)
