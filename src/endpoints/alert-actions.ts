import type { Endpoint } from 'payload'
import { isAdminUser } from '@/access'
import { recordSystemEvent } from '@/lib/system-events'
import { dashboardEventHub } from '@/lib/dashboard-events'

const json = (status: number, body: Record<string, string>) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

async function getAlert(req: Parameters<Endpoint['handler']>[0]) {
  const id = String(req.routeParams?.id || '')
  if (!id) return null
  try { return await req.payload.findByID({ collection: 'alerts', id, overrideAccess: true }) } catch { return null }
}

export const acknowledgeAlertEndpoint: Endpoint = {
  path: '/alerts/:id/acknowledge', method: 'post',
  handler: async req => {
    if (!isAdminUser(req.user)) return json(403, { error: 'administrator_required' })
    const alert = await getAlert(req)
    if (!alert) return json(404, { error: 'alert_not_found' })
    if (alert.status === 'resolved') return json(200, { status: 'already_resolved' })
    if (alert.status === 'acknowledged') return json(200, { status: 'already_acknowledged' })
    const updated = await req.payload.update({ collection: 'alerts', id: alert.id, overrideAccess: true, data: { status: 'acknowledged', acknowledgedAt: new Date().toISOString(), acknowledgedBy: req.user!.id } })
    await recordSystemEvent(req.payload, { eventType: 'alert-acknowledged', severity: 'info', source: 'payload-admin', device: typeof updated.device === 'object' ? updated.device.id : updated.device, alert: updated.id, rule: typeof updated.rule === 'object' ? updated.rule.id : updated.rule, user: req.user!.id, message: `Alert ${updated.id} acknowledged by an administrator.` })
    dashboardEventHub.publish('alert.updated', { id: updated.id, status: 'acknowledged', severity: updated.severity })
    return json(200, { status: 'acknowledged' })
  },
}

export const resolveAlertEndpoint: Endpoint = {
  path: '/alerts/:id/resolve', method: 'post',
  handler: async req => {
    if (!isAdminUser(req.user)) return json(403, { error: 'administrator_required' })
    const alert = await getAlert(req)
    if (!alert) return json(404, { error: 'alert_not_found' })
    if (alert.status === 'resolved') return json(200, { status: 'already_resolved' })
    let body: unknown = req.data
    if (typeof body === 'undefined' && req.json) try { body = await req.json() } catch { body = undefined }
    const reason = typeof body === 'object' && body && 'reason' in body ? String((body as { reason?: unknown }).reason || '').trim() : ''
    if (!reason) return json(400, { error: 'resolution_reason_required' })
    const updated = await req.payload.update({ collection: 'alerts', id: alert.id, overrideAccess: true, data: { status: 'resolved', resolvedAt: new Date().toISOString(), resolvedBy: req.user!.id, resolutionReason: reason } })
    await recordSystemEvent(req.payload, { eventType: 'alert-resolved', severity: 'info', source: 'payload-admin', device: typeof updated.device === 'object' ? updated.device.id : updated.device, alert: updated.id, rule: typeof updated.rule === 'object' ? updated.rule.id : updated.rule, user: req.user!.id, message: `Alert ${updated.id} manually resolved by an administrator.` })
    dashboardEventHub.publish('alert.updated', { id: updated.id, status: 'resolved', severity: updated.severity })
    return json(200, { status: 'resolved' })
  },
}
