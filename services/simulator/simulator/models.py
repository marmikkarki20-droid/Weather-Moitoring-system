"""Validated JSON contracts published by simulated WeatherGrid devices."""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

SCHEMA_VERSION = 1
_UTC_MILLISECOND_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")


def format_utc_iso(moment: datetime) -> str:
    """Return an ISO-8601 UTC timestamp with millisecond precision."""
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    else:
        moment = moment.astimezone(timezone.utc)
    return moment.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def utc_now_iso() -> str:
    return format_utc_iso(datetime.now(timezone.utc))


def _validate_utc_timestamp(value: str) -> str:
    if not _UTC_MILLISECOND_PATTERN.fullmatch(value):
        raise ValueError("timestamp must be UTC ISO-8601 with milliseconds and a trailing 'Z'")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.utcoffset() != timezone.utc.utcoffset(parsed):
        raise ValueError("timestamp must use UTC")
    return value


class TelemetryMessage(BaseModel):
    """One QoS 1, non-retained telemetry sample."""

    model_config = ConfigDict(extra="forbid")

    schemaVersion: Literal[1] = SCHEMA_VERSION
    messageId: UUID
    deviceId: str = Field(min_length=1)
    locationCode: str = Field(pattern=r"^[A-Z]{3}$")
    sequenceNumber: int = Field(strict=True, ge=1)
    temperature: float = Field(ge=-60, le=70)
    humidity: float = Field(ge=0, le=100)
    pressure: float = Field(ge=800, le=1200)
    rainfall: float = Field(ge=0)
    windSpeed: float = Field(ge=0)
    battery: float = Field(ge=0, le=100)
    deviceTimestamp: str

    _timestamp_is_utc = field_validator("deviceTimestamp")(_validate_utc_timestamp)

    def to_json_bytes(self) -> bytes:
        return self.model_dump_json().encode("utf-8")


DeviceStatus = Literal["online", "offline"]


class StatusMessage(BaseModel):
    """Retained device connectivity status."""

    model_config = ConfigDict(extra="forbid")

    deviceId: str = Field(min_length=1)
    status: DeviceStatus
    timestamp: str

    _timestamp_is_utc = field_validator("timestamp")(_validate_utc_timestamp)

    def to_json_bytes(self) -> bytes:
        return self.model_dump_json().encode("utf-8")


CommandType = Literal["high-temperature", "high-humidity", "abnormal-pressure", "low-battery", "high-latency", "pause-telemetry", "duplicate-message", "delayed-message", "out-of-order-message", "invalid-payload", "disconnect-mqtt", "reset-normal"]
AcknowledgementStatus = Literal["acknowledged", "running", "completed", "failed", "expired", "cancelled"]

class SimulationCommand(BaseModel):
    model_config = ConfigDict(extra="forbid")
    schemaVersion: Literal[1]
    commandId: UUID
    deviceId: str = Field(pattern=r"^WX-[A-Z]{3}-001$")
    commandType: CommandType
    durationSeconds: int | None = Field(default=None, ge=1, le=600)
    parameters: dict[str, Any] = Field(default_factory=dict)
    issuedAt: str
    expiresAt: str
    _issued = field_validator("issuedAt")(_validate_utc_timestamp)
    _expires = field_validator("expiresAt")(_validate_utc_timestamp)

class CommandAcknowledgement(BaseModel):
    model_config = ConfigDict(extra="forbid")
    schemaVersion: Literal[1] = SCHEMA_VERSION
    commandId: UUID
    deviceId: str = Field(pattern=r"^WX-[A-Z]{3}-001$")
    status: AcknowledgementStatus
    message: str = Field(max_length=300)
    timestamp: str
    _timestamp = field_validator("timestamp")(_validate_utc_timestamp)
    def to_json_bytes(self) -> bytes:
        return self.model_dump_json().encode("utf-8")
