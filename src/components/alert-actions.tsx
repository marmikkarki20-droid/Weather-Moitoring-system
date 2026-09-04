'use client'

import { useState } from 'react'

export function AlertActions({ alertId }: { alertId: number }) {
  const [message, setMessage] = useState<string | null>(null)
  const call = async (action: 'acknowledge' | 'resolve') => {
    const reason = action === 'resolve' ? window.prompt('Resolution reason (required):')?.trim() : undefined
    if (action === 'resolve' && !reason) return
    const response = await fetch(`/api/alerts/${alertId}/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: reason ? JSON.stringify({ reason }) : undefined })
    setMessage(response.ok ? `${action}d; refresh to see the latest state.` : 'Action was not completed.')
  }
  return <div className="flex flex-col gap-1"><div className="flex gap-2"><button className="rounded border px-2 py-1 text-xs" onClick={() => void call('acknowledge')}>Acknowledge</button><button className="rounded border px-2 py-1 text-xs" onClick={() => void call('resolve')}>Resolve</button></div>{message && <span className="text-xs text-muted-foreground">{message}</span>}</div>
}
