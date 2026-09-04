from __future__ import annotations

import random

import pytest

from simulator.config import DEVICE_PROFILES
from simulator.generator import WeatherGenerator


@pytest.mark.parametrize("profile", DEVICE_PROFILES.values(), ids=lambda profile: profile.location_code)
def test_weather_values_stay_inside_payload_ranges(profile) -> None:  # noqa: ANN001
    generator = WeatherGenerator(profile, rng=random.Random(20260902))

    for _ in range(5_000):
        reading = generator.next_reading()
        assert -60 <= reading["temperature"] <= 70
        assert 0 <= reading["humidity"] <= 100
        assert 800 <= reading["pressure"] <= 1200
        assert 0 <= reading["rainfall"] <= profile.rainfall_bounds.max_value
        assert 0 <= reading["windSpeed"] <= profile.wind_speed_bounds.max_value
        assert 0 <= reading["battery"] <= 100


def test_random_walk_steps_are_bounded_and_battery_only_declines() -> None:
    generator = WeatherGenerator(DEVICE_PROFILES["WX-SYD-001"], rng=random.Random(42))

    previous = generator.state.__dict__.copy()
    for _ in range(500):
        generator.next_reading()
        current = generator.state.__dict__.copy()
        assert abs(current["temperature"] - previous["temperature"]) <= generator.TEMPERATURE_MAX_STEP + 1e-9
        assert abs(current["humidity"] - previous["humidity"]) <= generator.HUMIDITY_MAX_STEP + 1e-9
        assert abs(current["pressure"] - previous["pressure"]) <= generator.PRESSURE_MAX_STEP + 1e-9
        assert abs(current["wind_speed"] - previous["wind_speed"]) <= generator.WIND_MAX_STEP + 1e-9
        assert 0 <= previous["battery"] - current["battery"] <= generator.BATTERY_MAX_DROP + 1e-9
        previous = current


def test_rain_is_normally_zero_and_battery_gradually_falls() -> None:
    generator = WeatherGenerator(DEVICE_PROFILES["WX-MEL-001"], rng=random.Random(7))
    readings = [generator.next_reading() for _ in range(200)]

    assert sum(reading["rainfall"] == 0 for reading in readings) > 100
    assert readings[-1]["battery"] < readings[0]["battery"]
