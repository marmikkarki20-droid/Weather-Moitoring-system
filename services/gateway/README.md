# WeatherGrid edge gateway

The gateway is the only MQTT subscriber allowed to forward device telemetry to
Payload. It consumes the simulator telemetry topic at QoS 1, validates the
simulator contract, appends its own UTC timestamp, and posts to the protected
Payload ingestion endpoint.

## Setup

~~~powershell
py -3 -m venv services/gateway/.venv
services/gateway/.venv/Scripts/python.exe -m pip install -r services/gateway/requirements.txt
~~~

Create an active **edge-gateway** service account in Payload Admin under
System > Service Accounts. Generate its native API key there, copy it once, and
put it only in your local `.env` as `GATEWAY_API_KEY`. The gateway sends it as
the native Payload header `service-accounts API-Key <key>`; it never writes the
key to logs, SQLite, or source control.

Required local settings:

~~~dotenv
PAYLOAD_INGEST_URL=http://localhost:3000/api/telemetry/ingest
GATEWAY_API_KEY=paste-the-generated-key-here
GATEWAY_BUFFER_PATH=./runtime/gateway-buffer.sqlite3
~~~

Run from the repository root:

~~~powershell
pnpm gateway:test
pnpm gateway:run
~~~

## Delivery and recovery

The SQLite buffer has WAL mode, parameterized queries, a unique `messageId`,
and a bounded capacity. Retryable failures (network errors, 429, and 5xx) are
queued and replayed oldest first with exponential backoff and jitter. Payload
responses `accepted` and `already_processed` both remove a buffer item.

Authentication failures (401/403) make the gateway unhealthy and stop delivery
until its service account is repaired. Invalid MQTT payloads, topic/payload
mismatches, unknown or inactive devices, and other non-retryable 4xx responses
are logged without being queued. Malformed SQLite rows are reported and removed
so they cannot block later buffered data.

To demonstrate outage recovery locally, start the gateway and a simulator, stop
the Payload app briefly, then restart it. The gateway retains retryable messages
in `runtime/gateway-buffer.sqlite3` and drains them after Payload is available.
Delete that file only when the gateway is stopped and you explicitly want to
discard pending telemetry.
