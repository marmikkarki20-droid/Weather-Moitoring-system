"""Bounded, non-executable command scenarios for the local academic simulator."""
from __future__ import annotations
from datetime import datetime, timedelta, timezone
from simulator.models import CommandAcknowledgement, SimulationCommand, utc_now_iso

class ScenarioController:
    def __init__(self, device_id: str) -> None:
        self.device_id = device_id; self.active: SimulationCommand | None = None; self.ends_at: datetime | None = None; self.processed: set[str] = set()
    def receive(self, command: SimulationCommand) -> list[CommandAcknowledgement]:
        if str(command.commandId) in self.processed: return [self.ack(command, 'acknowledged', 'Duplicate command ignored.')]
        self.processed.add(str(command.commandId))
        if datetime.fromisoformat(command.expiresAt.replace('Z', '+00:00')) <= datetime.now(timezone.utc): return [self.ack(command, 'expired', 'Command expired.')]
        if command.commandType == 'reset-normal':
            previous = self.active; self.active = None; self.ends_at = None
            result = [self.ack(command, 'acknowledged', 'Reset accepted.')]
            if previous: result.append(self.ack(previous, 'cancelled', 'Scenario cancelled by reset.'))
            return result + [self.ack(command, 'completed', 'Normal simulation restored.')]
        if self.active: return [self.ack(command, 'failed', 'Another scenario is active.')]
        self.active = command; self.ends_at = datetime.now(timezone.utc) + timedelta(seconds=command.durationSeconds or 10)
        return [self.ack(command, 'acknowledged', 'Scenario accepted.'), self.ack(command, 'running', 'Scenario running.')]
    def complete_if_due(self) -> CommandAcknowledgement | None:
        if self.active and self.ends_at and datetime.now(timezone.utc) >= self.ends_at:
            command = self.active; self.active = None; self.ends_at = None; return self.ack(command, 'completed', 'Scenario recovered to normal.')
        return None
    def ack(self, command: SimulationCommand, status: str, message: str) -> CommandAcknowledgement:
        return CommandAcknowledgement(commandId=command.commandId, deviceId=self.device_id, status=status, message=message, timestamp=utc_now_iso())
