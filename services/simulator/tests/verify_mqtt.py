"""End-to-end MQTT verification against a running local Mosquitto broker.

The script subscribes before launching the real simulator CLI, validates all
received telemetry, restarts Sydney against the same temporary state, and
then confirms the retained graceful-offline statuses. It never imports or
writes to Payload/PostgreSQL.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

import paho.mqtt.client as mqtt

SIMULATOR_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SIMULATOR_ROOT))

from simulator.config import DEVICE_PROFILES, MQTTSettings, get_mqtt_settings  # noqa: E402
from simulator.models import StatusMessage, TelemetryMessage  # noqa: E402


@dataclass(frozen=True)
class ReceivedMessage:
    topic: str
    payload: bytes
    retained: bool


class MQTTCollector:
    def __init__(self, settings: MQTTSettings, topic: str) -> None:
        self.settings = settings
        self.topic = topic
        self.messages: list[ReceivedMessage] = []
        self.connected = threading.Event()
        self.subscribed = threading.Event()
        self.condition = threading.Condition()
        self.connection_error: str | None = None

        self.client = mqtt.Client(
            callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
            client_id=f"weathergrid-verifier-{uuid4().hex}",
            protocol=mqtt.MQTTv311,
        )
        if settings.username:
            self.client.username_pw_set(
                settings.username,
                settings.password.get_secret_value(),
            )
        self.client.on_connect = self._on_connect
        self.client.on_subscribe = self._on_subscribe
        self.client.on_message = self._on_message

    def _on_connect(self, client, userdata, flags, reason_code, properties=None) -> None:  # noqa: ANN001
        if reason_code != 0:
            self.connection_error = str(reason_code)
            self.connected.set()
            return
        self.connected.set()
        client.subscribe(self.topic, qos=1)

    def _on_subscribe(self, client, userdata, mid, reason_codes, properties=None) -> None:  # noqa: ANN001
        self.subscribed.set()

    def _on_message(self, client, userdata, message) -> None:  # noqa: ANN001
        with self.condition:
            self.messages.append(
                ReceivedMessage(message.topic, bytes(message.payload), bool(message.retain)),
            )
            self.condition.notify_all()

    def start(self) -> None:
        try:
            self.client.connect(
                self.settings.host,
                self.settings.port,
                keepalive=self.settings.keepalive_seconds,
            )
        except OSError as exc:
            raise RuntimeError(
                f"Cannot connect to MQTT broker at {self.settings.host}:{self.settings.port}. "
                "Start it with `docker compose up -d mosquitto`."
            ) from exc
        self.client.loop_start()
        if not self.connected.wait(5) or self.connection_error:
            self.stop()
            raise RuntimeError(f"MQTT verifier connection failed: {self.connection_error or 'timeout'}")
        if not self.subscribed.wait(5):
            self.stop()
            raise RuntimeError(f"Timed out subscribing to {self.topic}")

    def wait_for_count(self, count: int, timeout: float = 15) -> None:
        deadline = time.monotonic() + timeout
        with self.condition:
            while len(self.messages) < count:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise TimeoutError(
                        f"Expected {count} messages on {self.topic}, received {len(self.messages)}"
                    )
                self.condition.wait(remaining)

    def stop(self) -> None:
        self.client.disconnect()
        self.client.loop_stop()


def _run_simulator(*args: str) -> None:
    command = [sys.executable, "-m", "simulator.cli", *args]
    result = subprocess.run(
        command,
        cwd=SIMULATOR_ROOT,
        env=os.environ.copy(),
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(
            "Simulator command failed\n"
            f"command: {' '.join(command)}\n"
            f"stdout:\n{result.stdout}\n"
            f"stderr:\n{result.stderr}"
        )


def _validate_telemetry(
    settings: MQTTSettings,
    received: list[ReceivedMessage],
) -> list[TelemetryMessage]:
    validated: list[TelemetryMessage] = []
    for message in received:
        try:
            parsed_json = json.loads(message.payload)
        except json.JSONDecodeError as exc:
            raise AssertionError(f"Invalid JSON received on {message.topic}") from exc
        payload = TelemetryMessage.model_validate(parsed_json)
        expected_topic = settings.telemetry_topic(payload.deviceId)
        assert message.topic == expected_topic, (message.topic, expected_topic)
        assert not message.retained, f"Telemetry was retained on {message.topic}"
        validated.append(payload)
    return validated


def _verify_retained_offline(settings: MQTTSettings) -> None:
    collector = MQTTCollector(settings, settings.wildcard_status_topic())
    collector.start()
    try:
        collector.wait_for_count(len(DEVICE_PROFILES))
        by_device: dict[str, StatusMessage] = {}
        for received in collector.messages:
            payload = StatusMessage.model_validate_json(received.payload)
            assert received.topic == settings.status_topic(payload.deviceId)
            assert received.retained, f"Status was not retained on {received.topic}"
            by_device[payload.deviceId] = payload
        assert set(by_device) == set(DEVICE_PROFILES)
        assert all(payload.status == "offline" for payload in by_device.values())
    finally:
        collector.stop()


def verify() -> None:
    settings = get_mqtt_settings()
    telemetry = MQTTCollector(settings, settings.wildcard_telemetry_topic())
    telemetry.start()

    try:
        with tempfile.TemporaryDirectory(prefix="weathergrid-mqtt-verification-") as temp_dir:
            state_dir = Path(temp_dir)
            _run_simulator(
                "run-all",
                "--messages",
                "2",
                "--interval",
                "0.05",
                "--seed",
                "20260902",
                "--state-dir",
                str(state_dir),
            )
            telemetry.wait_for_count(6)

            # Restart one device against the same local state. Its first new
            # message must continue at 3 rather than restarting at 1.
            _run_simulator(
                "run",
                "--device",
                "WX-SYD-001",
                "--messages",
                "1",
                "--interval",
                "0.05",
                "--seed",
                "20260902",
                "--state-dir",
                str(state_dir),
            )
            telemetry.wait_for_count(7)
            validated = _validate_telemetry(settings, telemetry.messages[:7])

            per_device: dict[str, list[int]] = {device_id: [] for device_id in DEVICE_PROFILES}
            message_ids = set()
            for payload in validated:
                per_device[payload.deviceId].append(payload.sequenceNumber)
                message_ids.add(payload.messageId)

            assert per_device["WX-SYD-001"] == [1, 2, 3]
            assert per_device["WX-MEL-001"] == [1, 2]
            assert per_device["WX-BNE-001"] == [1, 2]
            assert len(message_ids) == len(validated)

            stored_sydney = json.loads(
                (state_dir / "WX-SYD-001.json").read_text(encoding="utf-8"),
            )
            assert stored_sydney["lastSequenceNumber"] == 3

            _verify_retained_offline(settings)

            sample = validated[0].model_dump(mode="json")
            print("MQTT integration verification passed")
            print(f"devices={','.join(sorted(per_device))}")
            print(f"telemetry_messages={len(validated)}")
            print("sequences=" + json.dumps(per_device, separators=(",", ":")))
            print("retained_status=offline for all devices")
            print("sample_payload=" + json.dumps(sample, separators=(",", ":")))
    finally:
        telemetry.stop()


def main() -> int:
    try:
        verify()
    except Exception as exc:
        print(f"MQTT integration verification failed: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
