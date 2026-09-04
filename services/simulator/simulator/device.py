"""Lifecycle for one independent simulated weather device."""

from __future__ import annotations

import logging
import random
import threading
from datetime import datetime
from pathlib import Path
from uuid import UUID, uuid4

from simulator.config import DeviceProfile, MQTTSettings
from simulator.generator import WeatherGenerator, WeatherValues
from simulator.models import StatusMessage, TelemetryMessage, format_utc_iso, utc_now_iso
from simulator.mqtt_client import DeviceMQTTClient
from simulator.scenarios import ScenarioController
from simulator.state import SequenceState

logger = logging.getLogger(__name__)


def create_telemetry_message(
    profile: DeviceProfile,
    sequence_number: int,
    values: WeatherValues,
    *,
    timestamp: datetime | None = None,
    message_id: UUID | None = None,
) -> TelemetryMessage:
    """Construct and validate telemetry before it reaches the MQTT client."""
    return TelemetryMessage(
        schemaVersion=1,
        messageId=message_id or uuid4(),
        deviceId=profile.device_id,
        locationCode=profile.location_code,
        sequenceNumber=sequence_number,
        deviceTimestamp=format_utc_iso(timestamp) if timestamp else utc_now_iso(),
        **values,
    )


def create_status_message(device_id: str, status: str) -> StatusMessage:
    """Construct and validate a status message (also useful to contract tests)."""
    return StatusMessage(deviceId=device_id, status=status, timestamp=utc_now_iso())


class SimulatedDevice:
    def __init__(
        self,
        profile: DeviceProfile,
        settings: MQTTSettings,
        state_dir: Path,
        *,
        rng: random.Random | None = None,
        mqtt_client: DeviceMQTTClient | None = None,
    ) -> None:
        self.profile = profile
        self.generator = WeatherGenerator(profile, rng=rng)
        self.sequence_state = SequenceState(profile.device_id, state_dir)
        self.mqtt = mqtt_client or DeviceMQTTClient(
            profile.device_id,
            profile.mqtt_client_id,
            settings,
        )
        self.scenarios = ScenarioController(profile.device_id)
        self._pause_until: datetime | None = None
        self.mqtt.command_callback = self.receive_command

    def receive_command(self, command) -> None:  # noqa: ANN001
        """Called on Paho's network thread; it only changes bounded local state."""
        for acknowledgement in self.scenarios.receive(command):
            self.mqtt.publish_acknowledgement(acknowledgement)
        active = self.scenarios.active
        if not active:
            self._pause_until = None
            return
        params = active.parameters
        if active.commandType == "high-temperature": self.generator.state.temperature = float(params["targetTemperature"])
        elif active.commandType == "high-humidity": self.generator.state.humidity = float(params["targetHumidity"])
        elif active.commandType == "abnormal-pressure": self.generator.state.pressure = float(params["targetPressure"])
        elif active.commandType == "low-battery": self.generator.state.battery = float(params["targetBattery"])
        elif active.commandType == "pause-telemetry": self._pause_until = self.scenarios.ends_at
        elif active.commandType == "disconnect-mqtt":
            self.mqtt._client.disconnect()  # controlled local test disconnect; Paho reconnects automatically

    def build_next_message(self) -> TelemetryMessage:
        values = self.generator.next_reading()
        sequence = self.sequence_state.next_sequence_number()
        return create_telemetry_message(self.profile, sequence, values)

    def run(
        self,
        *,
        max_messages: int | None = None,
        stop_event: threading.Event | None = None,
    ) -> int:
        """Publish until stopped or until ``max_messages`` is reached."""
        if max_messages is not None and max_messages < 1:
            raise ValueError("max_messages must be at least 1")

        stop_event = stop_event or threading.Event()
        published = 0
        try:
            self.mqtt.connect(stop_event=stop_event)
            while not stop_event.is_set():
                completion = self.scenarios.complete_if_due()
                if completion: self.mqtt.publish_acknowledgement(completion)
                if self._pause_until and datetime.now(self._pause_until.tzinfo) < self._pause_until:
                    stop_event.wait(min(self.profile.publishing_interval_seconds, 1))
                    continue
                self._pause_until = None
                message = self.build_next_message()
                while not stop_event.is_set():
                    if not self.mqtt.wait_until_connected(stop_event):
                        break
                    try:
                        self.mqtt.publish_telemetry(message)
                        break
                    except (RuntimeError, TimeoutError) as exc:
                        # A broker outage can race with the connection check.
                        # Keep the same validated ID/sequence and let Paho's
                        # network loop reconnect before retrying publication.
                        logger.warning(
                            "device=%s topic=%s sequence=%d publication_result=retry error=%s",
                            self.profile.device_id,
                            self.mqtt.settings.telemetry_topic(self.profile.device_id),
                            message.sequenceNumber,
                            type(exc).__name__,
                        )
                        stop_event.wait(1)

                if stop_event.is_set():
                    break
                published += 1

                if max_messages is not None and published >= max_messages:
                    break
                stop_event.wait(self.profile.publishing_interval_seconds)
        finally:
            self.mqtt.disconnect_gracefully()

        logger.info(
            "device=%s lifecycle=finished messages_published=%d",
            self.profile.device_id,
            published,
        )
        return published
