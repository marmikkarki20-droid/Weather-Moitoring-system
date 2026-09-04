import { describe, expect, it } from 'vitest'
import { commandRequestSchema, validTransition } from './simulation'

describe('simulation command contract', () => {
  const base = { deviceId: 'WX-SYD-001', commandType: 'high-temperature' as const, durationSeconds: 60, parameters: { targetTemperature: 43 } }
  it('allows only bounded, known commands and parameters', () => {
    expect(commandRequestSchema.safeParse(base).success).toBe(true)
    expect(commandRequestSchema.safeParse({ ...base, parameters: { targetTemperature: 71 } }).success).toBe(false)
    expect(commandRequestSchema.safeParse({ ...base, commandType: 'shell-command' }).success).toBe(false)
    expect(commandRequestSchema.safeParse({ ...base, parameters: { targetTemperature: 43, topic: 'x/#' } }).success).toBe(false)
  })
  it('enforces lifecycle direction and idempotent repeats', () => {
    expect(validTransition('queued', 'published')).toBe(true)
    expect(validTransition('running', 'completed')).toBe(true)
    expect(validTransition('acknowledged', 'acknowledged')).toBe(true)
    expect(validTransition('completed', 'running')).toBe(false)
  })
})
