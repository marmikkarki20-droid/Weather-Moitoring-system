import type { Payload, PayloadRequest, Where } from 'payload'
import type { WeatherReading } from '@/payload-types'
import { isDashboardUser } from '@/access'

export const dashboardError = (status: number, error: string) => Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } })
export const dashboardUser = (req: PayloadRequest) => isDashboardUser(req.user)
const number = (value: unknown, fallback: number, min: number, max: number) => { const parsed = Number(value); return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback }
export const pageFrom = (req: PayloadRequest) => number(req.query.page, 1, 1, 10000)
export const limitFrom = (req: PayloadRequest) => number(req.query.limit, 25, 1, 100)
export const dateFrom = (value: unknown, fallback: Date) => { const parsed = typeof value === 'string' ? Date.parse(value) : NaN; return Number.isFinite(parsed) ? new Date(parsed) : fallback }

export async function overview(payload: Payload) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const [locations, devices, online, offline, activeAlerts, criticalAlerts, latest, readings, deviceRows] = await Promise.all([
    payload.count({ collection: 'locations', overrideAccess: true }), payload.count({ collection: 'devices', overrideAccess: true }),
    payload.count({ collection: 'devices', overrideAccess: true, where: { status: { equals: 'online' } } }), payload.count({ collection: 'devices', overrideAccess: true, where: { status: { equals: 'offline' } } }),
    payload.count({ collection: 'alerts', overrideAccess: true, where: { status: { in: ['active', 'acknowledged'] } } }), payload.count({ collection: 'alerts', overrideAccess: true, where: { and: [{ status: { in: ['active', 'acknowledged'] } }, { severity: { equals: 'critical' } }] } }),
    payload.find({ collection: 'weather-readings', overrideAccess: true, limit: 1, sort: '-serverTimestamp' }),
    payload.find({ collection: 'weather-readings', overrideAccess: true, limit: 1000, where: { serverTimestamp: { greater_than_equal: since } } }),
    payload.find({ collection: 'devices', overrideAccess: true, depth: 1, limit: 100, sort: 'name' }),
  ])
  const values = readings.docs
  const average = (key: 'temperature' | 'humidity' | 'latencyMs') => values.length ? values.reduce((sum, reading) => sum + reading[key], 0) / values.length : null
  return { totals: { locations: locations.totalDocs, devices: devices.totalDocs, online: online.totalDocs, offline: offline.totalDocs, activeAlerts: activeAlerts.totalDocs, criticalAlerts: criticalAlerts.totalDocs }, averages: { temperature: average('temperature'), humidity: average('humidity'), latencyMs: average('latencyMs') }, mostRecentReadingAt: latest.docs[0]?.serverTimestamp ?? null, devices: deviceRows.docs.map(device => ({ id: device.id, name: device.name, deviceId: device.deviceId, status: device.status, location: typeof device.location === 'object' ? device.location.name : null, latestMetrics: device.latestMetrics, lastSeen: device.lastSeen })) }
}

export async function listDevices(payload: Payload, req: PayloadRequest) {
  const page = pageFrom(req), limit = limitFrom(req), search = typeof req.query.search === 'string' ? req.query.search.slice(0, 80) : ''
  const where: Where | undefined = search ? { or: [{ name: { contains: search } }, { deviceId: { contains: search } }] } : undefined
  return payload.find({ collection: 'devices', overrideAccess: true, depth: 1, page, limit, sort: 'name', where })
}

export async function listAlerts(payload: Payload, req: PayloadRequest) {
  const page = pageFrom(req), limit = limitFrom(req), status = typeof req.query.status === 'string' ? req.query.status : undefined
  const allowed = ['active', 'acknowledged', 'resolved']; const where = allowed.includes(String(status)) ? { status: { equals: status as 'active' | 'acknowledged' | 'resolved' } } : undefined
  return payload.find({ collection: 'alerts', overrideAccess: true, depth: 1, page, limit, sort: '-lastTriggeredAt', where })
}

const buckets: Record<string, number> = { '1m': 60_000, '5m': 300_000, '15m': 900_000, '1h': 3_600_000, '1d': 86_400_000 }
export async function history(payload: Payload, req: PayloadRequest) {
  const to = dateFrom(req.query.to, new Date()); const from = dateFrom(req.query.from, new Date(to.getTime() - 24 * 60 * 60 * 1000));
  if (from >= to || to.getTime() - from.getTime() > 31 * 86_400_000) throw new Error('invalid_date_range')
  const bucket = typeof req.query.bucket === 'string' ? req.query.bucket : '1h'; if (!buckets[bucket]) throw new Error('invalid_bucket')
  const deviceId = typeof req.query.deviceId === 'string' && /^\d+$/.test(req.query.deviceId) ? Number(req.query.deviceId) : undefined
  const filters: Where[] = [{ serverTimestamp: { greater_than_equal: from.toISOString() } }, { serverTimestamp: { less_than_equal: to.toISOString() } }]
  if (deviceId) filters.push({ device: { equals: deviceId } })
  const where: Where = { and: filters }
  const rows = await payload.find({ collection: 'weather-readings', overrideAccess: true, depth: 1, limit: 5000, sort: 'serverTimestamp', where })
  const grouped = new Map<number, typeof rows.docs>()
  for (const row of rows.docs) { const key = Math.floor(Date.parse(row.serverTimestamp) / buckets[bucket]) * buckets[bucket]; grouped.set(key, [...(grouped.get(key) || []), row]) }
  const points = [...grouped.entries()].map(([time, items]) => ({ timestamp: new Date(time).toISOString(), count: items.length, temperature: aggregate(items, 'temperature'), humidity: aggregate(items, 'humidity'), pressure: aggregate(items, 'pressure'), rainfall: aggregate(items, 'rainfall'), windSpeed: aggregate(items, 'windSpeed'), battery: aggregate(items, 'battery'), latencyMs: aggregate(items, 'latencyMs') }))
  return { from: from.toISOString(), to: to.toISOString(), bucket, points, totalReadings: rows.totalDocs }
}
function aggregate(rows: WeatherReading[], key: 'temperature' | 'humidity' | 'pressure' | 'rainfall' | 'windSpeed' | 'battery' | 'latencyMs') { const values = rows.map(row => row[key]).filter(Number.isFinite); return { average: values.reduce((sum, value) => sum + value, 0) / (values.length || 1), minimum: Math.min(...values), maximum: Math.max(...values) } }
