import type { Payload, PayloadRequest } from 'payload'
import { recordSystemEvent } from './system-events'
import { dashboardEventHub } from './dashboard-events'
import { queueNotifications } from './notifications'

async function queueSafely(payload: Payload, type: 'alert-created' | 'alert-escalated' | 'alert-resolved' | 'device-recovered', input: Parameters<typeof queueNotifications>[2], req?: Partial<PayloadRequest>) { try { await queueNotifications(payload, type, input, req) } catch (error) { payload.logger.error({ msg: 'Notification outbox enqueue failed', eventType: type, error: error instanceof Error ? error.message : 'unknown' }) } }

export type RuleLike = {
  id: number; name: string; code: string; enabled: boolean; ruleType: 'metric-threshold' | 'device-offline'
  metric?: Metric; condition?: 'above' | 'below' | 'outside-range'; warningValue?: number; criticalValue?: number
  warningMinimum?: number; warningMaximum?: number; criticalMinimum?: number; criticalMaximum?: number
  cooldownSeconds: number; autoResolve: boolean; offlineMultiplier?: number; minimumOfflineSeconds?: number; scope: 'all-devices' | 'selected-locations' | 'selected-devices'
  locations?: Array<number | { id: number }>; devices?: Array<number | { id: number }>; messageTemplate?: string
}
export type Metric = 'temperature' | 'humidity' | 'pressure' | 'rainfall' | 'windSpeed' | 'battery' | 'latencyMs'
export type ReadingLike = { id: number; temperature: number; humidity: number; pressure: number; rainfall: number; windSpeed: number; battery: number; latencyMs: number }
export type DeviceLike = { id: number; deviceId: string; name: string; location: number | { id: number } }
export type AlertSeverity = 'warning' | 'critical'

const idOf = (value: number | { id: number }) => typeof value === 'object' ? value.id : value
const sameId = (left: number, right: number) => left === right

/** Boundaries are inclusive: values equal to a threshold are a breach. */
export function evaluateMetric(rule: RuleLike, value: number): AlertSeverity | null {
  if (rule.condition === 'above') {
    if (value >= Number(rule.criticalValue)) return 'critical'
    if (value >= Number(rule.warningValue)) return 'warning'
    return null
  }
  if (rule.condition === 'below') {
    if (value <= Number(rule.criticalValue)) return 'critical'
    if (value <= Number(rule.warningValue)) return 'warning'
    return null
  }
  if (rule.condition === 'outside-range') {
    if (value <= Number(rule.criticalMinimum) || value >= Number(rule.criticalMaximum)) return 'critical'
    if (value <= Number(rule.warningMinimum) || value >= Number(rule.warningMaximum)) return 'warning'
  }
  return null
}

export function ruleAppliesToDevice(rule: RuleLike, device: DeviceLike): boolean {
  if (!rule.enabled) return false
  if (rule.scope === 'all-devices') return true
  if (rule.scope === 'selected-devices') return Boolean(rule.devices?.some(value => sameId(idOf(value), device.id)))
  return Boolean(rule.locations?.some(value => sameId(idOf(value), idOf(device.location))))
}

function snapshot(rule: RuleLike) {
  return { metric: rule.metric, condition: rule.condition, warningValue: rule.warningValue, criticalValue: rule.criticalValue, warningMinimum: rule.warningMinimum, warningMaximum: rule.warningMaximum, criticalMinimum: rule.criticalMinimum, criticalMaximum: rule.criticalMaximum, cooldownSeconds: rule.cooldownSeconds }
}

function alertMessage(rule: RuleLike, device: DeviceLike, severity: AlertSeverity, value: number) {
  return rule.messageTemplate || `${severity.toUpperCase()}: ${rule.name} on ${device.name} measured ${value}.`
}

async function unresolvedAlert(payload: Payload, deviceId: number, ruleId: number, req?: Partial<PayloadRequest>) {
  const result = await payload.find({ collection: 'alerts', req, overrideAccess: true, limit: 1, sort: '-lastTriggeredAt', where: { and: [{ device: { equals: deviceId } }, { rule: { equals: ruleId } }, { status: { in: ['active', 'acknowledged'] } }] } })
  return result.docs[0]
}

