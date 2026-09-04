from __future__ import annotations

import json
import logging
import random
import sqlite3
import threading
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

from gateway.models import GatewayTelemetry

logger = logging.getLogger(__name__)


class BufferFullError(RuntimeError):
    pass


@dataclass(frozen=True)
class BufferedMessage:
    id: int
    telemetry: GatewayTelemetry
    attempt_count: int


class SQLiteBuffer:
    """Crash-safe, oldest-first queue. New data is rejected loudly when full."""

    def __init__(self, path: Path, max_messages: int) -> None:
        self.path = path
        self.max_messages = max_messages
        path.parent.mkdir(parents=True, exist_ok=True)
        self.connection = sqlite3.connect(path, check_same_thread=False)
        self.lock = threading.RLock()
        self.connection.row_factory = sqlite3.Row
        self.connection.execute('PRAGMA journal_mode=WAL')
        self.connection.execute('PRAGMA busy_timeout=5000')
        self.connection.execute(
            '''
            CREATE TABLE IF NOT EXISTS telemetry_buffer (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              message_id TEXT NOT NULL UNIQUE,
              device_id TEXT NOT NULL,
              sequence_number INTEGER NOT NULL,
              payload_json TEXT NOT NULL,
              created_at TEXT NOT NULL,
              attempt_count INTEGER NOT NULL DEFAULT 0,
              last_attempt_at TEXT,
              last_error_category TEXT,
              next_retry_at TEXT NOT NULL
            )
            '''
        )
        self.connection.commit()

    def close(self) -> None:
        self.connection.close()

    def count(self) -> int:
        with self.lock:
            return int(self.connection.execute('SELECT COUNT(*) FROM telemetry_buffer').fetchone()[0])

    def enqueue(self, telemetry: GatewayTelemetry, error_category: str = 'temporary_failure') -> bool:
        payload = telemetry.model_dump_json()
        now = datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
        with self.lock, self.connection:
            existing = self.connection.execute(
                'SELECT 1 FROM telemetry_buffer WHERE message_id = ?', (str(telemetry.messageId),)
            ).fetchone()
            if existing:
                return False
            if self.count() >= self.max_messages:
                raise BufferFullError(
                    f'Gateway buffer is full ({self.max_messages} messages); newest telemetry was not buffered'
                )
            self.connection.execute(
                '''
                INSERT INTO telemetry_buffer
                (message_id, device_id, sequence_number, payload_json, created_at, last_error_category, next_retry_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ''',
                (
                    str(telemetry.messageId),
                    telemetry.deviceId,
                    telemetry.sequenceNumber,
                    payload,
                    now,
                    error_category,
                    now,
                ),
            )
        return True

    def due_oldest(self) -> BufferedMessage | None:
        now = datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
        with self.lock:
            row = self.connection.execute(
            '''
            SELECT id, payload_json, attempt_count FROM telemetry_buffer
            WHERE next_retry_at <= ? ORDER BY created_at ASC, id ASC LIMIT 1
            ''',
            (now,),
            ).fetchone()
        if not row:
            return None
        try:
            return BufferedMessage(
                id=int(row['id']),
                telemetry=GatewayTelemetry.model_validate_json(row['payload_json']),
                attempt_count=int(row['attempt_count']),
            )
        except Exception:
            # The record cannot be forwarded safely. Remove it explicitly with
            # a serious log, allowing subsequent healthy records to recover.
            logger.error('buffer_record_corrupt id=%s action=discard', row['id'])
            with self.lock, self.connection:
                self.connection.execute('DELETE FROM telemetry_buffer WHERE id = ?', (row['id'],))
            return None

    def remove(self, queue_id: int) -> None:
        with self.lock, self.connection:
            self.connection.execute('DELETE FROM telemetry_buffer WHERE id = ?', (queue_id,))

    def schedule_retry(self, queue_id: int, attempt_count: int, minimum: float, maximum: float, category: str) -> None:
        delay = min(maximum, minimum * (2**attempt_count)) + random.uniform(0, minimum)
        next_retry = datetime.now(timezone.utc) + timedelta(seconds=delay)
        now = datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
        with self.lock, self.connection:
            self.connection.execute(
                '''
                UPDATE telemetry_buffer
                SET attempt_count = ?, last_attempt_at = ?, last_error_category = ?, next_retry_at = ?
                WHERE id = ?
                ''',
                (
                    attempt_count + 1,
                    now,
                    category,
                    next_retry.isoformat(timespec='milliseconds').replace('+00:00', 'Z'),
                    queue_id,
                ),
            )
