'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useDashboardRealtime } from '@/components/dashboard-realtime'
import { RefreshCw } from 'lucide-react'

type Mode = 'live' | 'history' | 'devices' | 'alerts' | 'system'
type DeviceOption = { id: number; name: string; deviceId: string; location?: { name?: string } | number | null }

export function DashboardDataPanel({ mode, deviceId }: { mode: Mode; deviceId?: string }) {
  const { lastEvent, stale } = useDashboardRealtime()
  const [data, setData] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [devices, setDevices] = useState<DeviceOption[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState(deviceId ?? '')
  const supportsStationFilter = mode === 'live' || mode === 'history'
  const effectiveDeviceId = deviceId ?? selectedDeviceId
  const url = useMemo(() => mode === 'history' ? `/api/dashboard/history?bucket=1h${effectiveDeviceId ? `&deviceId=${effectiveDeviceId}` : ''}` : mode === 'live' ? `/api/dashboard/live?bucket=1m${effectiveDeviceId ? `&deviceId=${effectiveDeviceId}` : ''}` : `/api/dashboard/${mode}`, [mode, effectiveDeviceId])
  const load = useCallback(async () => { try { const response = await fetch(url); const body = await response.json() as Record<string, unknown>; if (!response.ok) throw new Error(String(body.error || 'Unable to load dashboard data')); setData(body); setError(null) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load dashboard data') } }, [url])
  useEffect(() => { setSelectedDeviceId(deviceId ?? '') }, [deviceId])
  useEffect(() => {
    if (!supportsStationFilter || deviceId) return
    void fetch('/api/dashboard/devices?limit=100').then(async response => {
      const body = await response.json() as { docs?: DeviceOption[] }
      if (response.ok) setDevices(body.docs ?? [])
    })
  }, [supportsStationFilter, deviceId])
  useEffect(() => { void load() }, [load])
  useEffect(() => { if (lastEvent?.type === 'reading.created' || lastEvent?.type.startsWith('alert.')) { const timer = window.setTimeout(() => void load(), 700); return () => window.clearTimeout(timer) } }, [lastEvent, load])
  if (error) return <div role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm">{error}</div>
  if (!data) return <div className="animate-pulse rounded-lg border border-border bg-white p-6 text-sm text-muted-foreground">Loading operational data...</div>
  if (mode === 'system') return <section><div className="page-heading"><div><p className="eyebrow">Infrastructure</p><h1>System health</h1><p>Backend, database, and inferred telemetry availability.</p></div></div><dl className="stat-grid">{Object.entries(data).map(([key, value]) => <div key={key} className="stat-card"><dt className="text-[9px] font-bold uppercase text-muted-foreground">{key.replaceAll(/([A-Z])/g, ' $1')}</dt><dd className="mt-4 break-words text-sm font-semibold text-[#24434a]">{typeof value === 'string' || typeof value === 'number' ? String(value) : JSON.stringify(value)}</dd></div>)}</dl></section>
  if (mode === 'devices') { const docs = (data.docs || []) as Array<Record<string, unknown>>; return <section><div className="page-heading"><div><p className="eyebrow">Fleet management</p><h1>Devices</h1><p>{data.totalDocs as number} configured weather stations.</p></div></div><div className="panel overflow-x-auto"><table className="w-full"><thead><tr><th>Device</th><th>Status</th><th>Last seen</th><th>Latest metrics</th></tr></thead><tbody>{docs.map(device => <tr key={String(device.id)}><td><Link className="underline" href={`/dashboard/devices/${device.id}`}>{String(device.name)}</Link><br /><span className="text-[9px] text-muted-foreground">{String(device.deviceId)}</span></td><td><span className={`status-badge status-${String(device.status)}`}>{String(device.status)}</span></td><td>{format(device.lastSeen)}</td><td>{metricText(device.latestMetrics)}</td></tr>)}</tbody></table></div></section> }
  if (mode === 'alerts') { const docs = (data.docs || []) as Array<Record<string, unknown>>; return <section><div className="page-heading"><div><p className="eyebrow">Incident management</p><h1>Alerts</h1><p>Review threshold breaches and device events.</p></div></div><div className="panel overflow-x-auto"><table className="w-full"><thead><tr><th>Severity</th><th>Status</th><th>Message</th><th>Triggered</th></tr></thead><tbody>{docs.map(alert => <tr key={String(alert.id)}><td><span className={`status-badge status-${String(alert.severity)}`}>{String(alert.severity)}</span></td><td className="uppercase">{String(alert.status)}</td><td>{String(alert.message)}</td><td>{format(alert.lastTriggeredAt)}</td></tr>)}</tbody></table>{!docs.length && <p className="empty-state">No alerts match the current filter.</p>}</div></section> }
  const points = (data.points || []) as Array<Record<string, unknown>>
  const selectedDevice = devices.find(device => String(device.id) === effectiveDeviceId)
  const stationLabel = selectedDevice ? `${selectedDevice.name} (${selectedDevice.deviceId})` : effectiveDeviceId ? 'Selected weather station' : 'All stations average'
  return <section><div className="page-heading"><div><p className="eyebrow">{mode === 'live' ? 'Real-time telemetry' : 'Trend analysis'}</p><h1>{mode === 'live' ? 'Live monitoring' : 'Historical analytics'}</h1><p><strong>{stationLabel}</strong> · UTC · {mode === 'live' ? '1-minute averages' : 'hourly averages'} {stale ? '· data may be stale' : ''}</p></div><div className="flex flex-wrap items-end gap-2">{supportsStationFilter && !deviceId && <label className="text-xs font-semibold text-[#29464c]">Weather station<select aria-label="Weather station" value={selectedDeviceId} onChange={event => setSelectedDeviceId(event.target.value)} className="mt-1 block min-w-64 border border-border bg-white px-3 py-2 text-sm font-normal"><option value="">All stations average</option>{devices.map(device => <option key={device.id} value={device.id}>{device.name} ({device.deviceId})</option>)}</select></label>}<button className="flex min-h-10 items-center gap-2 border border-border bg-white px-3 py-2 text-xs font-semibold" onClick={() => void load()}><RefreshCw size={14} />Refresh</button></div></div><div className="grid gap-3 lg:grid-cols-2"><Chart title="Temperature" unit="°C" color="#087f8c" data={points} metric="temperature" /><Chart title="Humidity" unit="%" color="#2875ad" data={points} metric="humidity" /><Chart title="Pressure" unit="hPa" color="#7b5ba7" data={points} metric="pressure" /><Chart title="Latency" unit="ms" color="#ba7625" data={points} metric="latencyMs" /></div><p className="sr-only">Charts show average values for {stationLabel} per UTC aggregation bucket. Data points: {points.length}.</p></section>
}
function Chart({ title, unit, color, data, metric }: { title: string; unit: string; color: string; data: Array<Record<string, unknown>>; metric: string }) { const chartData = data.map(point => ({ time: format(point.timestamp), value: Number((point[metric] as { average?: number } | undefined)?.average) })) ; return <article className="h-72 rounded-lg border border-border p-4"><div className="flex items-center justify-between"><h2 className="text-xs font-semibold text-[#29464c]">{title} <span className="font-normal text-muted-foreground">({unit})</span></h2><span className="status-badge status-online">Live</span></div><ResponsiveContainer width="100%" height="84%"><LineChart data={chartData}><CartesianGrid stroke="#e5ecee" strokeDasharray="3 3" /><XAxis dataKey="time" hide /><YAxis width={44} tick={{ fontSize: 10, fill: '#78898e' }} unit={unit} /><Tooltip formatter={(value) => [`${Number(value).toLocaleString()} ${unit}`, title]} /><Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></article> }
function format(value: unknown) { return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleString() : 'Unavailable' }
function metricText(value: unknown) { if (!value || typeof value !== 'object') return 'Unavailable'; const metrics = value as { temperature?: number; humidity?: number; battery?: number }; return `${metrics.temperature ?? '—'} °C · ${metrics.humidity ?? '—'}% · ${metrics.battery ?? '—'}%` }
