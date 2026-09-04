import type { Payload, PayloadRequest } from 'payload'

type SystemEventInput = {
  eventType: 'alert-created' | 'alert-escalated' | 'alert-acknowledged' | 'alert-resolved' | 'device-offline' | 'device-recovered' | 'rule-created' | 'rule-updated' | 'rule-disabled' | 'service-account-used' | 'ingestion-rejected' | 'simulation-command-created' | 'simulation-command-published' | 'simulation-command-acknowledged' | 'simulation-started' | 'simulation-completed' | 'simulation-failed' | 'simulation-cancelled' | 'simulation-expired' | 'mqtt-device-disconnected' | 'mqtt-device-reconnected' | 'invalid-simulated-payload-rejected' | 'duplicate-message-ignored' | 'gateway-buffered-message' | 'gateway-buffer-flushed' | 'report-exported' | 'notification-queued' | 'notification-sent' | 'notification-retry-scheduled' | 'notification-failed' | 'notification-cancelled' | 'daily-digest-generated' | 'weekly-digest-generated' | 'notification-preferences-updated'
  severity: 'info' | 'warning' | 'critical'
  source: 'telemetry-ingestion' | 'alert-engine' | 'offline-worker' | 'payload-admin' | 'authentication'
  device?: number
  alert?: number
  rule?: number
  user?: number
  serviceAccount?: number
  message: string
  metadata?: Record<string, unknown>
}

/** Server-only append helper. Callers must never include credentials in metadata. */
export async function recordSystemEvent(payload: Payload, input: SystemEventInput, req?: Partial<PayloadRequest>) {
  return payload.create({
    collection: 'system-events', overrideAccess: true, req,
    data: { ...input, occurredAt: new Date().toISOString() },
  })
}
