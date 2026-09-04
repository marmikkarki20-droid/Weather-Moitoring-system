# WeatherGrid — Distributed IoT Weather Monitoring System

WeatherGrid combines a Next.js/Payload application and PostgreSQL data model with three
independent Python weather-device simulators and a local Eclipse Mosquitto broker. This stage
publishes validated MQTT telemetry only: MQTT-to-Payload ingestion is intentionally deferred to
the next stage.

## Current architecture

```text
Python simulated weather devices
  ├─ WX-SYD-001 (Sydney)
  ├─ WX-MEL-001 (Melbourne)
  └─ WX-BNE-001 (Brisbane)
              │
              │ MQTT QoS 1, JSON telemetry
              ▼
Eclipse Mosquitto broker (127.0.0.1:1883)

Payload CMS / Next.js dashboard ───── PostgreSQL (localhost:5432)
             separate in this stage
```

Payload and PostgreSQL retain the seeded stage-two records. Nothing subscribes to MQTT or writes
simulator messages into Payload yet.

## Stack and prerequisites

| Area | Technology |
| --- | --- |
| Web application | Next.js 15, React 19, TypeScript |
| CMS and authentication | Payload CMS 3 |
| Database | PostgreSQL 15 |
| MQTT broker | Eclipse Mosquitto 2.1.2 |
| Device simulator | Python 3.11+, Paho MQTT, Pydantic |
| Package manager | pnpm 10 |

Install Node.js 20.9+, pnpm, Python 3.11 or later, and Docker Desktop (or Docker Engine with the
Compose plugin).

## Local setup

1. Install the JavaScript dependencies and configure the application:

   ```bash
   pnpm install
   cp .env.example .env
   ```

   In PowerShell, use `Copy-Item .env.example .env`. Replace `PAYLOAD_SECRET` with a long random
   value. Do not commit `.env`.

2. Start PostgreSQL and Mosquitto, then check both health states:

   ```bash
   pnpm infra:up
   pnpm infra:status
   ```

   Equivalent commands are `docker compose up -d postgres mosquitto` and `docker compose ps`.
   PostgreSQL is available on `localhost:5432`. MQTT is deliberately bound only to
   `127.0.0.1:1883`.

3. Apply migrations and seed the three locations/devices:

   ```bash
   pnpm migrate
   pnpm seed
   ```

   The seed is idempotent and creates `WX-SYD-001`, `WX-MEL-001`, and `WX-BNE-001`, plus 24
   historical readings per device.

4. Create the Python environment and install the simulator dependencies.

   Bash/macOS/Linux:

   ```bash
   python3 -m venv services/simulator/.venv
   source services/simulator/.venv/bin/activate
   python -m pip install -r services/simulator/requirements.txt
   ```

   Windows PowerShell:

   ```powershell
   py -3 -m venv services/simulator/.venv
   services/simulator/.venv/Scripts/python.exe -m pip install -r services/simulator/requirements.txt
   ```

5. Start the app with `pnpm dev`. The frontend is at http://localhost:3000, Payload Admin is at
   http://localhost:3000/admin, and the authenticated dashboard is at
   http://localhost:3000/dashboard.

## Simulator commands

Run these from `services/simulator` with its virtual environment activated. On Windows, commands
can use `.venv\Scripts\python.exe` in place of `python` without activating the environment.

```bash
# Show configured devices
python -m simulator.cli list

# One device, until Ctrl+C
python -m simulator.cli run --device WX-SYD-001

# All three devices, until Ctrl+C
python -m simulator.cli run-all

# One device for exactly five messages
python -m simulator.cli run --device WX-MEL-001 --messages 5

# Unit tests
python -m pytest tests -q

# End-to-end broker verification
python tests/verify_mqtt.py
```

`Ctrl+C` requests a clean stop: each running device publishes retained `offline` status before
disconnecting. The broker's Last Will also publishes `offline` after an unexpected disconnect.

To observe all telemetry through the broker container from the project root:

```bash
pnpm mqtt:subscribe
```

Or use any MQTT client to subscribe to `weathergrid/devices/+/telemetry` with QoS 1. The project
commands `pnpm sim:test` and `pnpm sim:verify` are also available after the Python environment is
activated.

## Topics and delivery behavior

| Message | Topic | QoS | Retained |
| --- | --- | ---: | --- |
| Telemetry | `weathergrid/devices/{deviceId}/telemetry` | 1 | No |
| Status | `weathergrid/devices/{deviceId}/status` | 1 | Yes |

The topic root is configurable with `MQTT_TOPIC_ROOT`. Each device has a unique MQTT client ID,
uses bounded reconnect backoff (1–30 seconds), and publishes `online` after every successful
connection.

### Telemetry contract

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

Pydantic validates this contract immediately before QoS 1 publication. Timestamps are UTC with
millisecond precision, IDs are UUIDs, sequence numbers are positive integers, and all weather
values remain within the Payload `weather-readings` validation ranges.

### Status contract

```json
{
  "deviceId": "WX-SYD-001",
  "status": "online",
  "timestamp": "2026-09-02T12:00:00.000Z"
}
```

