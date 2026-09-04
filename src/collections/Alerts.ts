import type { CollectionConfig } from 'payload'

import { isAdmin, isDashboardUser } from '@/access'

export const Alerts: CollectionConfig = {
  slug: 'alerts',
  admin: { group: 'Weather System', useAsTitle: 'message', defaultColumns: ['severity', 'status', 'device', 'rule', 'lastTriggeredAt'] },
  access: { create: () => false, update: isAdmin, delete: isAdmin, read: ({ req }) => isDashboardUser(req.user) },
  fields: [
    { name: 'device', type: 'relationship', relationTo: 'devices', required: true, index: true },
    { name: 'rule', type: 'relationship', relationTo: 'alert-rules', required: true, index: true },
    { name: 'reading', type: 'relationship', relationTo: 'weather-readings' },
    { name: 'type', type: 'select', required: true, options: ['metric-threshold', 'device-offline'].map(value => ({ label: value, value })) },
    { name: 'metric', type: 'select', options: ['temperature', 'humidity', 'pressure', 'rainfall', 'windSpeed', 'battery', 'latencyMs'].map(value => ({ label: value, value })) },
    { name: 'severity', type: 'select', required: true, index: true, options: ['warning', 'critical'].map(value => ({ label: value, value })) },
    { name: 'status', type: 'select', required: true, defaultValue: 'active', index: true, options: ['active', 'acknowledged', 'resolved'].map(value => ({ label: value, value })) },
    { name: 'message', type: 'textarea', required: true }, { name: 'measuredValue', type: 'number' },
    { name: 'thresholdSnapshot', type: 'json', required: true }, { name: 'occurrenceCount', type: 'number', required: true, defaultValue: 1, min: 1 },
    { name: 'firstTriggeredAt', type: 'date', required: true, index: true }, { name: 'lastTriggeredAt', type: 'date', required: true, index: true },
    { name: 'acknowledgedAt', type: 'date' }, { name: 'acknowledgedBy', type: 'relationship', relationTo: 'users' },
    { name: 'resolvedAt', type: 'date' }, { name: 'resolvedBy', type: 'relationship', relationTo: 'users' }, { name: 'resolutionReason', type: 'text' }, { name: 'metadata', type: 'json' },
  ],
  indexes: [{ fields: ['status', 'severity'] }, { fields: ['device', 'rule'] }, { fields: ['lastTriggeredAt'] }],
}
