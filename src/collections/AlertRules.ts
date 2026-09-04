import type { CollectionAfterChangeHook, CollectionBeforeValidateHook, CollectionConfig } from 'payload'

import { isAdmin, isAdminUser, isViewerUser } from '@/access'
import { recordSystemEvent } from '@/lib/system-events'

const metricLimits: Record<string, [number, number]> = {
  temperature: [-60, 70], humidity: [0, 100], pressure: [800, 1200], rainfall: [0, Number.MAX_SAFE_INTEGER],
  windSpeed: [0, Number.MAX_SAFE_INTEGER], battery: [0, 100], latencyMs: [0, Number.MAX_SAFE_INTEGER],
}

const validateRule: CollectionBeforeValidateHook = ({ data }) => {
  if (!data) return data
  if (data.ruleType === 'device-offline') return data
  const limit = metricLimits[String(data.metric)]
  if (!limit) throw new Error('Metric threshold rules require a valid metric.')
  if (!['above', 'below', 'outside-range'].includes(String(data.condition))) {
    throw new Error('Metric threshold rules require a condition.')
  }
  const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value)
  if (data.condition === 'above' || data.condition === 'below') {
    if (!number(data.warningValue) || !number(data.criticalValue)) throw new Error('Warning and critical values are required.')
    if (data.warningValue < limit[0] || data.warningValue > limit[1] || data.criticalValue < limit[0] || data.criticalValue > limit[1]) {
      throw new Error('Threshold values must be within the selected telemetry measurement limits.')
    }
    if (data.condition === 'above' && data.criticalValue <= data.warningValue) throw new Error('Critical value must be higher than warning value.')
    if (data.condition === 'below' && data.criticalValue >= data.warningValue) throw new Error('Critical value must be lower than warning value.')
  } else {
    const values = [data.warningMinimum, data.warningMaximum, data.criticalMinimum, data.criticalMaximum]
    if (!values.every(number)) throw new Error('Both warning and critical ranges are required.')
    if (data.warningMinimum >= data.warningMaximum || data.criticalMinimum >= data.criticalMaximum) throw new Error('Each range minimum must be lower than its maximum.')
    if (data.warningMinimum < limit[0] || data.warningMaximum > limit[1] || data.criticalMinimum < limit[0] || data.criticalMaximum > limit[1]) throw new Error('Ranges must be within the selected telemetry measurement limits.')
    if (data.criticalMinimum > data.warningMinimum || data.criticalMaximum < data.warningMaximum) throw new Error('Critical range must contain the warning range.')
  }
  if (data.scope === 'selected-locations' && !data.locations?.length) throw new Error('Select at least one location for this scope.')
  if (data.scope === 'selected-devices' && !data.devices?.length) throw new Error('Select at least one device for this scope.')
  return data
}

const auditRuleChange: CollectionAfterChangeHook = async ({ doc, operation, previousDoc, req }) => {
  const eventType = operation === 'create' ? 'rule-created' : previousDoc?.enabled && !doc.enabled ? 'rule-disabled' : 'rule-updated'
  await recordSystemEvent(req.payload, { eventType, severity: 'info', source: 'payload-admin', rule: doc.id, message: `Alert rule ${doc.code} ${eventType.replace('rule-', '')}.` }, req)
  return doc
}

export const AlertRules: CollectionConfig = {
  slug: 'alert-rules',
  admin: { group: 'Weather System', useAsTitle: 'name', defaultColumns: ['name', 'code', 'ruleType', 'enabled'] },
  access: {
    create: isAdmin, update: isAdmin, delete: isAdmin,
    read: ({ req }) => isAdminUser(req.user) ? true : isViewerUser(req.user) ? { enabled: { equals: true } } : false,
  },
  hooks: { beforeValidate: [validateRule], afterChange: [auditRuleChange] },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'code', type: 'text', required: true, unique: true, index: true, admin: { description: 'Stable unique rule code.' } },
    { name: 'description', type: 'textarea' },
    { name: 'enabled', type: 'checkbox', defaultValue: true, required: true },
    { name: 'ruleType', type: 'select', required: true, options: [{ label: 'Metric threshold', value: 'metric-threshold' }, { label: 'Device offline', value: 'device-offline' }] },
    { name: 'metric', type: 'select', admin: { condition: (_, siblingData) => siblingData.ruleType === 'metric-threshold' }, options: ['temperature', 'humidity', 'pressure', 'rainfall', 'windSpeed', 'battery', 'latencyMs'].map(value => ({ label: value, value })) },
    { name: 'condition', type: 'select', admin: { condition: (_, siblingData) => siblingData.ruleType === 'metric-threshold' }, options: [{ label: 'Above', value: 'above' }, { label: 'Below', value: 'below' }, { label: 'Outside range', value: 'outside-range' }] },
    { name: 'warningValue', type: 'number', admin: { condition: (_, data) => data.ruleType === 'metric-threshold' && data.condition !== 'outside-range' } },
    { name: 'criticalValue', type: 'number', admin: { condition: (_, data) => data.ruleType === 'metric-threshold' && data.condition !== 'outside-range' } },
    { name: 'warningMinimum', type: 'number', admin: { condition: (_, data) => data.condition === 'outside-range' } },
    { name: 'warningMaximum', type: 'number', admin: { condition: (_, data) => data.condition === 'outside-range' } },
    { name: 'criticalMinimum', type: 'number', admin: { condition: (_, data) => data.condition === 'outside-range' } },
    { name: 'criticalMaximum', type: 'number', admin: { condition: (_, data) => data.condition === 'outside-range' } },
    { name: 'offlineMultiplier', type: 'number', defaultValue: 3, min: 1, admin: { condition: (_, data) => data.ruleType === 'device-offline' } },
    { name: 'minimumOfflineSeconds', type: 'number', defaultValue: 30, min: 1, admin: { condition: (_, data) => data.ruleType === 'device-offline' } },
    { name: 'cooldownSeconds', type: 'number', required: true, defaultValue: 300, min: 0 },
    { name: 'autoResolve', type: 'checkbox', defaultValue: true, required: true },
    { name: 'scope', type: 'select', required: true, defaultValue: 'all-devices', options: [{ label: 'All devices', value: 'all-devices' }, { label: 'Selected locations', value: 'selected-locations' }, { label: 'Selected devices', value: 'selected-devices' }] },
    { name: 'locations', type: 'relationship', relationTo: 'locations', hasMany: true, admin: { condition: (_, data) => data.scope === 'selected-locations' } },
    { name: 'devices', type: 'relationship', relationTo: 'devices', hasMany: true, admin: { condition: (_, data) => data.scope === 'selected-devices' } },
    { name: 'messageTemplate', type: 'text' },
  ],
}