Status is either `online` or `offline`. Retention lets a new subscriber immediately learn the last
known device state.

## Sequence state

The default state files are under `services/simulator/state/`, outside the Python source package
and ignored by Git. Each file stores only its device ID and last sequence number. Writes use a
temporary file plus atomic replacement. A corrupt file stops that device instead of silently
reusing sequence numbers. Tests and the integration verifier use temporary directories.

## Environment variables

| Variable | Default/purpose |
| --- | --- |
| `DATABASE_URI` | Payload PostgreSQL connection string |
| `PAYLOAD_SECRET` | Payload token/cookie secret; must be replaced locally |
| `NEXT_PUBLIC_SERVER_URL` | Public application URL |
| `MQTT_HOST` | `localhost` |
| `MQTT_PORT` | `1883` |
| `MQTT_USERNAME` | Blank for the loopback-only development broker |
| `MQTT_PASSWORD` | Blank for the loopback-only development broker; never logged |
| `MQTT_TOPIC_ROOT` | `weathergrid` |
| `MQTT_KEEPALIVE_SECONDS` | `60` |
| `SIMULATOR_LOG_LEVEL` | `INFO` |

## Mosquitto security and storage

`infrastructure/mosquitto/config/mosquitto.conf` enables anonymous access for local development
only. Compose binds port 1883 to `127.0.0.1`, not every interface. Broker persistence and logs are
stored in `infrastructure/mosquitto/data/` and `infrastructure/mosquitto/log/`; generated files are
ignored.

Do not expose this configuration publicly. A production broker requires authentication,
authorization, TLS certificates, secret management, and an appropriate network policy. Real
credentials must stay out of `.env.example`, source control, and logs.

## Existing Payload application

Payload authentication supports `admin` and `viewer` roles. Access controls cover `locations`,
`devices`, and immutable `weather-readings`. The dashboard reads counts and device summaries from
Payload's server-side Local API. The composite `(device, sequenceNumber)` database index remains
ready for later QoS 1 duplicate handling.

### Secure telemetry ingestion

`POST /api/telemetry/ingest` accepts the exact simulator payload plus a gateway-owned
`gatewayTimestamp`. It accepts only an active `edge-gateway` native Payload service-account API
key, validates a strict and size-bounded JSON body, rejects unknown/inactive devices, and never
exposes the credential in a response or log. It creates the reading and updates device metrics in
one transaction. The unique `(device, sequenceNumber)` constraint is the final idempotency guard;
replays return `200 already_processed`.

Create the native service account in Admin under System > Service Accounts. Generate its API key
there and store it only in local `GATEWAY_API_KEY`; do not use a human admin/viewer account for
the gateway. See [services/gateway/README.md](./services/gateway/README.md) for setup, recovery,
and failure behavior.

~~~bash
pnpm gateway:test
pnpm gateway:run
pnpm verify:ingestion
~~~

### Alerts, offline detection, and audit events

Telemetry ingestion stores a reading, updates the device, evaluates enabled scoped rules, then
creates, updates, escalates, or resolves alerts and records only important immutable system events.
Threshold boundaries are inclusive: `above` and `below` trigger at their values; an
`outside-range` value at or beyond a range boundary is a breach. Critical thresholds/ranges are
always the more severe breach.

Rules can apply to all devices, selected locations, or selected devices. An unresolved alert is
`active` or `acknowledged`; PostgreSQL enforces one unresolved alert per device/rule. Repeated
breaches update that alert, while an acknowledged warning can still escalate to critical.
Auto-resolution records a reason when a valid telemetry value returns to safety. Manual resolution
requires an administrator-supplied reason; viewers have read-only access.

Default idempotent seed rules are high temperature (35/42 C), high humidity (85/95%), low battery
(20/10%), high latency (2000/5000 ms), abnormal pressure (warning 950-1050 hPa, critical
900-1100 hPa), and device offline (3x publish interval, 30-second minimum).

Run the protected worker with `pnpm worker:offline`. It uses a PostgreSQL advisory lock, skips
maintenance devices and devices with no `lastSeen`, and marks a device offline when
`now - lastSeen > max(publishingIntervalSeconds * offlineMultiplier, minimumOfflineSeconds)`.
Fresh valid telemetry marks it online and resolves auto-resolving offline alerts. Configure it with
`OFFLINE_WORKER_INTERVAL_SECONDS` and `OFFLINE_WORKER_ENABLED`.

System events are append-only and omit passwords, API keys, tokens, and authorization headers.
They cover alert lifecycle, offline/recovery, rule audit changes, service account use, and rejected
ingestion. No normal reading emits an event.

### Operational dashboard

Authenticated dashboard routes are `/dashboard`, `/dashboard/live`, `/dashboard/history`,
`/dashboard/devices`, `/dashboard/devices/{id}`, `/dashboard/alerts`, and `/dashboard/system`.
Viewer and administrator sessions can read dashboard data; only administrators can use the existing
alert acknowledgement and resolution actions. Native service-account API keys are not dashboard
sessions.

