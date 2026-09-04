from __future__ import annotations

import pytest
from pydantic import ValidationError

from simulator.config import DEVICE_PROFILES, MQTTSettings


def test_seeded_device_ids_and_unique_client_ids() -> None:
    assert set(DEVICE_PROFILES) == {"WX-SYD-001", "WX-MEL-001", "WX-BNE-001"}
    client_ids = {profile.mqtt_client_id for profile in DEVICE_PROFILES.values()}
    assert len(client_ids) == 3


def test_mqtt_topic_construction() -> None:
    settings = MQTTSettings(_env_file=None, MQTT_TOPIC_ROOT="weathergrid")
    assert settings.telemetry_topic("WX-SYD-001") == "weathergrid/devices/WX-SYD-001/telemetry"
    assert settings.status_topic("WX-SYD-001") == "weathergrid/devices/WX-SYD-001/status"
    assert settings.wildcard_telemetry_topic() == "weathergrid/devices/+/telemetry"
    assert settings.wildcard_status_topic() == "weathergrid/devices/+/status"


def test_topic_root_rejects_mqtt_wildcards() -> None:
    with pytest.raises(ValidationError):
        MQTTSettings(_env_file=None, MQTT_TOPIC_ROOT="weathergrid/#")


def test_password_is_secret_and_requires_username() -> None:
    incomplete = MQTTSettings(_env_file=None, MQTT_PASSWORD="do-not-log")
    with pytest.raises(ValueError, match="MQTT_USERNAME is required"):
        incomplete.require_valid_credentials()
    assert "do-not-log" not in repr(incomplete)

    settings = MQTTSettings(
        _env_file=None,
        MQTT_USERNAME="simulator",
        MQTT_PASSWORD="do-not-log",
    )
    assert "do-not-log" not in repr(settings)
