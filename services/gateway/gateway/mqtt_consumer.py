from __future__ import annotations

import logging
import threading
import json

import paho.mqtt.client as mqtt

from gateway.config import GatewaySettings
from gateway.processor import GatewayAuthenticationError, TelemetryProcessor
from gateway.models import DeliveryStatus, SimulationAcknowledgement

logger = logging.getLogger(__name__)


class MQTTConsumer:
    def __init__(self, settings: GatewaySettings, processor: TelemetryProcessor) -> None:
        self.settings = settings
        self.processor = processor
        self.stop_event = threading.Event()
        self.unhealthy_error: GatewayAuthenticationError | None = None
        self.client = mqtt.Client(
            client_id='weathergrid-edge-gateway',
            protocol=mqtt.MQTTv311,
            callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
        )
        if settings.mqtt_username:
            self.client.username_pw_set(settings.mqtt_username, settings.mqtt_password.get_secret_value())
        self.client.reconnect_delay_set(min_delay=1, max_delay=30)
        self.client.on_connect = self._on_connect
        self.client.on_disconnect = self._on_disconnect
        self.client.on_message = self._on_message

    def _on_connect(self, client, userdata, flags, reason_code, properties=None) -> None:  # noqa: ANN001
        if reason_code != 0:
            logger.error('mqtt_connection=rejected reason=%s', reason_code)
            return
        client.subscribe(self.settings.telemetry_topic(), qos=1)
        client.subscribe(f'{self.settings.mqtt_topic_root}/devices/+/acks', qos=1)
        logger.info('mqtt_connection=connected topic=%s qos=1', self.settings.telemetry_topic())

    def _on_disconnect(self, client, userdata, disconnect_flags, reason_code, properties=None) -> None:  # noqa: ANN001
        if reason_code == 0:
            logger.info('mqtt_connection=stopped')
        else:
            logger.warning('mqtt_connection=lost reason=%s reconnect=automatic', reason_code)

    def _on_message(self, client, userdata, message) -> None:  # noqa: ANN001
        try:
            if message.topic.endswith('/acks'):
                acknowledgement = SimulationAcknowledgement.model_validate(json.loads(bytes(message.payload)))
                result = self.processor.client.deliver_acknowledgement(acknowledgement)
                if result.status == DeliveryStatus.AUTH_FAILURE:
                    raise GatewayAuthenticationError('Payload rejected gateway credential')
                if result.status == DeliveryStatus.RETRYABLE:
                    logger.warning('simulation_acknowledgement=retry_needed command_id=%s', acknowledgement.commandId)
                return
            self.processor.process(message.topic, bytes(message.payload))
            self.processor.flush_due()
        except GatewayAuthenticationError as exc:
            self.unhealthy_error = exc
            self.stop_event.set()
            logger.critical('gateway_unhealthy reason=payload_authentication_failed')
        except Exception:
            logger.exception('gateway_message_processing_failed topic=%s', message.topic)

    def run(self) -> None:
        self.client.connect_async(self.settings.mqtt_host, self.settings.mqtt_port, self.settings.mqtt_keepalive_seconds)
        self.client.loop_start()
        try:
            while not self.stop_event.wait(1):
                self.processor.flush_due()
        finally:
            self.client.disconnect()
            self.client.loop_stop()
        if self.unhealthy_error:
            raise self.unhealthy_error
