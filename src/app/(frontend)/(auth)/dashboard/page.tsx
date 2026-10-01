import { headers as getHeaders } from 'next/headers'
import { getPayload } from 'payload'

import config from '@payload-config'
import type { Device } from '@/payload-types'
import { AlertActions } from '@/components/alert-actions'
import Link from 'next/link'
import { Activity, BellRing, Cpu, Database, MapPin, Radio, ServerOff, TriangleAlert } from 'lucide-react'

/**
 * Summary statistics and a device table read via Payload's server-side
 * Local API. This confirms Payload/PostgreSQL connectivity end-to-end and
 * gives a first data-driven look at the weather-monitoring fleet. Charts,
 * maps, alerts and live updates arrive in later stages.
 */

type DashboardData = {
  locationCount: number
  deviceCount: number
  onlineDeviceCount: number
  offlineDeviceCount: number
  readingCount: number
  activeAlertCount: number
  criticalAlertCount: number
  recentAlerts: Array<{ id: number; severity: string; status: string; message: string; firstTriggeredAt: string; lastTriggeredAt: string; device: string }>
  mostRecentReadingAt: string | null
  devices: Device[]
}

async function loadDashboardData(): Promise<{ data: DashboardData | null; error: string | null }> {
  try {
    const payload = await getPayload({ config })

    const [locations, devicesResult, onlineDevices, offlineDevices, readings, latestReading, activeAlerts, criticalAlerts, unresolvedAlerts] = await Promise.all([
      payload.count({ collection: 'locations' }),
      payload.find({
        collection: 'devices',
        depth: 1,
        limit: 100,
        sort: 'name',
      }),
      payload.count({ collection: 'devices', where: { status: { equals: 'online' } } }),
      payload.count({ collection: 'devices', where: { status: { equals: 'offline' } } }),
      payload.count({ collection: 'weather-readings' }),
      payload.find({
        collection: 'weather-readings',
        limit: 1,
        sort: '-serverTimestamp',
      }),
      payload.count({ collection: 'alerts', where: { status: { in: ['active', 'acknowledged'] } } }),
      payload.count({ collection: 'alerts', where: { and: [{ status: { in: ['active', 'acknowledged'] } }, { severity: { equals: 'critical' } }] } }),
      payload.find({ collection: 'alerts', depth: 1, limit: 5, sort: '-lastTriggeredAt', where: { status: { in: ['active', 'acknowledged'] } } }),
    ])

    return {
      data: {
        locationCount: locations.totalDocs,
        deviceCount: devicesResult.totalDocs,
        onlineDeviceCount: onlineDevices.totalDocs,
        offlineDeviceCount: offlineDevices.totalDocs,
        readingCount: readings.totalDocs,
        activeAlertCount: activeAlerts.totalDocs,
        criticalAlertCount: criticalAlerts.totalDocs,
        recentAlerts: unresolvedAlerts.docs.map(alert => ({ id: alert.id, severity: alert.severity, status: alert.status, message: alert.message, firstTriggeredAt: alert.firstTriggeredAt, lastTriggeredAt: alert.lastTriggeredAt, device: typeof alert.device === 'object' ? alert.device.name : 'Unknown device' })),
        mostRecentReadingAt: latestReading.docs[0]?.serverTimestamp ?? null,
        devices: devicesResult.docs,
      },
      error: null,
    }
  } catch {
    return { data: null, error: 'Unable to load weather-monitoring data. Please try again shortly.' }
  }
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  const icons = { Locations: MapPin, Devices: Cpu, 'Online devices': Radio, 'Offline devices': ServerOff, 'Stored readings': Database, 'Most recent reading': Activity, 'Active alerts': BellRing, 'Critical alerts': TriangleAlert }
  const Icon = icons[label as keyof typeof icons] || Activity
  return (
    <div className="stat-card">
      <div className="stat-card-top"><p>{label}</p><span className="stat-icon"><Icon size={16} /></span></div>
      <strong>{value}</strong><small>Current network status</small>
    </div>
  )
}

