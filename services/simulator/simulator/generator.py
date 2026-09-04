"""Slowly changing, range-bounded weather generation independent of MQTT."""

from __future__ import annotations

import random
from dataclasses import dataclass
from typing import TypedDict

from simulator.config import DeviceProfile


class WeatherValues(TypedDict):
    temperature: float
    humidity: float
    pressure: float
    rainfall: float
    windSpeed: float
    battery: float


@dataclass
class WeatherState:
    temperature: float
    humidity: float
    pressure: float
    rainfall: float
    wind_speed: float
    battery: float


def initial_state(profile: DeviceProfile) -> WeatherState:
    return WeatherState(
        temperature=profile.starting_temperature,
        humidity=profile.starting_humidity,
        pressure=profile.starting_pressure,
        rainfall=profile.starting_rainfall,
        wind_speed=profile.starting_wind_speed,
        battery=profile.starting_battery,
    )


def _bounded_walk(
    rng: random.Random,
    current: float,
    step: float,
    min_value: float,
    max_value: float,
) -> float:
    return min(max(current + rng.uniform(-step, step), min_value), max_value)


class WeatherGenerator:
    """Generate plausible samples using deterministic-in-tests random walks."""

    TEMPERATURE_MAX_STEP = 0.3
    HUMIDITY_MAX_STEP = 1.5
    PRESSURE_MAX_STEP = 0.5
    WIND_MAX_STEP = 1.0
    BATTERY_MIN_DROP = 0.01
    BATTERY_MAX_DROP = 0.05

    def __init__(self, profile: DeviceProfile, rng: random.Random | None = None) -> None:
        self.profile = profile
        self.rng = rng if rng is not None else random.Random()
        self.state = initial_state(profile)

    def next_reading(self) -> WeatherValues:
        p = self.profile
        s = self.state

        s.temperature = _bounded_walk(
            self.rng,
            s.temperature,
            self.TEMPERATURE_MAX_STEP,
            p.temperature_bounds.min_value,
            p.temperature_bounds.max_value,
        )
        s.humidity = _bounded_walk(
            self.rng,
            s.humidity,
            self.HUMIDITY_MAX_STEP,
            p.humidity_bounds.min_value,
            p.humidity_bounds.max_value,
        )
        s.pressure = _bounded_walk(
            self.rng,
            s.pressure,
            self.PRESSURE_MAX_STEP,
            p.pressure_bounds.min_value,
            p.pressure_bounds.max_value,
        )
        s.wind_speed = _bounded_walk(
            self.rng,
            s.wind_speed,
            self.WIND_MAX_STEP,
            p.wind_speed_bounds.min_value,
            p.wind_speed_bounds.max_value,
        )

        # Most ticks are dry. A light burst occasionally begins and then
        # tapers smoothly instead of jumping to unrelated rainfall values.
        if s.rainfall > 0:
            s.rainfall = max(
                p.rainfall_bounds.min_value,
                s.rainfall - self.rng.uniform(0.1, 0.5),
            )
        elif self.rng.random() < 0.05:
            s.rainfall = min(
                self.rng.uniform(0.1, 3.0),
                p.rainfall_bounds.max_value,
            )

        # Battery never rises and drains by only a few hundredths per tick.
        s.battery = max(
            p.battery_bounds.min_value,
            s.battery - self.rng.uniform(self.BATTERY_MIN_DROP, self.BATTERY_MAX_DROP),
        )

        return {
            "temperature": round(s.temperature, 1),
            "humidity": round(s.humidity, 1),
            "pressure": round(s.pressure, 1),
            "rainfall": round(s.rainfall, 1),
            "windSpeed": round(s.wind_speed, 1),
            "battery": round(s.battery, 1),
        }
