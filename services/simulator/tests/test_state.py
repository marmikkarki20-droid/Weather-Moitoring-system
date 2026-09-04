from __future__ import annotations

import json

import pytest

from simulator.state import SequenceState, StateFileError


def test_sequence_number_persists_across_instances(tmp_path) -> None:  # noqa: ANN001
    first = SequenceState("WX-SYD-001", tmp_path)
    assert first.next_sequence_number() == 1
    assert first.next_sequence_number() == 2

    restarted = SequenceState("WX-SYD-001", tmp_path)
    assert restarted.last_sequence_number == 2
    assert restarted.next_sequence_number() == 3

    stored = json.loads((tmp_path / "WX-SYD-001.json").read_text(encoding="utf-8"))
    assert stored == {"deviceId": "WX-SYD-001", "lastSequenceNumber": 3}
    assert not list(tmp_path.glob("*.tmp"))


def test_corrupt_state_fails_closed_instead_of_reusing_sequence(tmp_path) -> None:  # noqa: ANN001
    (tmp_path / "WX-SYD-001.json").write_text("not-json", encoding="utf-8")
    with pytest.raises(StateFileError):
        SequenceState("WX-SYD-001", tmp_path)