export async function evaluateAlertsForReading(payload: Payload, device: DeviceLike, reading: ReadingLike, req?: Partial<PayloadRequest>) {
  const rules = await payload.find({ collection: 'alert-rules', req, overrideAccess: true, limit: 100, where: { and: [{ enabled: { equals: true } }, { ruleType: { equals: 'metric-threshold' } }] } })
  const now = new Date().toISOString()
  for (const rawRule of rules.docs) {
    const rule = rawRule as unknown as RuleLike
    if (!ruleAppliesToDevice(rule, device) || !rule.metric) continue
    const measuredValue = reading[rule.metric]
    const severity = evaluateMetric(rule, measuredValue)
    const current = await unresolvedAlert(payload, device.id, rule.id, req)
    if (!severity) {
      if (current && rule.autoResolve) {
        const resolved = await payload.update({ collection: 'alerts', id: current.id, req, overrideAccess: true, data: { status: 'resolved', resolvedAt: now, resolutionReason: 'Automatically resolved after telemetry returned to the safe range.' } })
        await recordSystemEvent(payload, { eventType: 'alert-resolved', severity: 'info', source: 'alert-engine', device: device.id, alert: resolved.id, rule: rule.id, message: `Alert ${rule.code} automatically resolved for ${device.deviceId}.` }, req)
      }
      continue
    }
    if (!current) {
      try {
        const created = await payload.create({ collection: 'alerts', req, overrideAccess: true, data: { device: device.id, rule: rule.id, reading: reading.id, type: 'metric-threshold', metric: rule.metric, severity, status: 'active', message: alertMessage(rule, device, severity, measuredValue), measuredValue, thresholdSnapshot: snapshot(rule), occurrenceCount: 1, firstTriggeredAt: now, lastTriggeredAt: now } })
        await recordSystemEvent(payload, { eventType: 'alert-created', severity, source: 'alert-engine', device: device.id, alert: created.id, rule: rule.id, message: `Alert ${rule.code} created for ${device.deviceId}.` }, req)
        await queueSafely(payload, 'alert-created', { device: device.id, alert: created.id, severity, message: created.message, deviceName: device.name }, req)
        dashboardEventHub.publish('alert.created', { id: created.id, deviceId: device.id, severity, status: 'active', message: created.message })
        continue
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes('duplicate')) throw error
      }
    }
    const existing = current || await unresolvedAlert(payload, device.id, rule.id, req)
    if (!existing) continue
    const escalated = existing.severity === 'warning' && severity === 'critical'
    const last = Date.parse(existing.lastTriggeredAt)
    const increment = escalated || Date.now() - last >= rule.cooldownSeconds * 1000
    const updated = await payload.update({ collection: 'alerts', id: existing.id, req, overrideAccess: true, data: { severity: escalated ? 'critical' : existing.severity, reading: reading.id, measuredValue, message: alertMessage(rule, device, escalated ? 'critical' : existing.severity as AlertSeverity, measuredValue), lastTriggeredAt: now, occurrenceCount: increment ? existing.occurrenceCount + 1 : existing.occurrenceCount } })
    dashboardEventHub.publish('alert.updated', { id: updated.id, deviceId: device.id, severity: updated.severity, status: updated.status, occurrenceCount: updated.occurrenceCount })
    if (escalated) await recordSystemEvent(payload, { eventType: 'alert-escalated', severity: 'critical', source: 'alert-engine', device: device.id, alert: updated.id, rule: rule.id, message: `Alert ${rule.code} escalated to critical for ${device.deviceId}.` }, req)
    if (escalated) await queueSafely(payload, 'alert-escalated', { device: device.id, alert: updated.id, severity: 'critical', message: updated.message, deviceName: device.name }, req)
  }
}

export async function resolveOfflineAlertsForDevice(payload: Payload, device: DeviceLike, req?: Partial<PayloadRequest>) {
  const alerts = await payload.find({ collection: 'alerts', req, overrideAccess: true, limit: 100, where: { and: [{ device: { equals: device.id } }, { type: { equals: 'device-offline' } }, { status: { in: ['active', 'acknowledged'] } }] } })
  for (const alert of alerts.docs) {
    const rule = typeof alert.rule === 'object'
      ? alert.rule as unknown as RuleLike
      : await payload.findByID({ collection: 'alert-rules', id: alert.rule, req, overrideAccess: true }).then(value => value as unknown as RuleLike)
    if (!rule?.autoResolve) continue
    const resolved = await payload.update({ collection: 'alerts', id: alert.id, req, overrideAccess: true, data: { status: 'resolved', resolvedAt: new Date().toISOString(), resolutionReason: 'Automatically resolved by valid telemetry.' } })
    await recordSystemEvent(payload, { eventType: 'alert-resolved', severity: 'info', source: 'alert-engine', device: device.id, alert: resolved.id, rule: rule.id, message: `Offline alert ${rule.code} resolved after ${device.deviceId} recovered.` }, req)
    await queueSafely(payload, 'alert-resolved', { device: device.id, alert: resolved.id, message: resolved.message, deviceName: device.name }, req)
  }
}
