from __future__ import annotations

import json
import re
from datetime import datetime, timedelta, timezone

import pytest
from pydantic import ValidationError

from simulator.config import DEVICE_PROFILES
from simulator.device import create_status_message, create_telemetry_message
from simulator.generator import WeatherGenerator
from simulator.models import TelemetryMessage, format_utc_iso


def _valid_payload() -> dict:
    profile = DEVICE_PROFILES["WX-SYD-001"]
    return create_telemetry_message(
        profile,
        1,
        WeatherGenerator(profile).next_reading(),
    ).model_dump(mode="json")


def test_required_telemetry_fields_and_json_round_trip() -> None:
    payload = _valid_payload()
    assert set(payload) == {
        "schemaVersion",
        "messageId",
        "deviceId",
        "locationCode",
        "sequenceNumber",
        "temperature",
        "humidity",
        "pressure",
        "rainfall",
        "windSpeed",
        "battery",
        "deviceTimestamp",
    }
    encoded = TelemetryMessage.model_validate(payload).to_json_bytes()
    assert TelemetryMessage.model_validate_json(encoded).model_dump(mode="json") == payload
    assert isinstance(json.loads(encoded), dict)


def test_utc_timestamp_formatting_uses_milliseconds_and_z() -> None:
    local_offset = timezone(timedelta(hours=5, minutes=45))
    value = format_utc_iso(datetime(2026, 9, 2, 17, 45, 0, 123456, tzinfo=local_offset))
    assert value == "2026-09-02T12:00:00.123Z"
    assert re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z", value)


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("schemaVersion", 2),
        ("sequenceNumber", 1.5),
        ("temperature", 71),
        ("humidity", -1),
        ("pressure", 1201),
        ("rainfall", -0.1),
        ("windSpeed", -1),
        ("battery", 101),
        ("deviceTimestamp", "2026-09-02T12:00:00+00:00"),
    ],
)
def test_pydantic_rejects_invalid_contract_values(field: str, value: object) -> None:
    payload = _valid_payload()
    payload[field] = value
    with pytest.raises(ValidationError):
        TelemetryMessage.model_validate(payload)


def test_extra_fields_are_rejected() -> None:
    with pytest.raises(ValidationError):
        TelemetryMessage.model_validate({**_valid_payload(), "unexpected": True})


def test_message_ids_are_unique() -> None:
    first = _valid_payload()["messageId"]
    second = _valid_payload()["messageId"]
    assert first != second


def test_status_message_generation() -> None:
    status = create_status_message("WX-BNE-001", "online")
    assert status.deviceId == "WX-BNE-001"
    assert status.status == "online"
    assert status.timestamp.endswith("Z")
