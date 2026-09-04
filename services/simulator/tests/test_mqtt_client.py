from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest
from pydantic import ValidationError

from simulator.config import DEVICE_PROFILES, MQTTSettings
from simulator.device import create_telemetry_message
from simulator.generator import WeatherGenerator
from simulator.models import StatusMessage
from simulator.mqtt_client import DeviceMQTTClient


def _message():  # noqa: ANN202
    profile = DEVICE_PROFILES["WX-SYD-001"]
    return create_telemetry_message(
        profile,
        1,
        WeatherGenerator(profile).next_reading(),
    )


def _publish_result():  # noqa: ANN202
    result = MagicMock()
    result.rc = 0
    result.is_published.return_value = True
    return result


@patch("simulator.mqtt_client.mqtt.Client")
def test_lwt_and_publish_delivery_flags(client_factory: MagicMock) -> None:
    raw_client = client_factory.return_value
    raw_client.publish.return_value = _publish_result()
    settings = MQTTSettings(_env_file=None)
    client = DeviceMQTTClient("WX-SYD-001", "unique-client", settings)

    will_args = raw_client.will_set.call_args
    assert will_args.args[0] == "weathergrid/devices/WX-SYD-001/status"
    will_payload = StatusMessage.model_validate_json(will_args.args[1])
    assert will_payload.status == "offline"
    assert will_args.kwargs == {"qos": 1, "retain": True}

    client.publish_telemetry(_message())
    telemetry_call = raw_client.publish.call_args
    assert telemetry_call.args[0] == "weathergrid/devices/WX-SYD-001/telemetry"
    assert telemetry_call.kwargs["qos"] == 1
    assert telemetry_call.kwargs["retain"] is False

    client.publish_status("online")
    status_call = raw_client.publish.call_args
    assert status_call.args[0] == "weathergrid/devices/WX-SYD-001/status"
    assert status_call.kwargs["qos"] == 1
    assert status_call.kwargs["retain"] is True
    assert json.loads(status_call.kwargs["payload"])["status"] == "online"


@patch("simulator.mqtt_client.mqtt.Client")
def test_invalid_locally_constructed_message_is_not_published(client_factory: MagicMock) -> None:
    raw_client = client_factory.return_value
    client = DeviceMQTTClient("WX-SYD-001", "unique-client", MQTTSettings(_env_file=None))
    invalid = _message().model_copy(update={"temperature": 999})

    with pytest.raises(ValidationError):
        client.publish_telemetry(invalid)
    raw_client.publish.assert_not_called()
