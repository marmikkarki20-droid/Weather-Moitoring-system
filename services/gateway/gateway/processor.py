from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass

from pydantic import ValidationError

from gateway.buffer import BufferFullError, SQLiteBuffer
from gateway.config import GatewaySettings
from gateway.models import DeliveryStatus, GatewayTelemetry, Telemetry, utc_now_iso
from gateway.payload_client import PayloadIngestClient

logger = logging.getLogger(__name__)


class GatewayAuthenticationError(RuntimeError):
    pass


@dataclass(frozen=True)
class ProcessingResult:
    status: str


class TelemetryProcessor:
    def __init__(self, settings: GatewaySettings, client: PayloadIngestClient, buffer: SQLiteBuffer) -> None:
        self.settings = settings
        self.client = client
        self.buffer = buffer
        self._topic_pattern = re.compile(
            rf'^{re.escape(settings.mqtt_topic_root)}/devices/(WX-[A-Z]{{3}}-001)/telemetry$'
        )

    def process(self, topic: str, raw_payload: bytes) -> ProcessingResult:
        match = self._topic_pattern.fullmatch(topic)
        if not match:
            logger.warning('telemetry_rejected reason=invalid_topic topic=%s', topic)
            return ProcessingResult('invalid_topic')
        try:
            raw = json.loads(raw_payload)
            telemetry = Telemetry.model_validate(raw)
        except (json.JSONDecodeError, ValidationError):
            logger.warning('telemetry_rejected reason=invalid_payload topic=%s', topic)
            return ProcessingResult('invalid_payload')
        if telemetry.deviceId != match.group(1):
            logger.warning(
                'telemetry_rejected reason=topic_device_mismatch topic_device=%s payload_device=%s',
                match.group(1),
                telemetry.deviceId,
            )
            return ProcessingResult('topic_device_mismatch')

        enriched = GatewayTelemetry(**telemetry.model_dump(), gatewayTimestamp=utc_now_iso())
        return self._deliver_or_buffer(enriched)

    def _deliver_or_buffer(self, telemetry: GatewayTelemetry) -> ProcessingResult:
        result = self.client.deliver(telemetry)
        if result.status in {DeliveryStatus.ACCEPTED, DeliveryStatus.ALREADY_PROCESSED}:
            logger.info(
                'delivery=%s device=%s sequence=%d message_id=%s',
                result.status,
                telemetry.deviceId,
                telemetry.sequenceNumber,
                telemetry.messageId,
            )
            return ProcessingResult(result.status)
        if result.status == DeliveryStatus.AUTH_FAILURE:
            raise GatewayAuthenticationError('Payload rejected the configured gateway credential')
        if result.status == DeliveryStatus.PERMANENT:
            logger.warning(
                'delivery=permanent_rejection device=%s sequence=%d http_status=%s',
                telemetry.deviceId,
                telemetry.sequenceNumber,
                result.http_status,
            )
            return ProcessingResult('permanent_rejection')
        try:
            was_added = self.buffer.enqueue(telemetry)
        except BufferFullError:
            logger.critical(
                'gateway_buffer_full device=%s sequence=%d message_id=%s',
                telemetry.deviceId,
                telemetry.sequenceNumber,
                telemetry.messageId,
            )
            return ProcessingResult('buffer_full')
        return ProcessingResult('buffered' if was_added else 'already_buffered')

    def flush_due(self) -> int:
        flushed = 0
        while item := self.buffer.due_oldest():
            result = self.client.deliver(item.telemetry)
            if result.status in {DeliveryStatus.ACCEPTED, DeliveryStatus.ALREADY_PROCESSED}:
                self.buffer.remove(item.id)
                flushed += 1
                continue
            if result.status == DeliveryStatus.AUTH_FAILURE:
                raise GatewayAuthenticationError('Payload rejected the configured gateway credential')
            if result.status == DeliveryStatus.PERMANENT:
                logger.error('buffer_record_permanently_rejected id=%d action=discard', item.id)
                self.buffer.remove(item.id)
                continue
            self.buffer.schedule_retry(
                item.id,
                item.attempt_count,
                self.settings.gateway_retry_min_seconds,
                self.settings.gateway_retry_max_seconds,
                'temporary_failure',
            )
            break
        return flushed
