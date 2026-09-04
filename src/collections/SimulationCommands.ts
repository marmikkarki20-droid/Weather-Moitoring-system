import type { CollectionConfig } from 'payload'
import { isAdmin } from '@/access'

export const SimulationCommands: CollectionConfig = {
  slug: 'simulation-commands',
  admin: { group: 'Simulation', useAsTitle: 'commandId', defaultColumns: ['commandType', 'device', 'status', 'issuedAt'] },
  // The browser can never fabricate or mutate lifecycle history; endpoints
  // use the Local API with overrideAccess after validating the command.
  access: { create: () => false, update: () => false, delete: () => false, read: isAdmin },
  fields: [
    { name: 'commandId', type: 'text', required: true, unique: true, index: true },
    { name: 'device', type: 'relationship', relationTo: 'devices', required: true, index: true },
    { name: 'commandType', type: 'select', required: true, options: ['high-temperature', 'high-humidity', 'abnormal-pressure', 'low-battery', 'high-latency', 'pause-telemetry', 'duplicate-message', 'delayed-message', 'out-of-order-message', 'invalid-payload', 'disconnect-mqtt', 'reset-normal'].map(value => ({ label: value, value })) },
    { name: 'status', type: 'select', required: true, defaultValue: 'queued', index: true, options: ['queued', 'published', 'acknowledged', 'running', 'completed', 'failed', 'expired', 'cancelled'].map(value => ({ label: value, value })) },
    { name: 'parameters', type: 'json', required: true }, { name: 'durationSeconds', type: 'number', min: 1, max: 600 },
    { name: 'issuedBy', type: 'relationship', relationTo: 'users', required: true }, { name: 'issuedAt', type: 'date', required: true, index: true }, { name: 'expiresAt', type: 'date', required: true },
    { name: 'publishedAt', type: 'date' }, { name: 'acknowledgedAt', type: 'date' }, { name: 'startedAt', type: 'date' }, { name: 'completedAt', type: 'date' },
    { name: 'result', type: 'json' }, { name: 'failureReason', type: 'text' }, { name: 'alertObservedAt', type: 'date' }, { name: 'recoveryObservedAt', type: 'date' },
  ],
  indexes: [{ fields: ['device', 'status'] }, { fields: ['issuedAt'] }],
}
