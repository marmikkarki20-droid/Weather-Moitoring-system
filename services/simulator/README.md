# WeatherGrid device simulator

This Python 3.11+ service models the Sydney, Melbourne, and Brisbane devices seeded by Payload and
publishes realistic local telemetry to Mosquitto. It does not call Payload, PostgreSQL, or any HTTP
ingestion endpoint.

## Layout

```text
services/simulator/
├── README.md
├── requirements.txt
├── simulator/
│   ├── __init__.py
│   ├── cli.py             # one/all-device command line interface
│   ├── config.py          # environment settings and seeded profiles
│   ├── device.py          # device lifecycle and message construction
│   ├── generator.py       # deterministic-testable bounded random walks
│   ├── models.py          # Pydantic telemetry/status contracts
│   ├── mqtt_client.py     # QoS, retain, LWT, reconnect, logging
│   └── state.py           # atomic sequence persistence
├── state/                 # generated and Git-ignored
└── tests/
    ├── conftest.py
    ├── test_config.py
    ├── test_generator.py
    ├── test_models.py
    ├── test_state.py
    └── verify_mqtt.py     # live-broker end-to-end verification
```

## Install

Start Mosquitto from the repository root first:

```bash
docker compose up -d mosquitto
docker compose ps mosquitto
```

Bash/macOS/Linux:

```bash
cd services/simulator
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

Windows PowerShell:

```powershell
Set-Location services/simulator
py -3 -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt
```

The simulator loads MQTT values from process environment variables and, when present, the project
root `.env`. Safe defaults are `localhost:1883`, topic root `weathergrid`, 60-second keepalive, no
credentials, and `INFO` logging. Password values use Pydantic's secret type and are never logged.

## Run

```bash
# Each profile can run independently
python -m simulator.cli run --device WX-SYD-001
python -m simulator.cli run --device WX-MEL-001
python -m simulator.cli run --device WX-BNE-001

# Or run all configured devices concurrently
python -m simulator.cli run-all

# Bounded run useful for observation or smoke testing
python -m simulator.cli run --device WX-SYD-001 --messages 3
python -m simulator.cli run-all --messages 3
```

Use `--interval 0.5` to override the profile interval, `--state-dir PATH` to isolate sequence state,
or `--seed 123` for deterministic generation. `python -m simulator.cli list` prints every profile.

Press `Ctrl+C` once to request a graceful stop. Every connected device publishes retained
`offline` status and then disconnects. If a process or connection disappears unexpectedly,
Mosquitto publishes the device's retained Last Will (`offline`). Paho automatically reconnects
after temporary failures with delays bounded from 1 to 30 seconds; initial connections use the
same bounded exponential retry behavior.

## Generation behavior

Temperature, humidity, pressure, and wind use small bounded random-walk steps. Rain is normally
zero, occasionally starts as a small light-rain value, and decays. Battery falls slowly and never
rises. Values are rounded to one decimal place and constrained to Payload-compatible validation
ranges. No invalid values, duplicates, spikes, or other fault scenarios are generated in this
stage.

## MQTT contract

| Kind | Topic | QoS | Retain |
| --- | --- | ---: | --- |
| Telemetry | `weathergrid/devices/{deviceId}/telemetry` | 1 | false |
| Status | `weathergrid/devices/{deviceId}/status` | 1 | true |

Telemetry example:

```json
{
  "schemaVersion": 1,
  "messageId": "3dd73cd4-2080-40bb-bfa9-e53f7ee493e5",
  "deviceId": "WX-SYD-001",
  "locationCode": "SYD",
  "sequenceNumber": 25,
  "temperature": 18.2,
  "humidity": 64.7,
  "pressure": 1015.3,
  "rainfall": 0.0,
  "windSpeed": 11.8,
  "battery": 99.9,
  "deviceTimestamp": "2026-09-02T12:00:00.000Z"
}
```

Status example:

```json
{
  "deviceId": "WX-SYD-001",
  "status": "offline",
  "timestamp": "2026-09-02T12:05:00.000Z"
}
```

Messages are validated by Pydantic before publication. Telemetry message IDs are UUIDs, timestamps
are UTC ISO-8601 with milliseconds, and sequences are positive integers.

## State and tests

Default sequence files are written atomically to `state/{deviceId}.json`. They contain no secrets.
After restart, the next message continues from the persisted value. Corrupt state fails closed to
avoid reusing a previous sequence. The directory is Git-ignored; tests never touch it.

```bash
# Pure unit tests
python -m pytest tests -q

# Requires a local broker; validates all three devices and restart/status behavior
python tests/verify_mqtt.py

# Observe telemetry from the project root through the broker container
pnpm mqtt:subscribe
```

The verifier subscribes before launching all devices for two messages each, validates every JSON
payload, restarts Sydney with the same temporary state and requires sequence 3, then opens a fresh
subscription and requires retained `offline` status from all devices. A missing device, malformed
payload, sequence regression, retained telemetry, missing retained status, or broker error produces
a non-zero exit.

## Security boundary

The supplied Mosquitto configuration permits anonymous access only because Compose publishes port
1883 on `127.0.0.1`. It is not production-ready. Add broker authentication/ACLs, TLS, managed
secrets, and network restrictions before any non-local deployment. MQTT-to-Payload ingestion is
intentionally not implemented in this stage.
