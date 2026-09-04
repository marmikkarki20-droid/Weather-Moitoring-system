import { describe, expect, it } from 'vitest'
import { evaluateMetric, ruleAppliesToDevice, type RuleLike } from './alert-engine'

const rule = (overrides: Partial<RuleLike> = {}): RuleLike => ({
  id: 1, name: 'Temperature', code: 'temp', enabled: true, ruleType: 'metric-threshold', metric: 'temperature', condition: 'above', warningValue: 35, criticalValue: 42,
  cooldownSeconds: 300, autoResolve: true, scope: 'all-devices', ...overrides,
})

describe('alert metric evaluation', () => {
  it('uses inclusive above and below boundaries', () => {
    expect(evaluateMetric(rule(), 34.9)).toBeNull()
    expect(evaluateMetric(rule(), 35)).toBe('warning')
    expect(evaluateMetric(rule(), 42)).toBe('critical')
    expect(evaluateMetric(rule({ condition: 'below', warningValue: 20, criticalValue: 10 }), 20)).toBe('warning')
    expect(evaluateMetric(rule({ condition: 'below', warningValue: 20, criticalValue: 10 }), 10)).toBe('critical')
  })

  it('evaluates outside range boundaries inclusively', () => {
    const pressure = rule({ condition: 'outside-range', warningMinimum: 950, warningMaximum: 1050, criticalMinimum: 900, criticalMaximum: 1100 })
    expect(evaluateMetric(pressure, 1000)).toBeNull()
    expect(evaluateMetric(pressure, 950)).toBe('warning')
    expect(evaluateMetric(pressure, 900)).toBe('critical')
    expect(evaluateMetric(pressure, 1100)).toBe('critical')
  })

  it('honours device and location scope and ignores disabled rules', () => {
    const device = { id: 3, deviceId: 'WX-SYD-001', name: 'Sydney', location: 7 }
    expect(ruleAppliesToDevice(rule({ scope: 'selected-devices', devices: [3] }), device)).toBe(true)
    expect(ruleAppliesToDevice(rule({ scope: 'selected-devices', devices: [4] }), device)).toBe(false)
    expect(ruleAppliesToDevice(rule({ scope: 'selected-locations', locations: [7] }), device)).toBe(true)
    expect(ruleAppliesToDevice(rule({ enabled: false }), device)).toBe(false)
  })
})
