'use client'

import { createContext, useContext, useEffect, useRef, useState } from 'react'

type State = 'connecting' | 'connected' | 'reconnecting' | 'disconnected'
type DashboardEvent = { type: string; data: Record<string, unknown> }
const RealtimeContext = createContext<{ state: State; lastEvent: DashboardEvent | null; stale: boolean }>({ state: 'connecting', lastEvent: null, stale: false })

export function DashboardRealtimeProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>('connecting'), [lastEvent, setLastEvent] = useState<DashboardEvent | null>(null), [stale, setStale] = useState(false)
  const retries = useRef(0)
  useEffect(() => {
    let source: EventSource | undefined, stopped = false
    const connect = () => {
      if (stopped) return
      setState(retries.current ? 'reconnecting' : 'connecting')
      source = new EventSource('/api/dashboard/stream')
      const receive = (event: MessageEvent) => { try { setLastEvent({ type: event.type, data: JSON.parse(event.data) as Record<string, unknown> }); setStale(false) } catch {} }
      ;['connected', 'reading.created', 'device.updated', 'alert.created', 'alert.updated', 'system.status', 'heartbeat'].forEach(type => source?.addEventListener(type, receive))
      source.onopen = () => { retries.current = 0; setState('connected'); setStale(false) }
      source.onerror = () => { source?.close(); retries.current += 1; setState('disconnected'); setStale(true); if (retries.current <= 8) window.setTimeout(connect, Math.min(30_000, 1000 * 2 ** retries.current)) }
    }
    connect()
    return () => { stopped = true; source?.close() }
  }, [])
  return <RealtimeContext.Provider value={{ state, lastEvent, stale }}>{children}</RealtimeContext.Provider>
}
export const useDashboardRealtime = () => useContext(RealtimeContext)
export function ConnectionStatus() { const { state, stale } = useDashboardRealtime(); return <span aria-live="polite" className={`rounded-full border px-2 py-1 text-xs ${state === 'connected' ? 'border-emerald-500/40 text-emerald-700 dark:text-emerald-300' : 'border-amber-500/40 text-amber-700 dark:text-amber-300'}`}>{state}{stale ? ' · data may be stale' : ''}</span> }
