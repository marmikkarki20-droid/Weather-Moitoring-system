import type { Endpoint } from 'payload'
import { isDashboardUser } from '@/access'
import { recordSystemEvent } from '@/lib/system-events'

const answer = (status: number, body: Record<string, unknown>) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
const currentUser = (user: unknown) => isDashboardUser(user) && user && typeof user === 'object' && 'id' in user ? user as { id: number; role?: string } : null

export const notificationEndpoints: Endpoint[] = [
  { path: '/notifications/preferences', method: 'get', handler: async req => { const user = currentUser(req.user); if (!user) return answer(401, { error: 'dashboard_authentication_required' }); const result = await req.payload.find({ collection: 'notification-preferences', overrideAccess: true, limit: 1, where: { user: { equals: user.id } } }); return answer(200, { preference: result.docs[0] || null }) } },
  { path: '/notifications/preferences', method: 'post', handler: async req => {
    const user = currentUser(req.user); if (!user) return answer(401, { error: 'dashboard_authentication_required' })
    let body: Record<string, unknown> = {}; try { body = req.data && typeof req.data === 'object' ? req.data as Record<string, unknown> : req.json ? await req.json() as Record<string, unknown> : {} } catch { return answer(400, { error: 'invalid_preferences' }) }
    const minimumSeverity: 'warning' | 'critical' = body.minimumSeverity === 'critical' ? 'critical' : 'warning'
    const safe = { emailEnabled: body.emailEnabled === true, minimumSeverity, alertCreated: body.alertCreated !== false, alertEscalated: body.alertEscalated !== false, alertResolved: body.alertResolved !== false, deviceOffline: body.deviceOffline !== false, deviceRecovered: body.deviceRecovered !== false, allDevices: body.allDevices !== false, quietHoursEnabled: body.quietHoursEnabled === true, timezone: typeof body.timezone === 'string' && body.timezone.length < 80 ? body.timezone : 'UTC', dailyDigestEnabled: body.dailyDigestEnabled === true, weeklyDigestEnabled: body.weeklyDigestEnabled === true, includePDFReport: body.includePDFReport === true }
    const existing = await req.payload.find({ collection: 'notification-preferences', overrideAccess: true, limit: 1, where: { user: { equals: user.id } } })
    const preference = existing.docs[0] ? await req.payload.update({ collection: 'notification-preferences', id: existing.docs[0].id, overrideAccess: true, data: safe }) : await req.payload.create({ collection: 'notification-preferences', overrideAccess: true, data: { user: user.id, ...safe } })
    await recordSystemEvent(req.payload, { eventType: 'notification-preferences-updated', severity: 'info', source: 'payload-admin', user: user.id, message: 'Notification preferences updated.' })
    return answer(200, { preference })
  } },
  { path: '/notifications/history', method: 'get', handler: async req => { const user = currentUser(req.user); if (!user) return answer(401, { error: 'dashboard_authentication_required' }); const history = await req.payload.find({ collection: 'notification-outbox', overrideAccess: true, limit: 50, sort: '-createdAt', where: user.role === 'admin' ? undefined : { recipientUser: { equals: user.id } } }); return answer(200, { docs: history.docs }) } },
]
