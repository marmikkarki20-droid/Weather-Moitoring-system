from __future__ import annotations

import logging

import httpx

from gateway.config import GatewaySettings
from gateway.models import DeliveryResult, DeliveryStatus, GatewayTelemetry, SimulationAcknowledgement

logger = logging.getLogger(__name__)


class PayloadIngestClient:
    def __init__(self, settings: GatewaySettings, client: httpx.Client | None = None) -> None:
        self.settings = settings
        self._client = client or httpx.Client(timeout=settings.gateway_http_timeout_seconds)

    def close(self) -> None:
        self._client.close()

    def deliver(self, telemetry: GatewayTelemetry) -> DeliveryResult:
        try:
            response = self._client.post(
                self.settings.payload_ingest_url,
                headers={
                    'Authorization': f'service-accounts API-Key {self.settings.gateway_api_key.get_secret_value()}',
                    'Content-Type': 'application/json',
                },
                json=telemetry.model_dump(mode='json'),
            )
        except (httpx.ConnectError, httpx.TimeoutException, httpx.NetworkError) as exc:
            logger.warning('delivery=retryable network_error=%s', type(exc).__name__)
            return DeliveryResult(status=DeliveryStatus.RETRYABLE)

        try:
            body = response.json()
        except ValueError:
            body = {}

        if response.status_code in (200, 201) and body.get('status') in {
            DeliveryStatus.ACCEPTED,
            DeliveryStatus.ALREADY_PROCESSED,
        }:
            return DeliveryResult(status=body['status'], http_status=response.status_code)
        if response.status_code in (401, 403):
            return DeliveryResult(status=DeliveryStatus.AUTH_FAILURE, http_status=response.status_code)
        if response.status_code == 429 or 500 <= response.status_code <= 599:
            return DeliveryResult(status=DeliveryStatus.RETRYABLE, http_status=response.status_code)
        return DeliveryResult(status=DeliveryStatus.PERMANENT, http_status=response.status_code)

    def deliver_acknowledgement(self, acknowledgement: SimulationAcknowledgement) -> DeliveryResult:
        try:
            response = self._client.post(self.settings.payload_acknowledgement_url, headers={'Authorization': f'service-accounts API-Key {self.settings.gateway_api_key.get_secret_value()}', 'Content-Type': 'application/json'}, json=acknowledgement.model_dump(mode='json'))
        except (httpx.ConnectError, httpx.TimeoutException, httpx.NetworkError):
            return DeliveryResult(status=DeliveryStatus.RETRYABLE)
        if response.status_code in (200, 201): return DeliveryResult(status=DeliveryStatus.ACCEPTED, http_status=response.status_code)
        if response.status_code in (401, 403): return DeliveryResult(status=DeliveryStatus.AUTH_FAILURE, http_status=response.status_code)
        if response.status_code == 429 or response.status_code >= 500: return DeliveryResult(status=DeliveryStatus.RETRYABLE, http_status=response.status_code)
        return DeliveryResult(status=DeliveryStatus.PERMANENT, http_status=response.status_code)
