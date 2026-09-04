from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

_UTC_MILLISECONDS = re.compile(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$')


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def _utc_timestamp(value: str) -> str:
    if not _UTC_MILLISECONDS.fullmatch(value):
        raise ValueError('timestamp must be UTC ISO-8601 with milliseconds and Z')
    datetime.fromisoformat(value.replace('Z', '+00:00'))
    return value


class Telemetry(BaseModel):
    model_config = ConfigDict(extra='forbid')

    schemaVersion: Literal[1]
    messageId: UUID
    deviceId: str = Field(pattern=r'^WX-[A-Z]{3}-001$')
    locationCode: str = Field(pattern=r'^[A-Z]{3}$')
    sequenceNumber: int = Field(strict=True, ge=1)
    temperature: float = Field(ge=-60, le=70)
    humidity: float = Field(ge=0, le=100)
    pressure: float = Field(ge=800, le=1200)
    rainfall: float = Field(ge=0)
    windSpeed: float = Field(ge=0)
    battery: float = Field(ge=0, le=100)
    deviceTimestamp: str

    _valid_timestamp = field_validator('deviceTimestamp')(_utc_timestamp)


class GatewayTelemetry(Telemetry):
    gatewayTimestamp: str

    _valid_gateway_timestamp = field_validator('gatewayTimestamp')(_utc_timestamp)


class DeliveryStatus(str):
    ACCEPTED = 'accepted'
    ALREADY_PROCESSED = 'already_processed'
    RETRYABLE = 'retryable'
    PERMANENT = 'permanent'
    AUTH_FAILURE = 'auth_failure'


class DeliveryResult(BaseModel):
    status: str
    http_status: int | None = None


class SimulationAcknowledgement(BaseModel):
    model_config = ConfigDict(extra='forbid')
    schemaVersion: Literal[1]
    commandId: UUID
    deviceId: str = Field(pattern=r'^WX-[A-Z]{3}-001$')
    status: Literal['acknowledged', 'running', 'completed', 'failed', 'expired', 'cancelled']
    message: str = Field(max_length=300)
    timestamp: str

    _valid_timestamp = field_validator('timestamp')(_utc_timestamp)
