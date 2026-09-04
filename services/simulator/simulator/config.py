"""Environment and seeded-device configuration for WeatherGrid simulators."""

from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[3]
_ENV_FILE = REPO_ROOT / ".env"


class MQTTSettings(BaseSettings):
    """MQTT settings loaded from environment variables and the root `.env`.

    The password is represented as a ``SecretStr`` so accidental model
    logging or repr output cannot reveal it.
    """

    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE) if _ENV_FILE.exists() else None,
        env_file_encoding="utf-8",
        env_ignore_empty=True,
        extra="ignore",
    )

    host: str = Field(default="localhost", alias="MQTT_HOST", min_length=1)
    port: int = Field(default=1883, alias="MQTT_PORT", ge=1, le=65535)
    username: str = Field(default="", alias="MQTT_USERNAME")
    password: SecretStr = Field(default_factory=lambda: SecretStr(""), alias="MQTT_PASSWORD")
    topic_root: str = Field(default="weathergrid", alias="MQTT_TOPIC_ROOT", min_length=1)
    keepalive_seconds: int = Field(default=60, alias="MQTT_KEEPALIVE_SECONDS", ge=5, le=65535)
    log_level: Literal["CRITICAL", "ERROR", "WARNING", "INFO", "DEBUG"] = Field(
        default="INFO",
        alias="SIMULATOR_LOG_LEVEL",
    )

    @field_validator("topic_root")
    @classmethod
    def _validate_topic_root(cls, value: str) -> str:
        value = value.strip().strip("/")
        if not value or "+" in value or "#" in value:
            raise ValueError("MQTT_TOPIC_ROOT must be a non-empty topic prefix without wildcards")
        return value

    def require_valid_credentials(self) -> None:
        """Validate the credential pair without exposing the secret in errors."""
        if self.password.get_secret_value() and not self.username:
            raise ValueError("MQTT_USERNAME is required when MQTT_PASSWORD is set")

    def telemetry_topic(self, device_id: str) -> str:
        return f"{self.topic_root}/devices/{device_id}/telemetry"

    def status_topic(self, device_id: str) -> str:
        return f"{self.topic_root}/devices/{device_id}/status"

    def command_topic(self, device_id: str) -> str:
        return f"{self.topic_root}/devices/{device_id}/commands"

    def acknowledgement_topic(self, device_id: str) -> str:
        return f"{self.topic_root}/devices/{device_id}/acks"

    def wildcard_telemetry_topic(self) -> str:
        return f"{self.topic_root}/devices/+/telemetry"

    def wildcard_status_topic(self) -> str:
        return f"{self.topic_root}/devices/+/status"


class WeatherBounds(BaseModel):
    min_value: float
    max_value: float

    @model_validator(mode="after")
    def _ordered(self) -> "WeatherBounds":
        if self.min_value >= self.max_value:
            raise ValueError("minimum weather bound must be less than maximum")
        return self


class DeviceProfile(BaseModel):
    """Static configuration for one independently runnable seeded device."""

    device_id: str
    device_name: str
    location_code: str
    mqtt_client_id: str
    publishing_interval_seconds: float = Field(gt=0)

    starting_temperature: float
    starting_humidity: float
    starting_pressure: float
    starting_rainfall: float
    starting_wind_speed: float
    starting_battery: float

    temperature_bounds: WeatherBounds
    humidity_bounds: WeatherBounds
    pressure_bounds: WeatherBounds
    rainfall_bounds: WeatherBounds
    wind_speed_bounds: WeatherBounds
    battery_bounds: WeatherBounds

    @model_validator(mode="after")
    def _starting_values_are_bounded(self) -> "DeviceProfile":
        pairs = (
            (self.starting_temperature, self.temperature_bounds, "temperature"),
            (self.starting_humidity, self.humidity_bounds, "humidity"),
            (self.starting_pressure, self.pressure_bounds, "pressure"),
            (self.starting_rainfall, self.rainfall_bounds, "rainfall"),
            (self.starting_wind_speed, self.wind_speed_bounds, "wind speed"),
            (self.starting_battery, self.battery_bounds, "battery"),
        )
        for value, bounds, label in pairs:
            if not bounds.min_value <= value <= bounds.max_value:
                raise ValueError(f"starting {label} must be within its configured bounds")
        return self


def _profile(
    *,
    device_id: str,
    device_name: str,
    location_code: str,
    temperature: float,
    humidity: float,
    pressure: float,
    wind_speed: float,
) -> DeviceProfile:
    return DeviceProfile(
        device_id=device_id,
        device_name=device_name,
        location_code=location_code,
        mqtt_client_id=f"weathergrid-simulator-{device_id.lower()}",
        publishing_interval_seconds=10,
        starting_temperature=temperature,
        starting_humidity=humidity,
        starting_pressure=pressure,
        starting_rainfall=0,
        starting_wind_speed=wind_speed,
        starting_battery=100,
        # Payload validates temperature -60..70, humidity 0..100, pressure
        # 800..1200, rainfall/wind >=0, and battery 0..100. Finite local
        # upper bounds keep otherwise-open metrics reasonable.
        temperature_bounds=WeatherBounds(min_value=-60, max_value=70),
        humidity_bounds=WeatherBounds(min_value=0, max_value=100),
        pressure_bounds=WeatherBounds(min_value=800, max_value=1200),
        rainfall_bounds=WeatherBounds(min_value=0, max_value=500),
        wind_speed_bounds=WeatherBounds(min_value=0, max_value=250),
        battery_bounds=WeatherBounds(min_value=0, max_value=100),
    )


# These IDs exactly match `src/seed/index.ts` (`WX-{code}-001`).
DEVICE_PROFILES: dict[str, DeviceProfile] = {
    profile.device_id: profile
    for profile in (
        _profile(
            device_id="WX-SYD-001",
            device_name="Sydney Observatory Hill Weather Station",
            location_code="SYD",
            temperature=18.0,
            humidity=65.0,
            pressure=1015.0,
            wind_speed=12.0,
        ),
        _profile(
            device_id="WX-MEL-001",
            device_name="Melbourne CBD Weather Station",
            location_code="MEL",
            temperature=15.0,
            humidity=70.0,
            pressure=1013.0,
            wind_speed=18.0,
        ),
        _profile(
            device_id="WX-BNE-001",
            device_name="Brisbane City Weather Station",
            location_code="BNE",
            temperature=24.0,
            humidity=60.0,
            pressure=1011.0,
            wind_speed=10.0,
        ),
    )
}


def get_device_profile(device_id: str) -> DeviceProfile:
    try:
        return DEVICE_PROFILES[device_id]
    except KeyError as exc:
        available = ", ".join(sorted(DEVICE_PROFILES))
        raise ValueError(f"Unknown device id {device_id!r}. Available: {available}") from exc


def get_mqtt_settings() -> MQTTSettings:
    settings = MQTTSettings()
    settings.require_valid_credentials()
    return settings


# Generated, non-sensitive state lives outside the source package.
DEFAULT_STATE_DIR = REPO_ROOT / "services" / "simulator" / "state"
