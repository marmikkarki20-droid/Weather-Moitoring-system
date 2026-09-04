import { z } from 'zod'

export const TELEMETRY_SCHEMA_VERSION = 1
export const MAX_INGEST_BODY_BYTES = 16 * 1024
export const MAX_FUTURE_TIMESTAMP_MS = 5 * 60 * 1000

const utcMillisecondTimestamp = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, 'Expected a UTC ISO-8601 timestamp')
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Expected a valid timestamp')

export const telemetryIngestSchema = z
  .object({
    schemaVersion: z.literal(TELEMETRY_SCHEMA_VERSION),
    messageId: z.string().uuid(),
    deviceId: z.string().regex(/^WX-[A-Z]{3}-001$/, 'Invalid device ID'),
    locationCode: z.string().regex(/^[A-Z]{3}$/, 'Invalid location code'),
    sequenceNumber: z.number().int().positive(),
    temperature: z.number().finite().min(-60).max(70),
    humidity: z.number().finite().min(0).max(100),
    pressure: z.number().finite().min(800).max(1200),
    rainfall: z.number().finite().min(0),
    windSpeed: z.number().finite().min(0),
    battery: z.number().finite().min(0).max(100),
    deviceTimestamp: utcMillisecondTimestamp,
    gatewayTimestamp: utcMillisecondTimestamp,
  })
  .strict()

export type TelemetryIngest = z.infer<typeof telemetryIngestSchema>

export function safeJsonSize(value: unknown): number | null {
  try {
    return Buffer.byteLength(JSON.stringify(value), 'utf8')
  } catch {
    return null
  }
}

export function isTimestampAcceptable(telemetry: TelemetryIngest, serverTime: Date): boolean {
  const deviceTime = Date.parse(telemetry.deviceTimestamp)
  const gatewayTime = Date.parse(telemetry.gatewayTimestamp)
  const now = serverTime.getTime()

  return (
    deviceTime <= now + MAX_FUTURE_TIMESTAMP_MS &&
    gatewayTime <= now + MAX_FUTURE_TIMESTAMP_MS &&
    gatewayTime >= deviceTime &&
    deviceTime <= now
  )
}
