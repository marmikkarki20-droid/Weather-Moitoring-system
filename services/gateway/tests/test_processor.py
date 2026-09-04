from __future__ import annotations

import json

import pytest

from gateway.buffer import SQLiteBuffer
from gateway.config import GatewaySettings
from gateway.models import DeliveryResult, DeliveryStatus
from gateway.processor import GatewayAuthenticationError, TelemetryProcessor


class FakePayloadClient:
    def __init__(self, results: list[DeliveryResult]) -> None:
        self.results = results
        self.sent = []

    def deliver(self, telemetry):  # noqa: ANN001
        self.sent.append(telemetry)
        return self.results.pop(0)


def settings(tmp_path):  # noqa: ANN001
    return GatewaySettings(
        _env_file=None,
        PAYLOAD_INGEST_URL='http://localhost:3000/api/telemetry/ingest',
        GATEWAY_API_KEY='test-key',
        GATEWAY_BUFFER_PATH=str(tmp_path / 'buffer.sqlite3'),
    )


def payload(device_id: str = 'WX-SYD-001') -> bytes:
    return json.dumps(
        {
            'schemaVersion': 1,
            'messageId': '018f02cf-7c5a-4ebd-b849-142f4e3d6201',
            'deviceId': device_id,
            'locationCode': 'SYD',
            'sequenceNumber': 1,
            'temperature': 20,
            'humidity': 50,
            'pressure': 1010,
            'rainfall': 0,
            'windSpeed': 2,
            'battery': 99,
            'deviceTimestamp': '2026-09-02T12:00:00.000Z',
        }
    ).encode()


def processor(tmp_path, results):  # noqa: ANN001
    app_settings = settings(tmp_path)
    buffer = SQLiteBuffer(app_settings.gateway_buffer_path, app_settings.gateway_buffer_max_messages)
    client = FakePayloadClient(results)
    return TelemetryProcessor(app_settings, client, buffer), client, buffer


def test_valid_payload_adds_gateway_timestamp_and_delivers(tmp_path) -> None:  # noqa: ANN001
    subject, client, _ = processor(tmp_path, [DeliveryResult(status=DeliveryStatus.ACCEPTED, http_status=201)])
    result = subject.process('weathergrid/devices/WX-SYD-001/telemetry', payload())
    assert result.status == 'accepted'
    assert client.sent[0].gatewayTimestamp.endswith('Z')


def test_invalid_json_and_topic_mismatch_never_reach_payload(tmp_path) -> None:  # noqa: ANN001
    subject, client, _ = processor(tmp_path, [DeliveryResult(status=DeliveryStatus.ACCEPTED)])
    assert subject.process('weathergrid/devices/WX-SYD-001/telemetry', b'not json').status == 'invalid_payload'
    assert subject.process('weathergrid/devices/WX-MEL-001/telemetry', payload()).status == 'topic_device_mismatch'
    assert client.sent == []


def test_temporary_failure_buffers_then_flushes(tmp_path) -> None:  # noqa: ANN001
    subject, client, buffer = processor(
        tmp_path,
        [
            DeliveryResult(status=DeliveryStatus.RETRYABLE),
            DeliveryResult(status=DeliveryStatus.ACCEPTED, http_status=201),
        ],
    )
    assert subject.process('weathergrid/devices/WX-SYD-001/telemetry', payload()).status == 'buffered'
    assert buffer.count() == 1
    assert subject.flush_due() == 1
    assert buffer.count() == 0


def test_permanent_and_authentication_failures_are_not_retried(tmp_path) -> None:  # noqa: ANN001
    subject, _, buffer = processor(tmp_path, [DeliveryResult(status=DeliveryStatus.PERMANENT, http_status=400)])
    assert subject.process('weathergrid/devices/WX-SYD-001/telemetry', payload()).status == 'permanent_rejection'
    assert buffer.count() == 0

    subject, _, _ = processor(tmp_path, [DeliveryResult(status=DeliveryStatus.AUTH_FAILURE, http_status=401)])
    with pytest.raises(GatewayAuthenticationError):
        subject.process('weathergrid/devices/WX-SYD-001/telemetry', payload())