function statusBadgeClasses(status: string) {
  switch (status) {
    case 'online':
      return 'status-badge status-online'
    case 'offline':
      return 'status-badge status-offline'
    case 'degraded':
      return 'status-badge status-degraded'
    case 'maintenance':
      return 'status-badge status-maintenance'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

function severityBadgeClasses(severity: string) { return severity === 'critical' ? 'status-badge status-critical' : 'status-badge status-warning' }

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

function locationLabel(device: Device) {
  const location = device.location
  if (location && typeof location === 'object') {
    return location.name
  }
  return '—'
}

export default async function DashboardPage() {
  const headers = await getHeaders()
  const payload = await getPayload({ config })
  const { user: authenticatedUser } = await payload.auth({ headers })
  const user =
    authenticatedUser && 'role' in authenticatedUser
      ? (authenticatedUser as { name?: string; email?: string; role?: string })
      : null
  const role = user?.role ?? 'viewer'
  const { data, error } = await loadDashboardData()

  return (
    <div>
      <div className="page-heading">
        <div><p className="eyebrow">Network overview</p><h1>Weather operations</h1><p>Live station health, telemetry volume, and alerts across all locations.</p></div>
        <p>Signed in as <strong>{user?.name || user?.email}</strong></p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {data && (
        <>
          <div className="stat-grid">
            <StatCard label="Locations" value={data.locationCount} />
            <StatCard label="Devices" value={data.deviceCount} />
            <StatCard label="Online devices" value={data.onlineDeviceCount} />
            <StatCard label="Offline devices" value={data.offlineDeviceCount} />
            <StatCard label="Stored readings" value={data.readingCount} />
            <StatCard label="Most recent reading" value={formatDateTime(data.mostRecentReadingAt)} />
            <StatCard label="Active alerts" value={data.activeAlertCount} />
            <StatCard label="Critical alerts" value={data.criticalAlertCount} />
          </div>

          <div className="content-grid"><div><div className="panel">
            <div className="panel-header"><h2>Unresolved alerts</h2><Link href="/dashboard/alerts">View all alerts</Link></div>
            {data.recentAlerts.length === 0 ? <p className="empty-state">No active or acknowledged alerts.</p> : <div className="overflow-x-auto"><table className="w-full"><thead><tr><th>Severity</th><th>Device</th><th>Message</th><th>Status</th><th>Last triggered</th>{role === 'admin' && <th>Actions</th>}</tr></thead><tbody>{data.recentAlerts.map(alert => <tr key={alert.id}><td><span className={severityBadgeClasses(alert.severity)}>{alert.severity}</span></td><td>{alert.device}</td><td>{alert.message}</td><td>{alert.status}</td><td>{formatDateTime(alert.lastTriggeredAt)}</td>{role === 'admin' && <td><AlertActions alertId={alert.id} /></td>}</tr>)}</tbody></table></div>}
          </div>

          <div className="panel">
            <div className="panel-header">
              <h2>Station status</h2><Link href="/dashboard/devices">View all devices</Link>
            </div>
            {data.devices.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">
                No devices yet. Run <code className="rounded bg-muted px-1 py-0.5">pnpm seed</code> to populate
                development data.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                      <th className="p-3 font-medium">Device</th>
                      <th className="p-3 font-medium">Location</th>
                      <th className="p-3 font-medium">Status</th>
                      <th className="p-3 font-medium">Last seen</th>
                      <th className="p-3 font-medium">Temp (°C)</th>
                      <th className="p-3 font-medium">Humidity (%)</th>
                      <th className="p-3 font-medium">Battery (%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.devices.map((device) => (
                      <tr key={device.id} className="border-b border-border last:border-0">
                        <td className="p-3 font-medium">{device.name}</td>
                        <td className="p-3">{locationLabel(device)}</td>
                        <td className="p-3">
                          <span
                            className={statusBadgeClasses(device.status)}
                          >
                            {device.status}
                          </span>
                        </td>
                        <td className="p-3">{formatDateTime(device.lastSeen)}</td>
                        <td className="p-3">{device.latestMetrics?.temperature ?? '—'}</td>
                        <td className="p-3">{device.latestMetrics?.humidity ?? '—'}</td>
                        <td className="p-3">{device.latestMetrics?.battery ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div></div><aside><div className="panel"><div className="panel-header"><h2>Quick access</h2></div><div className="quick-list"><Link href="/dashboard/live"><Radio size={16} />Live monitoring</Link><Link href="/dashboard/map"><MapPin size={16} />Weather map</Link><Link href="/dashboard/reports"><Database size={16} />Export reports</Link><Link href="/dashboard/system"><Activity size={16} />System health</Link></div></div></aside></div>
        </>
      )}
    </div>
  )
}