The dashboard API is same-origin and authenticated: `/api/dashboard/overview`, `/live`, `/history`,
`/devices`, `/devices/{id}`, `/alerts`, and `/system-health`. History accepts bounded UTC `from`,
`to`, `deviceId`, and aggregation buckets `1m`, `5m`, `15m`, `1h`, or `1d`. Responses use UTC
timestamps and bounded result sets; invalid ranges and buckets are rejected.

`GET /api/dashboard/stream` is an authenticated Server-Sent Events endpoint. It sends `connected`,
`heartbeat`, `reading.created`, `device.updated`, `alert.created`, and `alert.updated` events with
dashboard-safe summaries only. The browser uses one shared connection, reconnects with capped
backoff, and re-fetches bounded server data after an event so a missed in-memory event cannot leave
the view permanently stale. The current event hub is intentionally a single-process prototype:
events are not distributed between multiple Next.js instances.

Run `pnpm dev`, sign in at `/admin`, then open `/dashboard`. The responsive UI uses browser-local
timestamp formatting while storage/API timestamps remain UTC. Current exclusions remain maps,
exports, external notifications, Redis/multi-instance event distribution, and production deployment.

### Simulation Laboratory

The administrator-only laboratory is at `/dashboard/simulation`. It issues only fixed, validated
academic scenarios to `weathergrid/devices/{deviceId}/commands` using MQTT QoS 1 and non-retained
messages. Simulators return safe lifecycle acknowledgements on
`weathergrid/devices/{deviceId}/acks`; the gateway forwards them to the authenticated Payload
acknowledgement endpoint. Commands move forward only through queued, published, acknowledged,
running, and terminal lifecycle states.

Set `SIMULATION_LAB_ENABLED=true` locally before issuing a command. `DEMO_MODE_ENABLED=true` is
also required if deliberately enabling the lab in production mode. Durations are bounded to 1–600
seconds; command IDs, MQTT topics, issuer, issue time, and expiry are all server-generated.

> The Simulation Laboratory is designed for local academic demonstration. It must be disabled in
> production unless explicitly secured and required.

The current simulator supports bounded high-temperature, humidity, pressure, battery, telemetry
pause, MQTT disconnect, and reset scenarios through a one-at-a-time scenario controller. It
automatically completes scenarios after their duration. Manual backend/broker interruption remains
an operator action; this project intentionally provides no remote shutdown or arbitrary publisher.

### Weather Map and reports

`/dashboard/map` provides a browser-only Leaflet map using OpenStreetMap tiles with visible
attribution, plus a synchronized keyboard-accessible station table. It uses stored Location
coordinates only; stations with missing coordinates remain available in the table rather than being
invented on the map. Marker color is supplemented by explicit status and alert labels.

`/dashboard/reports` provides bounded 31-day CSV and PDF exports for weather readings, alerts,
devices, system events, and simulation commands. Export routes are authenticated interactive-user
routes at `/api/reports/{type}/{format}`. They reject service accounts, validate type/format/date
inputs, limit result sets, use safe filenames, return correct download headers, escape CSV fields,
and neutralize spreadsheet formula text without altering numeric measurements. Each successful
export creates a credential-free `report-exported` system event recording only report type, format,
date range, and record count.

PDFs are generated server-side with WeatherGrid title, generation time, UTC range, record count,
and concise tabular content. They are intended for local academic use; no report file storage,
public links, scheduled delivery, or external notification is implemented.

### Optional email notifications

Notification delivery uses a transactional outbox: alert/device transition → outbox record →
`pnpm worker:notifications` → provider. Telemetry ingestion never waits for provider delivery.
Preview mode (`EMAIL_PROVIDER=preview`) is the safe local default and records messages in memory
without sending to real addresses. Set `EMAIL_PROVIDER=resend` and provide `RESEND_API_KEY` only
when intentionally configuring a production provider; credentials are never exposed to the UI or
stored in the outbox.

Users manage opt-in email and minimum severity at `/dashboard/notifications`. Outbox records use
deterministic idempotency keys, bounded attempts, advisory-lock worker coordination, and exponential
retry scheduling. The worker records only safe delivery events and categories; it does not store
provider secrets or full error stacks. Current implementation supports alert/offline/recovery
outbox events and preview/resend templates. Digest scheduling and email attachments remain deferred.

Useful checks from the project root:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm payload migrate:status
```

On Windows without Developer Mode, the build omits Next's standalone packaging because it requires
symlink privileges; Linux/production builds still emit `.next/standalone`.

## Stage boundary

Implemented here: local Mosquitto, three independent realistic simulators, validated telemetry and
status contracts, reconnect/LWT behavior, sequence persistence, a secure API-key-authenticated
Payload endpoint, a durable MQTT edge gateway, unit tests, and ingestion verification.

Not implemented: alerts, system events, live dashboard updates, Socket.IO/SSE, polling, charts,
maps, CSV export, fault injection, machine learning, or production MQTT deployment.

See [services/simulator/README.md](./services/simulator/README.md) for simulator internals and
[ACKNOWLEDGEMENTS.md](./ACKNOWLEDGEMENTS.md) for project attribution.
