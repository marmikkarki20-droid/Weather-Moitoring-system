from __future__ import annotations

import logging
import signal
import sys

from gateway.buffer import SQLiteBuffer
from gateway.config import GatewaySettings
from gateway.mqtt_consumer import MQTTConsumer
from gateway.payload_client import PayloadIngestClient
from gateway.processor import GatewayAuthenticationError, TelemetryProcessor


def main() -> int:
    try:
        settings = GatewaySettings()
    except Exception:
        print('Invalid gateway configuration; check required gateway environment values.', file=sys.stderr)
        return 2

    logging.basicConfig(
        level=getattr(logging, settings.gateway_log_level),
        format='%(asctime)s %(levelname)s %(name)s %(message)s',
    )
    buffer = SQLiteBuffer(settings.gateway_buffer_path, settings.gateway_buffer_max_messages)
    client = PayloadIngestClient(settings)
    consumer = MQTTConsumer(settings, TelemetryProcessor(settings, client, buffer))

    def stop(signum, frame) -> None:  # noqa: ANN001
        logging.getLogger(__name__).info('shutdown_signal=%s action=graceful_stop', signum)
        consumer.stop_event.set()

    signal.signal(signal.SIGINT, stop)
    if hasattr(signal, 'SIGTERM'):
        signal.signal(signal.SIGTERM, stop)

    try:
        consumer.run()
    except GatewayAuthenticationError:
        return 3
    finally:
        client.close()
        buffer.close()
    return 0


if __name__ == '__main__':
    sys.exit(main())
