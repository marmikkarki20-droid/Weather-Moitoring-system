from __future__ import annotations

from gateway.buffer import BufferFullError, SQLiteBuffer
from gateway.models import GatewayTelemetry, utc_now_iso


def telemetry(number: int) -> GatewayTelemetry:
    return GatewayTelemetry(
        schemaVersion=1,
        messageId=f'00000000-0000-4000-8000-{number:012d}',
        deviceId='WX-SYD-001',
        locationCode='SYD',
        sequenceNumber=number,
        temperature=20,
        humidity=50,
        pressure=1010,
        rainfall=0,
        windSpeed=2,
        battery=99,
        deviceTimestamp='2026-09-02T12:00:00.000Z',
        gatewayTimestamp=utc_now_iso(),
    )


def test_persists_deduplicates_and_flushes_oldest_first(tmp_path) -> None:  # noqa: ANN001
    path = tmp_path / 'queue.sqlite3'
    buffer = SQLiteBuffer(path, max_messages=3)
    assert buffer.enqueue(telemetry(1))
    assert buffer.enqueue(telemetry(2))
    assert not buffer.enqueue(telemetry(1))
    assert buffer.due_oldest().telemetry.sequenceNumber == 1
    buffer.close()

    restarted = SQLiteBuffer(path, max_messages=3)
    assert restarted.count() == 2
    first = restarted.due_oldest()
    restarted.remove(first.id)
    assert restarted.due_oldest().telemetry.sequenceNumber == 2


def test_buffer_full_rejects_newest_loudly(tmp_path) -> None:  # noqa: ANN001
    buffer = SQLiteBuffer(tmp_path / 'queue.sqlite3', max_messages=1)
    buffer.enqueue(telemetry(1))
    try:
        buffer.enqueue(telemetry(2))
    except BufferFullError:
        pass
    else:
        raise AssertionError('expected BufferFullError')


def test_malformed_buffer_record_is_discarded_without_crashing(tmp_path) -> None:  # noqa: ANN001
    buffer = SQLiteBuffer(tmp_path / 'queue.sqlite3', max_messages=3)
    with buffer.connection:
        buffer.connection.execute(
            '''
            INSERT INTO telemetry_buffer
            (message_id, device_id, sequence_number, payload_json, created_at, next_retry_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ''',
            ('bad', 'WX-SYD-001', 1, 'not-json', utc_now_iso(), utc_now_iso()),
        )
    assert buffer.due_oldest() is None
    assert buffer.count() == 0
