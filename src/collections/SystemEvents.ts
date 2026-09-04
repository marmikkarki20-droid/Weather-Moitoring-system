import type { CollectionConfig } from 'payload'
import { isDashboardUser } from '@/access'

export const SystemEvents: CollectionConfig = {
  slug: 'system-events',
  admin: { group: 'System', useAsTitle: 'eventType', defaultColumns: ['eventType', 'severity', 'device', 'occurredAt'] },
  access: { create: () => false, update: () => false, delete: () => false, read: ({ req }) => isDashboardUser(req.user) },
  fields: [
    { name: 'eventType', type: 'select', required: true, index: true, options: ['alert-created', 'alert-escalated', 'alert-acknowledged', 'alert-resolved', 'device-offline', 'device-recovered', 'rule-created', 'rule-updated', 'rule-disabled', 'service-account-used', 'ingestion-rejected', 'simulation-command-created', 'simulation-command-published', 'simulation-command-acknowledged', 'simulation-started', 'simulation-completed', 'simulation-failed', 'simulation-cancelled', 'simulation-expired', 'mqtt-device-disconnected', 'mqtt-device-reconnected', 'invalid-simulated-payload-rejected', 'duplicate-message-ignored', 'gateway-buffered-message', 'gateway-buffer-flushed', 'report-exported', 'notification-queued', 'notification-sent', 'notification-retry-scheduled', 'notification-failed', 'notification-cancelled', 'daily-digest-generated', 'weekly-digest-generated', 'notification-preferences-updated'].map(value => ({ label: value, value })) },
    { name: 'severity', type: 'select', required: true, index: true, options: ['info', 'warning', 'critical'].map(value => ({ label: value, value })) },
    { name: 'source', type: 'select', required: true, options: ['telemetry-ingestion', 'alert-engine', 'offline-worker', 'payload-admin', 'authentication'].map(value => ({ label: value, value })) },
    { name: 'device', type: 'relationship', relationTo: 'devices', index: true }, { name: 'alert', type: 'relationship', relationTo: 'alerts' }, { name: 'rule', type: 'relationship', relationTo: 'alert-rules' }, { name: 'user', type: 'relationship', relationTo: 'users' }, { name: 'serviceAccount', type: 'relationship', relationTo: 'service-accounts' },
    { name: 'message', type: 'textarea', required: true }, { name: 'metadata', type: 'json' }, { name: 'occurredAt', type: 'date', required: true, index: true },
  ],
  indexes: [{ fields: ['eventType', 'occurredAt'] }, { fields: ['severity'] }, { fields: ['device', 'occurredAt'] }],
}
