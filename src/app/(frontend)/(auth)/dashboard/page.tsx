import { headers as getHeaders } from 'next/headers'
import { getPayload } from 'payload'

import config from '@payload-config'
import type { Device } from '@/payload-types'
import { AlertActions } from '@/components/alert-actions'

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
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  )
}

function statusBadgeClasses(status: string) {
  switch (status) {
    case 'online':
      return 'bg-green-100 text-green-800'
    case 'offline':
      return 'bg-red-100 text-red-800'
    case 'degraded':
      return 'bg-amber-100 text-amber-800'
    case 'maintenance':
      return 'bg-blue-100 text-blue-800'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

function severityBadgeClasses(severity: string) { return severity === 'critical' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800' }

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
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Signed in as <strong>{user?.name || user?.email}</strong> ({user?.email}) — role:{' '}
          <span className="rounded bg-muted px-2 py-0.5 text-xs uppercase">{role}</span>
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-8">
            <StatCard label="Locations" value={data.locationCount} />
            <StatCard label="Devices" value={data.deviceCount} />
            <StatCard label="Online devices" value={data.onlineDeviceCount} />
            <StatCard label="Offline devices" value={data.offlineDeviceCount} />
            <StatCard label="Stored readings" value={data.readingCount} />
            <StatCard label="Most recent reading" value={formatDateTime(data.mostRecentReadingAt)} />
            <StatCard label="Active alerts" value={data.activeAlertCount} />
            <StatCard label="Critical alerts" value={data.criticalAlertCount} />
          </div>

          <div className="rounded-lg border border-border">
            <div className="border-b border-border p-4"><h2 className="text-lg font-medium">Unresolved alerts</h2></div>
            {data.recentAlerts.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No active or acknowledged alerts.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-border text-left text-xs uppercase text-muted-foreground"><th className="p-3">Severity</th><th className="p-3">Device</th><th className="p-3">Message</th><th className="p-3">Status</th><th className="p-3">First triggered</th><th className="p-3">Last triggered</th>{role === 'admin' && <th className="p-3">Actions</th>}</tr></thead><tbody>{data.recentAlerts.map(alert => <tr key={alert.id} className="border-b border-border last:border-0"><td className="p-3"><span className={`rounded px-2 py-0.5 text-xs uppercase ${severityBadgeClasses(alert.severity)}`}>{alert.severity}</span></td><td className="p-3">{alert.device}</td><td className="p-3">{alert.message}</td><td className="p-3">{alert.status}</td><td className="p-3">{formatDateTime(alert.firstTriggeredAt)}</td><td className="p-3">{formatDateTime(alert.lastTriggeredAt)}</td>{role === 'admin' && <td className="p-3"><AlertActions alertId={alert.id} /></td>}</tr>)}</tbody></table></div>}
          </div>

          <div className="rounded-lg border border-border">
            <div className="border-b border-border p-4">
              <h2 className="text-lg font-medium">Devices</h2>
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
                            className={`rounded px-2 py-0.5 text-xs uppercase ${statusBadgeClasses(device.status)}`}
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
          </div>
        </>
      )}
    </div>
  )
}
