import { randomUUID } from 'node:crypto'
import type { Endpoint } from 'payload'
import { isAdminUser } from '@/access'
import { dashboardEventHub } from '@/lib/dashboard-events'
import { publishSimulationCommand } from '@/lib/mqtt-command-publisher'
import { acknowledgementSchema, commandRequestSchema, validTransition } from '@/lib/simulation'
import { recordSystemEvent } from '@/lib/system-events'

const reply = (status: number, body: Record<string, string>) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
const labEnabled = () => process.env.SIMULATION_LAB_ENABLED === 'true' && (process.env.NODE_ENV !== 'production' || process.env.DEMO_MODE_ENABLED === 'true')

export const createSimulationCommandEndpoint: Endpoint = { path: '/simulation/commands', method: 'post', handler: async req => {
  if (!isAdminUser(req.user)) return reply(403, { error: 'administrator_required' })
  if (!labEnabled()) return reply(403, { error: 'simulation_lab_disabled' })
  let body: unknown = req.data; if (typeof body === 'undefined' && req.json) try { body = await req.json() } catch { return reply(400, { error: 'invalid_command' }) }
  const parsed = commandRequestSchema.safeParse(body); if (!parsed.success) return reply(400, { error: 'invalid_command' })
  const devices = await req.payload.find({ collection: 'devices', overrideAccess: true, limit: 1, where: { deviceId: { equals: parsed.data.deviceId } } }); const device = devices.docs[0]
  if (!device) return reply(404, { error: 'device_not_found' }); if (!device.simulationEnabled) return reply(409, { error: 'simulation_disabled_for_device' })
  const commandId = randomUUID(), issuedAt = new Date(), expiresAt = new Date(issuedAt.getTime() + ((parsed.data.durationSeconds || 60) + 60) * 1000)
  const command = await req.payload.create({ collection: 'simulation-commands', overrideAccess: true, data: { commandId, device: device.id, commandType: parsed.data.commandType, status: 'queued', parameters: parsed.data.parameters, durationSeconds: parsed.data.durationSeconds, issuedBy: req.user!.id, issuedAt: issuedAt.toISOString(), expiresAt: expiresAt.toISOString() } })
  try {
    await publishSimulationCommand(device.deviceId, { schemaVersion: 1, commandId, deviceId: device.deviceId, commandType: command.commandType, durationSeconds: command.durationSeconds, parameters: command.parameters, issuedAt: command.issuedAt, expiresAt: command.expiresAt })
    await req.payload.update({ collection: 'simulation-commands', id: command.id, overrideAccess: true, data: { status: 'published', publishedAt: new Date().toISOString() } })
    await recordSystemEvent(req.payload, { eventType: 'simulation-command-published', severity: 'info', source: 'payload-admin', device: device.id, user: req.user!.id, message: `Simulation command ${command.commandType} published for ${device.deviceId}.` })
    dashboardEventHub.publish('system.status', { simulationCommandId: command.id, status: 'published' })
    return Response.json({ id: command.id, commandId, status: 'published', expiresAt: expiresAt.toISOString() }, { status: 201 })
  } catch {
    await req.payload.update({ collection: 'simulation-commands', id: command.id, overrideAccess: true, data: { status: 'failed', failureReason: 'MQTT publication failed.' } })
    await recordSystemEvent(req.payload, { eventType: 'simulation-failed', severity: 'warning', source: 'payload-admin', device: device.id, user: req.user!.id, message: `Simulation command ${command.commandType} could not be published.` })
    return reply(503, { error: 'command_publication_failed' })
  }
} }

export const simulationAcknowledgementEndpoint: Endpoint = { path: '/simulation/acknowledgements', method: 'post', handler: async req => {
  if (!req.user || req.user.collection !== 'service-accounts' || req.user.active !== true) return reply(401, { error: 'gateway_authentication_required' })
  const parsed = acknowledgementSchema.safeParse(req.data); if (!parsed.success) return reply(400, { error: 'invalid_acknowledgement' })
  const found = await req.payload.find({ collection: 'simulation-commands', overrideAccess: true, limit: 1, where: { commandId: { equals: parsed.data.commandId } } }); const command = found.docs[0]
  if (!command || (typeof command.device === 'object' ? command.device.deviceId : undefined) !== parsed.data.deviceId) return reply(404, { error: 'command_not_found' })
  if (!validTransition(command.status, parsed.data.status)) return reply(409, { error: 'invalid_transition' })
  const at = parsed.data.timestamp; const patch: Record<string, unknown> = { status: parsed.data.status }
  if (parsed.data.status === 'acknowledged') patch.acknowledgedAt = at; if (parsed.data.status === 'running') patch.startedAt = at; if (['completed', 'failed', 'cancelled', 'expired'].includes(parsed.data.status)) patch.completedAt = at
  const updated = await req.payload.update({ collection: 'simulation-commands', id: command.id, overrideAccess: true, data: patch })
  await recordSystemEvent(req.payload, { eventType: parsed.data.status === 'running' ? 'simulation-started' : parsed.data.status === 'completed' ? 'simulation-completed' : 'simulation-command-acknowledged', severity: parsed.data.status === 'failed' ? 'warning' : 'info', source: 'telemetry-ingestion', device: typeof updated.device === 'object' ? updated.device.id : updated.device, serviceAccount: req.user.id, message: `Simulation command ${updated.commandType} is ${parsed.data.status}.` })
  dashboardEventHub.publish('system.status', { simulationCommandId: updated.id, status: updated.status })
  return reply(200, { status: updated.status })
} }
