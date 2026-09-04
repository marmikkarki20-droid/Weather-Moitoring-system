import type { Payload, PayloadRequest } from 'payload'
import { renderEmail } from './email'

type EventType = 'alert-created' | 'alert-escalated' | 'alert-resolved' | 'device-offline' | 'device-recovered'
const preferenceField: Record<EventType, string> = { 'alert-created': 'alertCreated', 'alert-escalated': 'alertEscalated', 'alert-resolved': 'alertResolved', 'device-offline': 'deviceOffline', 'device-recovered': 'deviceRecovered' }
export async function queueNotifications(payload: Payload, eventType: EventType, input: { device: number; alert?: number; severity?: 'warning' | 'critical'; message: string; deviceName: string; locationName?: string }, req?: Partial<PayloadRequest>) {
  const preferences = await payload.find({ collection: 'notification-preferences', overrideAccess: true, req, limit: 1000, where: { emailEnabled: { equals: true } }, depth: 1 })
  for (const preference of preferences.docs) {
    if (!preference[preferenceField[eventType] as keyof typeof preference]) continue
    if (input.severity === 'warning' && preference.minimumSeverity === 'critical') continue
    if (!preference.allDevices && !(preference.selectedDevices || []).some(item => (typeof item === 'object' ? item.id : item) === input.device)) continue
    const recipient = typeof preference.user === 'object' ? preference.user : null
    if (!recipient?.email) continue
    const key = `${eventType}:${input.alert || input.device}:user:${recipient.id}`
    try { const rendered = renderEmail(eventType.replace('-', ' '), { ...input }); await payload.create({ collection: 'notification-outbox', overrideAccess: true, req, data: { idempotencyKey: key, notificationType: eventType, recipientUser: recipient.id, recipientEmail: recipient.email, alert: input.alert, device: input.device, status: 'pending', subject: `WeatherGrid: ${eventType.replace('-', ' ')}`, templateData: { ...input, rendered }, attemptCount: 0, nextAttemptAt: new Date().toISOString() } }) } catch (error) { if (!(error instanceof Error) || !error.message.includes('duplicate')) throw error }
  }
}
