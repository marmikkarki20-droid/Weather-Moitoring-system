import { describe, expect, it } from 'vitest'

import { isTimestampAcceptable, telemetryIngestSchema } from './telemetry'

const valid = {
  schemaVersion: 1,
  messageId: '018f02cf-7c5a-4ebd-b849-142f4e3d6201',
  deviceId: 'WX-SYD-001',
  locationCode: 'SYD',
  sequenceNumber: 1,
  temperature: 20,
  humidity: 50,
  pressure: 1010,
  rainfall: 0,
  windSpeed: 2,
  battery: 99,
  deviceTimestamp: '2026-09-02T12:00:00.000Z',
  gatewayTimestamp: '2026-09-02T12:00:00.250Z',
}

describe('telemetry ingestion validation', () => {
  it('accepts the simulator-compatible contract', () => {
    expect(telemetryIngestSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects unknown fields, invalid values, and non-integer sequences', () => {
    expect(telemetryIngestSchema.safeParse({ ...valid, injected: true }).success).toBe(false)
    expect(telemetryIngestSchema.safeParse({ ...valid, humidity: 101 }).success).toBe(false)
    expect(telemetryIngestSchema.safeParse({ ...valid, sequenceNumber: 1.5 }).success).toBe(false)
  })

  it('rejects future and time-order-invalid samples', () => {
    const parsed = telemetryIngestSchema.parse(valid)
    expect(isTimestampAcceptable(parsed, new Date('2026-09-02T12:01:00.000Z'))).toBe(true)
    expect(
      isTimestampAcceptable(
        { ...parsed, deviceTimestamp: '2026-09-02T12:10:00.000Z' },
        new Date('2026-09-02T12:01:00.000Z'),
      ),
    ).toBe(false)
  })
})
