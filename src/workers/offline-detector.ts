import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'
import { ruleAppliesToDevice, type DeviceLike, type RuleLike } from '@/lib/alert-engine'
import { recordSystemEvent } from '@/lib/system-events'
import { queueNotifications } from '@/lib/notifications'

const LOCK_ID = 42003301
type Drizzle = { execute: (query: unknown) => Promise<{ rows?: Array<{ acquired?: boolean }> }> }
const database = (payload: Payload) => (payload.db as unknown as { drizzle: Drizzle }).drizzle

function offlineSnapshot(rule: RuleLike) {
  return { offlineMultiplier: rule.offlineMultiplier, minimumOfflineSeconds: rule.minimumOfflineSeconds, cooldownSeconds: rule.cooldownSeconds }
}

export async function runOfflineDetection(payload: Payload, now = new Date()): Promise<{ acquired: boolean; offline: number }> {
  const drizzle = database(payload)
  const lock = await drizzle.execute(sql`SELECT pg_try_advisory_lock(${LOCK_ID}) AS acquired`)
  if (!lock.rows?.[0]?.acquired) return { acquired: false, offline: 0 }
  try {
    const [devices, rules] = await Promise.all([
      payload.find({ collection: 'devices', depth: 1, limit: 1000, overrideAccess: true }),
      payload.find({ collection: 'alert-rules', depth: 0, limit: 100, overrideAccess: true, where: { and: [{ enabled: { equals: true } }, { ruleType: { equals: 'device-offline' } }] } }),
    ])
    let offline = 0
    for (const rawDevice of devices.docs) {
      const device = rawDevice as unknown as DeviceLike & { active: boolean; status: string; lastSeen?: string; publishingIntervalSeconds: number }
      if (!device.active || device.status === 'maintenance') continue
      if (!device.lastSeen) {
        payload.logger.warn({ msg: 'Offline detection skipped device without lastSeen', deviceId: device.deviceId })
        continue
      }
      for (const rawRule of rules.docs) {
        const rule = rawRule as unknown as RuleLike & { offlineMultiplier: number; minimumOfflineSeconds: number }
        if (!ruleAppliesToDevice(rule, device)) continue
        const thresholdSeconds = Math.max(device.publishingIntervalSeconds * rule.offlineMultiplier, rule.minimumOfflineSeconds)
        if (now.getTime() - Date.parse(device.lastSeen) <= thresholdSeconds * 1000) continue
        const existing = await payload.find({ collection: 'alerts', overrideAccess: true, limit: 1, where: { and: [{ device: { equals: device.id } }, { rule: { equals: rule.id } }, { status: { in: ['active', 'acknowledged'] } }] } })
        if (existing.docs[0]) continue
        try {
          const created = await payload.create({ collection: 'alerts', overrideAccess: true, data: { device: device.id, rule: rule.id, type: 'device-offline', severity: 'critical', status: 'active', message: rule.messageTemplate || `CRITICAL: ${device.name} has not reported telemetry for more than ${thresholdSeconds} seconds.`, thresholdSnapshot: offlineSnapshot(rule), occurrenceCount: 1, firstTriggeredAt: now.toISOString(), lastTriggeredAt: now.toISOString(), metadata: { lastSeen: device.lastSeen, thresholdSeconds } } })
          await payload.update({ collection: 'devices', id: device.id, overrideAccess: true, data: { status: 'offline' } })
          await recordSystemEvent(payload, { eventType: 'device-offline', severity: 'critical', source: 'offline-worker', device: device.id, alert: created.id, rule: rule.id, message: `${device.deviceId} was marked offline after ${thresholdSeconds} seconds without telemetry.`, metadata: { thresholdSeconds } })
          try { await queueNotifications(payload, 'device-offline', { device: device.id, alert: created.id, severity: 'critical', message: created.message, deviceName: device.name }) } catch (error) { payload.logger.error({ msg: 'Offline notification enqueue failed', error: error instanceof Error ? error.message : 'unknown' }) }
          offline += 1
        } catch (error) {
          if (!(error instanceof Error) || !error.message.includes('duplicate')) throw error
        }
      }
    }
    return { acquired: true, offline }
  } finally {
    await drizzle.execute(sql`SELECT pg_advisory_unlock(${LOCK_ID})`)
  }
}
