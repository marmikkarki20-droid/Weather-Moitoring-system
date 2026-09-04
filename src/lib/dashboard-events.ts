export type DashboardEventType = 'reading.created' | 'device.updated' | 'alert.created' | 'alert.updated' | 'system.status'
export type DashboardEvent = { id: number; type: DashboardEventType; data: Record<string, unknown>; occurredAt: string }

type Listener = (event: DashboardEvent) => void
const listeners = new Set<Listener>()
let nextId = 1

/** Single-process event fan-out. Database API revalidation recovers missed events. */
export const dashboardEventHub = {
  subscribe(listener: Listener) { listeners.add(listener); return () => listeners.delete(listener) },
  publish(type: DashboardEventType, data: Record<string, unknown>) {
    const event = { id: nextId++, type, data, occurredAt: new Date().toISOString() }
    for (const listener of listeners) listener(event)
    return event
  },
  size: () => listeners.size,
}
