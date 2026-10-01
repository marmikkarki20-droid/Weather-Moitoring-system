'use client'

import { useEffect, useState } from 'react'
import { Play } from 'lucide-react'
import { useDashboardRealtime } from '@/components/dashboard-realtime'

const presets = [
  { type: 'high-temperature', label: 'Temperature warning', parameters: { targetTemperature: 36 }, durationSeconds: 60 },
  { type: 'high-temperature', label: 'Temperature critical', parameters: { targetTemperature: 43 }, durationSeconds: 60 },
  { type: 'high-humidity', label: 'Humidity warning', parameters: { targetHumidity: 90 }, durationSeconds: 60 },
  { type: 'low-battery', label: 'Low battery', parameters: { targetBattery: 10 }, durationSeconds: 60 },
  { type: 'high-latency', label: 'High latency', parameters: { delayMilliseconds: 3000 }, durationSeconds: 30 },
  { type: 'pause-telemetry', label: 'Device silence', parameters: {}, durationSeconds: 45 },
  { type: 'disconnect-mqtt', label: 'Temporary MQTT disconnect', parameters: {}, durationSeconds: 30 },
  { type: 'reset-normal', label: 'Reset to normal', parameters: {}, durationSeconds: undefined },
]

export function SimulationLab() {
  const [devices, setDevices] = useState<Array<{ id: number; deviceId: string; name: string; simulationEnabled: boolean }>>([])
  const [deviceId, setDeviceId] = useState('')
  const [presetIndex, setPresetIndex] = useState(0)
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { lastEvent } = useDashboardRealtime()

  useEffect(() => {
    void fetch('/api/dashboard/devices?limit=100').then(response => response.json()).then(body => {
      const rows = body.docs || []
      setDevices(rows)
      if (rows[0]) setDeviceId(rows[0].deviceId)
    })
  }, [])

  const issue = async (preset: typeof presets[number]) => {
    if (!deviceId || !window.confirm(`Run ${preset.label} on ${deviceId}? This is a local academic simulation.`)) return
    setSubmitting(true)
    setMessage('')
    try {
      const response = await fetch('/api/simulation/commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, commandType: preset.type, durationSeconds: preset.durationSeconds, parameters: preset.parameters }),
      })
      const body = await response.json() as { error?: string; status?: string; commandId?: string }
      setMessage(response.ok ? `Command ${body.commandId} published.` : body.error || 'Command failed.')
    } finally {
      setSubmitting(false)
    }
  }

  const selectedDevice = devices.find(device => device.deviceId === deviceId)
  const selectedPreset = presets[presetIndex]

  return (
    <section>
      <div className="page-heading"><div><p className="eyebrow">Controlled testing</p><h1>Simulation laboratory</h1><p>Run bounded academic scenarios against simulation-enabled weather devices.</p></div></div>
      <div className="mt-6 grid gap-4 border-y border-border bg-white py-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
        <label className="block text-sm font-medium">Simulated device
          <select value={deviceId} onChange={event => setDeviceId(event.target.value)} className="mt-1.5 w-full border border-border bg-white p-2.5">
            {devices.map(device => <option key={device.id} value={device.deviceId} disabled={!device.simulationEnabled}>{device.name} ({device.deviceId}){!device.simulationEnabled ? ' - disabled' : ''}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium">Command
          <select value={presetIndex} onChange={event => setPresetIndex(Number(event.target.value))} className="mt-1.5 w-full border border-border bg-white p-2.5">
            {presets.map((preset, index) => <option key={preset.label} value={index}>{preset.label}</option>)}
          </select>
        </label>
        <button
          type="button"
          disabled={!selectedDevice?.simulationEnabled || submitting}
          onClick={() => void issue(selectedPreset)}
          className="inline-flex min-h-11 items-center justify-center gap-2 bg-[#087f8c] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#066b76] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Play aria-hidden="true" className="h-4 w-4" />
          {submitting ? 'Publishing...' : 'Run selected command'}
        </button>
      </div>
      <h2 className="mt-8 text-sm font-semibold text-[#29464c]">Safe scenario presets</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {presets.map((preset, index) => <button key={preset.label} disabled={submitting} onClick={() => { setPresetIndex(index); void issue(preset) }} className="rounded-lg border border-border bg-white p-4 text-left transition hover:bg-muted focus-visible:ring-2 focus-visible:ring-cyan-600 disabled:cursor-not-allowed disabled:opacity-50"><strong className="text-sm">{preset.label}</strong><span className="mt-1 block text-xs text-muted-foreground">{preset.durationSeconds ? `${preset.durationSeconds}s bounded duration` : 'Restores ordinary simulation'}</span></button>)}
      </div>
      {message && <p role="status" className="mt-4 rounded border border-border bg-white p-3 text-sm">{message}</p>}
      {Boolean(lastEvent?.data.simulationCommandId) && <p className="mt-3 text-sm text-muted-foreground">Live command update: {String(lastEvent?.data.status)}</p>}
    </section>
  )
}
