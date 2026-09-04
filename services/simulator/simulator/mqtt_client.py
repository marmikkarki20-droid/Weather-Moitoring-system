"""Reliable paho MQTT wrapper for one simulated WeatherGrid device."""

from __future__ import annotations

import logging
import threading
from typing import Callable, Literal

import paho.mqtt.client as mqtt

from simulator.config import MQTTSettings
from simulator.models import CommandAcknowledgement, SimulationCommand, StatusMessage, TelemetryMessage, utc_now_iso

logger = logging.getLogger(__name__)

TELEMETRY_QOS = 1
STATUS_QOS = 1
_MIN_RECONNECT_DELAY_SECONDS = 1
_MAX_RECONNECT_DELAY_SECONDS = 30


class DeviceMQTTClient:
    def __init__(self, device_id: str, mqtt_client_id: str, settings: MQTTSettings) -> None:
        self.device_id = device_id
        self.settings = settings
        self._connected_event = threading.Event()
        self._loop_started = False
        self.command_callback: Callable[[SimulationCommand], None] | None = None

        settings.require_valid_credentials()

        self._client = mqtt.Client(
            client_id=mqtt_client_id,
            protocol=mqtt.MQTTv311,
            callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
        )
        if settings.username:
            self._client.username_pw_set(
                username=settings.username,
                password=settings.password.get_secret_value(),
            )

        self._client.reconnect_delay_set(
            min_delay=_MIN_RECONNECT_DELAY_SECONDS,
            max_delay=_MAX_RECONNECT_DELAY_SECONDS,
        )
        offline_status = StatusMessage(
            deviceId=device_id,
            status="offline",
            timestamp=utc_now_iso(),
        )
        self._client.will_set(
            settings.status_topic(device_id),
            offline_status.to_json_bytes(),
            qos=STATUS_QOS,
            retain=True,
        )

        self._client.on_connect = self._on_connect
        self._client.on_disconnect = self._on_disconnect
        self._client.on_publish = self._on_publish
        self._client.on_message = self._on_message

    def _on_connect(self, client, userdata, flags, reason_code, properties=None) -> None:  # noqa: ANN001
        if reason_code == 0:
            self._connected_event.set()
            logger.info(
                "device=%s connection_status=connected broker=%s:%s",
                self.device_id,
                self.settings.host,
                self.settings.port,
            )
            # Never block the paho network callback waiting for its own PUBACK.
            self.publish_status("online", wait_for_ack=False)
            client.subscribe(self.settings.command_topic(self.device_id), qos=1)
        else:
            logger.warning(
                "device=%s connection_status=rejected reason_code=%s",
                self.device_id,
                reason_code,
            )

    def _on_disconnect(
        self,
        client,
        userdata,
        disconnect_flags,
        reason_code,
        properties=None,
    ) -> None:  # noqa: ANN001
        self._connected_event.clear()
        if reason_code == 0:
            logger.info("device=%s connection_status=disconnected", self.device_id)
        else:
            logger.warning(
                "device=%s connection_status=lost reason_code=%s retry=automatic backoff=%d..%ds",
                self.device_id,
                reason_code,
                _MIN_RECONNECT_DELAY_SECONDS,
                _MAX_RECONNECT_DELAY_SECONDS,
            )

    def _on_publish(self, client, userdata, mid, reason_code, properties=None) -> None:  # noqa: ANN001
        logger.debug("device=%s publish_ack_mid=%s result=%s", self.device_id, mid, reason_code)

    def _on_message(self, client, userdata, message) -> None:  # noqa: ANN001
        if message.topic != self.settings.command_topic(self.device_id) or not self.command_callback:
            return
        try:
            command = SimulationCommand.model_validate_json(bytes(message.payload))
            if command.deviceId == self.device_id:
                self.command_callback(command)
        except Exception:
            logger.warning("device=%s command_rejected reason=invalid_payload", self.device_id)

    def connect(
        self,
        stop_event: threading.Event | None = None,
        connection_timeout_seconds: float = 5.0,
    ) -> None:
        """Connect with bounded initial retry; paho handles later reconnects."""
        stop_event = stop_event or threading.Event()
        delay = _MIN_RECONNECT_DELAY_SECONDS
        attempt = 1

        while not stop_event.is_set():
            logger.info(
                "device=%s connection_status=connecting broker=%s:%s attempt=%d",
                self.device_id,
                self.settings.host,
                self.settings.port,
                attempt,
            )
            try:
                self._client.connect(
                    self.settings.host,
                    self.settings.port,
                    keepalive=self.settings.keepalive_seconds,
                )
                self._client.loop_start()
                self._loop_started = True
                if self._connected_event.wait(connection_timeout_seconds):
                    return
                raise TimeoutError("broker did not acknowledge the MQTT connection")
            except (OSError, TimeoutError, mqtt.WebsocketConnectionError) as exc:
                if self._loop_started:
                    self._client.disconnect()
                    self._client.loop_stop()
                    self._loop_started = False
                logger.warning(
                    "device=%s connection_status=retrying attempt=%d retry_in_seconds=%d error=%s",
                    self.device_id,
                    attempt,
                    delay,
                    type(exc).__name__,
                )
                if stop_event.wait(delay):
                    break
                delay = min(delay * 2, _MAX_RECONNECT_DELAY_SECONDS)
                attempt += 1

        raise InterruptedError(f"device={self.device_id} stopped before connecting")

    def wait_until_connected(
        self,
        stop_event: threading.Event,
        poll_seconds: float = 1.0,
    ) -> bool:
        retry_count = 0
        while not stop_event.is_set():
            if self._connected_event.wait(poll_seconds):
                return True
            retry_count += 1
            logger.info(
                "device=%s connection_status=waiting_for_reconnect retry=%d",
                self.device_id,
                retry_count,
            )
        return False

    def publish_telemetry(self, message: TelemetryMessage) -> None:
        # Revalidate at the publication boundary, including if a caller built
        # the model via an unsafe Pydantic construction API.
        validated = TelemetryMessage.model_validate(message.model_dump())
        topic = self.settings.telemetry_topic(self.device_id)
        result = self._client.publish(
            topic,
            payload=validated.to_json_bytes(),
            qos=TELEMETRY_QOS,
            retain=False,
        )
        if result.rc != mqtt.MQTT_ERR_SUCCESS:
            raise RuntimeError(f"MQTT publish failed with result code {result.rc}")
        result.wait_for_publish(timeout=5)
        if not result.is_published():
            raise TimeoutError("telemetry publication was not acknowledged")
        logger.info(
            "device=%s topic=%s sequence=%d publication_result=acknowledged",
            self.device_id,
            topic,
            validated.sequenceNumber,
        )

    def publish_status(
        self,
        status: Literal["online", "offline"],
        *,
        wait_for_ack: bool = True,
    ) -> None:
        message = StatusMessage(deviceId=self.device_id, status=status, timestamp=utc_now_iso())
        topic = self.settings.status_topic(self.device_id)
        result = self._client.publish(
            topic,
            payload=message.to_json_bytes(),
            qos=STATUS_QOS,
            retain=True,
        )
        if result.rc != mqtt.MQTT_ERR_SUCCESS:
            logger.error(
                "device=%s topic=%s status=%s publication_result=error(%s)",
                self.device_id,
                topic,
                status,
                result.rc,
            )
            if wait_for_ack:
                raise RuntimeError(f"MQTT status publish failed with result code {result.rc}")
            return
        if wait_for_ack:
            result.wait_for_publish(timeout=5)
            if not result.is_published():
                raise TimeoutError("status publication was not acknowledged")
        logger.info(
            "device=%s topic=%s status=%s publication_result=%s",
            self.device_id,
            topic,
            status,
            "queued" if not wait_for_ack else "acknowledged",
        )

    def publish_acknowledgement(self, acknowledgement: CommandAcknowledgement) -> None:
        result = self._client.publish(self.settings.acknowledgement_topic(self.device_id), acknowledgement.to_json_bytes(), qos=1, retain=False)
        if result.rc != mqtt.MQTT_ERR_SUCCESS:
            raise RuntimeError("MQTT acknowledgement publish failed")

    def disconnect_gracefully(self) -> None:
        """Retain offline status before sending a clean disconnect."""
        try:
            if self._connected_event.is_set():
                self.publish_status("offline")
        finally:
            self._client.disconnect()
            if self._loop_started:
                self._client.loop_stop()
                self._loop_started = False
            self._connected_event.clear()
            logger.info("device=%s connection_status=stopped", self.device_id)
