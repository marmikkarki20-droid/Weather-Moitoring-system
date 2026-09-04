import { sql } from '@payloadcms/db-postgres'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { emailProvider, renderEmail } from '@/lib/email'
import { recordSystemEvent } from '@/lib/system-events'

const LOCK = 42003302
type Drizzle = { execute: (query: unknown) => Promise<{ rows?: Array<{ acquired?: boolean }> }> }
const db = (payload: Awaited<ReturnType<typeof getPayload>>) => (payload.db as unknown as { drizzle: Drizzle }).drizzle
const maxAttempts = () => Math.max(1, Number(process.env.NOTIFICATION_MAX_ATTEMPTS || 5))
async function run(payload: Awaited<ReturnType<typeof getPayload>>) {
  const drizzle = db(payload); const lock = await drizzle.execute(sql`SELECT pg_try_advisory_lock(${LOCK}) AS acquired`); if (!lock.rows?.[0]?.acquired) return
  try {
    const now = new Date().toISOString(); const jobs = await payload.find({ collection: 'notification-outbox', overrideAccess: true, limit: 25, where: { and: [{ status: { in: ['pending', 'retry'] } }, { nextAttemptAt: { less_than_equal: now } }] }, sort: 'nextAttemptAt' })
    for (const job of jobs.docs) {
      const locked = await payload.update({ collection: 'notification-outbox', id: job.id, overrideAccess: true, data: { status: 'processing', lockedAt: now, lockedBy: `notifications-${process.pid}` } })
      try { const rendered = locked.templateData && typeof locked.templateData === 'object' && 'rendered' in locked.templateData ? locked.templateData.rendered as { html: string; text: string } : renderEmail(locked.subject, {}); const result = await emailProvider().send({ to: locked.recipientEmail, subject: locked.subject, html: rendered.html, text: rendered.text }); await payload.update({ collection: 'notification-outbox', id: locked.id, overrideAccess: true, data: { status: 'sent', sentAt: new Date().toISOString(), providerMessageId: result.id, attemptCount: locked.attemptCount + 1 } }); await recordSystemEvent(payload, { eventType: 'notification-sent', severity: 'info', source: 'payload-admin', message: `Notification ${locked.id} sent.` }) } catch (error) { const attempts = locked.attemptCount + 1; const category = error instanceof Error ? error.message : 'delivery_failure'; if (attempts >= maxAttempts() || category === 'provider_configuration' || category === 'invalid_recipient') { await payload.update({ collection: 'notification-outbox', id: locked.id, overrideAccess: true, data: { status: 'failed', attemptCount: attempts, lastErrorCategory: category, lastErrorMessage: 'Delivery failed.' } }); await recordSystemEvent(payload, { eventType: 'notification-failed', severity: 'warning', source: 'payload-admin', message: `Notification ${locked.id} failed.` }) } else { const delay = Math.min(Number(process.env.NOTIFICATION_RETRY_MAX_SECONDS || 3600), Number(process.env.NOTIFICATION_RETRY_MIN_SECONDS || 30) * 2 ** attempts); await payload.update({ collection: 'notification-outbox', id: locked.id, overrideAccess: true, data: { status: 'retry', attemptCount: attempts, nextAttemptAt: new Date(Date.now() + delay * 1000).toISOString(), lastErrorCategory: category, lastErrorMessage: 'Temporary delivery failure.' } }); await recordSystemEvent(payload, { eventType: 'notification-retry-scheduled', severity: 'warning', source: 'payload-admin', message: `Notification ${locked.id} retry scheduled.` }) } }
    }
  } finally { await drizzle.execute(sql`SELECT pg_advisory_unlock(${LOCK})`) }
}
async function main() { if (process.env.NOTIFICATION_WORKER_ENABLED === 'false') return; const payload = await getPayload({ config }); const interval = Math.max(1, Number(process.env.NOTIFICATION_WORKER_INTERVAL_SECONDS || 10)); await run(payload); const timer = setInterval(() => void run(payload), interval * 1000); const stop = () => { clearInterval(timer); process.exit(0) }; process.on('SIGINT', stop); process.on('SIGTERM', stop) }
main().catch(error => { console.error('Notification worker failed:', error); process.exit(1) })
