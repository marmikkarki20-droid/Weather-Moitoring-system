import type { Endpoint } from 'payload'

import {
  MAX_INGEST_BODY_BYTES,
  isTimestampAcceptable,
  safeJsonSize,
  telemetryIngestSchema,
} from '@/lib/telemetry'
import { evaluateAlertsForReading, resolveOfflineAlertsForDevice } from '@/lib/alert-engine'
import { recordSystemEvent } from '@/lib/system-events'
import { dashboardEventHub } from '@/lib/dashboard-events'

function response(status: number, body: Record<string, string>) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

function isDuplicateConstraint(error: unknown): boolean {
  const seen = new Set<unknown>()
  let current: unknown = error
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current)
    const value = current as { cause?: unknown; code?: unknown; message?: unknown }
    if (value.code === '23505') return true
    current = value.cause
  }
  return false
}

export const telemetryIngestEndpoint: Endpoint = {
  path: '/telemetry/ingest',
  method: 'post',
  handler: async (req) => {
    const account = req.user
    if (!account || account.collection !== 'service-accounts') {
      return response(401, { error: 'gateway_authentication_required' })
    }
    if (account.active !== true || account.accountType !== 'edge-gateway') {
      return response(403, { error: 'gateway_not_authorized' })
    }

    const contentLength = Number(req.headers.get('content-length'))
    if (Number.isFinite(contentLength) && contentLength > MAX_INGEST_BODY_BYTES) {
      return response(413, { error: 'payload_too_large' })
    }
    let body = req.data
    if (typeof body === 'undefined') {
      if (!req.json) return response(400, { error: 'invalid_telemetry' })
      try {
        body = await req.json()
      } catch {
        return response(400, { error: 'invalid_telemetry' })
      }
    }
    const bodySize = safeJsonSize(body)
    if (bodySize === null || bodySize > MAX_INGEST_BODY_BYTES) {
      return response(413, { error: 'payload_too_large' })
    }

    const parsed = telemetryIngestSchema.safeParse(body)
    if (!parsed.success) {
      return response(400, { error: 'invalid_telemetry' })
    }

    const telemetry = parsed.data
    const serverTime = new Date()
    if (!isTimestampAcceptable(telemetry, serverTime)) {
      return response(400, { error: 'invalid_timestamp' })
    }

    const devices = await req.payload.find({
      collection: 'devices',
      where: { deviceId: { equals: telemetry.deviceId } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const device = devices.docs[0]
    if (!device) return response(404, { error: 'unknown_device' })
    if (device.active !== true) return response(409, { error: 'inactive_device' })

    // Fast-path known QoS 1 replays. The unique database index below remains
    // the authoritative race-safe duplicate guard for concurrent requests.
    const existing = await req.payload.find({
      collection: 'weather-readings',
      where: {
        and: [
          { device: { equals: device.id } },
          { sequenceNumber: { equals: telemetry.sequenceNumber } },
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    if (existing.docs[0]) return response(200, { status: 'already_processed' })

    const transactionID = await req.payload.db.beginTransaction()
    const transactionRequest = { transactionID: transactionID ?? undefined }
    try {
      const serverTimestamp = serverTime.toISOString()
      const reading = await req.payload.create({
        collection: 'weather-readings',
        req: transactionRequest,
        overrideAccess: true,
        data: {
          device: device.id,
          sequenceNumber: telemetry.sequenceNumber,
          temperature: telemetry.temperature,
          humidity: telemetry.humidity,
          pressure: telemetry.pressure,
          rainfall: telemetry.rainfall,
          windSpeed: telemetry.windSpeed,
          battery: telemetry.battery,
          deviceTimestamp: telemetry.deviceTimestamp,
          gatewayTimestamp: telemetry.gatewayTimestamp,
          serverTimestamp,
          latencyMs: serverTime.getTime() - Date.parse(telemetry.deviceTimestamp),
          validationStatus: 'valid',
          rawPayload: telemetry,
        },
      })

      await req.payload.update({
        collection: 'devices',
        id: device.id,
        req: transactionRequest,
        overrideAccess: true,
        data: {
          status: 'online',
          lastSeen: serverTimestamp,
          latestMetrics: {
            temperature: telemetry.temperature,
            humidity: telemetry.humidity,
            pressure: telemetry.pressure,
            rainfall: telemetry.rainfall,
            windSpeed: telemetry.windSpeed,
            battery: telemetry.battery,
            recordedAt: serverTimestamp,
          },
        },
      })

      await evaluateAlertsForReading(req.payload, device, reading, transactionRequest)
      await resolveOfflineAlertsForDevice(req.payload, device, transactionRequest)
      if (device.status === 'offline') {
        await recordSystemEvent(req.payload, { eventType: 'device-recovered', severity: 'info', source: 'telemetry-ingestion', device: device.id, message: `${device.deviceId} recovered after valid telemetry.` }, transactionRequest)
      }

      await req.payload.update({
        collection: 'service-accounts',
        id: account.id,
        req: transactionRequest,
        overrideAccess: true,
        data: { lastUsedAt: serverTimestamp },
      })

      if (transactionID) await req.payload.db.commitTransaction(transactionID)
      dashboardEventHub.publish('reading.created', { id: reading.id, deviceId: device.id, timestamp: serverTimestamp, temperature: telemetry.temperature, humidity: telemetry.humidity, pressure: telemetry.pressure, rainfall: telemetry.rainfall, windSpeed: telemetry.windSpeed, battery: telemetry.battery, latencyMs: serverTime.getTime() - Date.parse(telemetry.deviceTimestamp) })
      dashboardEventHub.publish('device.updated', { id: device.id, status: 'online', lastSeen: serverTimestamp })
      return response(201, { status: 'accepted', readingId: String(reading.id) })
    } catch (error) {
      if (transactionID) await req.payload.db.rollbackTransaction(transactionID)

      if (isDuplicateConstraint(error)) {
        const duplicate = await req.payload.find({
          collection: 'weather-readings',
          where: {
            and: [
              { device: { equals: device.id } },
              { sequenceNumber: { equals: telemetry.sequenceNumber } },
            ],
          },
          limit: 1,
          depth: 0,
          overrideAccess: true,
        })
        if (duplicate.docs[0]) return response(200, { status: 'already_processed' })
      }

      req.payload.logger.error({
        msg: 'Telemetry ingestion failed',
        deviceId: telemetry.deviceId,
        sequenceNumber: telemetry.sequenceNumber,
        messageId: telemetry.messageId,
      })
      return response(500, { error: 'ingestion_unavailable' })
    }
  },
}
