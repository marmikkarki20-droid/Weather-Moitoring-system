import PDFDocument from 'pdfkit'
import type { Payload, PayloadRequest, Where } from 'payload'
import { z } from 'zod'
import { isDashboardUser } from '@/access'
import { recordSystemEvent } from '@/lib/system-events'

const types = ['weather', 'alerts', 'devices', 'system-events', 'simulation'] as const
const formats = ['csv', 'pdf'] as const
export const reportQuery = z.object({ type: z.enum(types), format: z.enum(formats), from: z.string().datetime().optional(), to: z.string().datetime().optional(), deviceId: z.coerce.number().int().positive().optional(), status: z.string().max(30).optional() })
export type ReportQuery = z.infer<typeof reportQuery>
export const reportAllowed = (req: PayloadRequest) => isDashboardUser(req.user)

export function parseReportQuery(input: Record<string, unknown>): ReportQuery {
  const parsed = reportQuery.parse(input); const to = parsed.to ? new Date(parsed.to) : new Date(); const from = parsed.from ? new Date(parsed.from) : new Date(to.getTime() - 24 * 60 * 60 * 1000)
  if (from >= to || to.getTime() - from.getTime() > 31 * 86_400_000) throw new Error('invalid_date_range')
  return { ...parsed, from: from.toISOString(), to: to.toISOString() }
}
const text = (value: unknown) => { const rendered = value === null || value === undefined ? '' : String(value); return /^[=+@]/.test(rendered) ? `'${rendered}` : rendered }
export function csv(rows: Array<Record<string, unknown>>, columns: Array<[string, string]>) { const row = (items: string[]) => items.map(value => `"${value.replaceAll('"', '""')}"`).join(','); return [row(columns.map(([label]) => label)), ...rows.map(item => row(columns.map(([, key]) => text(item[key]))))].join('\r\n') + '\r\n' }

export async function reportRows(payload: Payload, query: ReportQuery) {
  const dateWhere = { and: [{ createdAt: { greater_than_equal: query.from } }, { createdAt: { less_than_equal: query.to } }] }
  if (query.type === 'weather') { const filters: Where[] = [{ serverTimestamp: { greater_than_equal: query.from! } }, { serverTimestamp: { less_than_equal: query.to! } }]; if (query.deviceId) filters.push({ device: { equals: query.deviceId } }); const where: Where = { and: filters }; const result = await payload.find({ collection: 'weather-readings', overrideAccess: true, depth: 1, limit: 5000, sort: 'serverTimestamp', where }); return result.docs.map(row => ({ timestamp: row.serverTimestamp, device: typeof row.device === 'object' ? row.device.deviceId : row.device, temperatureC: row.temperature, humidityPercent: row.humidity, pressureHpa: row.pressure, rainfallMm: row.rainfall, windSpeedKmh: row.windSpeed, batteryPercent: row.battery, latencyMs: row.latencyMs })) }
  if (query.type === 'alerts') { const result = await payload.find({ collection: 'alerts', overrideAccess: true, depth: 1, limit: 5000, sort: '-lastTriggeredAt' }); return result.docs.map(alert => ({ severity: alert.severity, status: alert.status, device: typeof alert.device === 'object' ? alert.device.deviceId : alert.device, message: alert.message, firstTriggeredAt: alert.firstTriggeredAt, lastTriggeredAt: alert.lastTriggeredAt, occurrenceCount: alert.occurrenceCount, resolutionReason: alert.resolutionReason })) }
  if (query.type === 'devices') { const result = await payload.find({ collection: 'devices', overrideAccess: true, depth: 1, limit: 500 }); return result.docs.map(device => ({ deviceId: device.deviceId, name: device.name, status: device.status, location: typeof device.location === 'object' ? device.location.name : '', lastSeen: device.lastSeen, batteryPercent: device.latestMetrics?.battery })) }
  if (query.type === 'system-events') { const result = await payload.find({ collection: 'system-events', overrideAccess: true, limit: 5000, sort: '-occurredAt', where: dateWhere }); return result.docs.map(event => ({ eventType: event.eventType, severity: event.severity, source: event.source, message: event.message, occurredAt: event.occurredAt })) }
  const result = await payload.find({ collection: 'simulation-commands', overrideAccess: true, depth: 1, limit: 1000, sort: '-issuedAt' }); return result.docs.map(command => ({ commandId: command.commandId, scenario: command.commandType, status: command.status, issuedAt: command.issuedAt, acknowledgedAt: command.acknowledgedAt, completedAt: command.completedAt, outcome: command.failureReason || 'Not observed' }))
}
export function columnsFor(type: ReportQuery['type']): Array<[string, string]> {
  if (type === 'weather') return [['Timestamp (UTC)', 'timestamp'], ['Device', 'device'], ['Temperature (C)', 'temperatureC'], ['Humidity (%)', 'humidityPercent'], ['Pressure (hPa)', 'pressureHpa'], ['Rainfall (mm)', 'rainfallMm'], ['Wind (km/h)', 'windSpeedKmh'], ['Battery (%)', 'batteryPercent'], ['Latency (ms)', 'latencyMs']]
  if (type === 'alerts') return [['Severity', 'severity'], ['Status', 'status'], ['Device', 'device'], ['Message', 'message'], ['First triggered (UTC)', 'firstTriggeredAt'], ['Last triggered (UTC)', 'lastTriggeredAt'], ['Occurrences', 'occurrenceCount'], ['Resolution reason', 'resolutionReason']]
  if (type === 'devices') return [['Device ID', 'deviceId'], ['Name', 'name'], ['Status', 'status'], ['Location', 'location'], ['Last seen (UTC)', 'lastSeen'], ['Battery (%)', 'batteryPercent']]
  if (type === 'system-events') return [['Event type', 'eventType'], ['Severity', 'severity'], ['Source', 'source'], ['Message', 'message'], ['Occurred at (UTC)', 'occurredAt']]
  return [['Command ID', 'commandId'], ['Scenario', 'scenario'], ['Status', 'status'], ['Issued at (UTC)', 'issuedAt'], ['Acknowledged at (UTC)', 'acknowledgedAt'], ['Completed at (UTC)', 'completedAt'], ['Outcome', 'outcome']]
}
export async function pdf(title: string, rows: Array<Record<string, unknown>>, columns: Array<[string, string]>, query: ReportQuery) { const document = new PDFDocument({ margin: 48 }); const chunks: Buffer[] = []; document.on('data', (chunk: Buffer) => chunks.push(chunk)); const done = new Promise<Buffer>(resolve => document.on('end', () => resolve(Buffer.concat(chunks)))); document.fontSize(20).text('WeatherGrid'); document.fontSize(14).text(title); document.moveDown().fontSize(9).text(`Generated: ${new Date().toISOString()}\nRange (UTC): ${query.from} to ${query.to}\nRecords: ${rows.length}`); document.moveDown(); for (const item of rows.slice(0, 500)) { const line = columns.map(([label, key]) => `${label}: ${text(item[key])}`).join(' | '); document.fontSize(8).text(line, { width: 500 }); } document.moveDown().fontSize(8).text('Generated IoT readings for an academic WeatherGrid project.', { align: 'center' }); document.end(); return done }
export async function auditExport(payload: Payload, req: PayloadRequest, query: ReportQuery, count: number) { await recordSystemEvent(payload, { eventType: 'report-exported', severity: 'info', source: 'payload-admin', user: req.user && 'role' in req.user ? req.user.id : undefined, message: `${query.type} report exported as ${query.format}.`, metadata: { reportType: query.type, format: query.format, from: query.from, to: query.to, recordCount: count } }) }
