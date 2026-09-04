from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[3]


class GatewaySettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=REPO_ROOT / '.env',
        env_file_encoding='utf-8',
        env_ignore_empty=True,
        extra='ignore',
    )

    mqtt_host: str = Field(default='localhost', alias='MQTT_HOST', min_length=1)
    mqtt_port: int = Field(default=1883, alias='MQTT_PORT', ge=1, le=65535)
    mqtt_username: str = Field(default='', alias='MQTT_USERNAME')
    mqtt_password: SecretStr = Field(default_factory=lambda: SecretStr(''), alias='MQTT_PASSWORD')
    mqtt_topic_root: str = Field(default='weathergrid', alias='MQTT_TOPIC_ROOT')
    mqtt_keepalive_seconds: int = Field(default=60, alias='MQTT_KEEPALIVE_SECONDS', ge=5)

    payload_ingest_url: str = Field(alias='PAYLOAD_INGEST_URL', min_length=1)
    payload_acknowledgement_url: str = Field(default='http://localhost:3000/api/simulation/acknowledgements', alias='PAYLOAD_ACKNOWLEDGEMENT_URL')
    gateway_api_key: SecretStr = Field(alias='GATEWAY_API_KEY')
    gateway_buffer_path: Path = Field(default=REPO_ROOT / 'runtime' / 'gateway-buffer.sqlite3', alias='GATEWAY_BUFFER_PATH')
    gateway_buffer_max_messages: int = Field(default=10_000, alias='GATEWAY_BUFFER_MAX_MESSAGES', ge=1)
    gateway_http_timeout_seconds: float = Field(default=10, alias='GATEWAY_HTTP_TIMEOUT_SECONDS', gt=0)
    gateway_retry_min_seconds: float = Field(default=1, alias='GATEWAY_RETRY_MIN_SECONDS', gt=0)
    gateway_retry_max_seconds: float = Field(default=60, alias='GATEWAY_RETRY_MAX_SECONDS', gt=0)
    gateway_log_level: Literal['CRITICAL', 'ERROR', 'WARNING', 'INFO', 'DEBUG'] = Field(default='INFO', alias='GATEWAY_LOG_LEVEL')

    @field_validator('mqtt_topic_root')
    @classmethod
    def valid_topic_root(cls, value: str) -> str:
        value = value.strip().strip('/')
        if not value or '+' in value or '#' in value:
            raise ValueError('MQTT_TOPIC_ROOT must be a non-empty topic prefix without wildcards')
        return value

    @field_validator('gateway_api_key')
    @classmethod
    def api_key_required(cls, value: SecretStr) -> SecretStr:
        if not value.get_secret_value():
            raise ValueError('GATEWAY_API_KEY is required')
        return value

    @field_validator('gateway_retry_max_seconds')
    @classmethod
    def retry_max_not_small(cls, value: float, info) -> float:  # noqa: ANN001
        minimum = info.data.get('gateway_retry_min_seconds')
        if minimum is not None and value < minimum:
            raise ValueError('GATEWAY_RETRY_MAX_SECONDS must be at least GATEWAY_RETRY_MIN_SECONDS')
        return value

    def telemetry_topic(self) -> str:
        return f'{self.mqtt_topic_root}/devices/+/telemetry'
