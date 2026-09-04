import type { Endpoint } from 'payload'
import { isDashboardUser } from '@/access'
import { dashboardEventHub } from '@/lib/dashboard-events'

const encoder = new TextEncoder()
const message = (event: string, data: Record<string, unknown>, id?: number) => encoder.encode(`${id ? `id: ${id}\n` : ''}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)

export const dashboardStreamEndpoint: Endpoint = {
  path: '/dashboard/stream', method: 'get',
  handler: req => {
    if (!isDashboardUser(req.user)) return Response.json({ error: 'dashboard_authentication_required' }, { status: 401 })
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(message('connected', { status: 'connected', occurredAt: new Date().toISOString() }))
        const unsubscribe = dashboardEventHub.subscribe(event => controller.enqueue(message(event.type, { ...event.data, occurredAt: event.occurredAt }, event.id)))
        const heartbeat = setInterval(() => controller.enqueue(message('heartbeat', { occurredAt: new Date().toISOString() })), 20_000)
        req.signal?.addEventListener('abort', () => { clearInterval(heartbeat); unsubscribe(); try { controller.close() } catch {} }, { once: true })
      },
      cancel() { /* abort listener releases resources for browser disconnects */ },
    })
    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' } })
  },
}
