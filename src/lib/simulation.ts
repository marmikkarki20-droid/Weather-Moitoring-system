import { z } from 'zod'

export const commandTypes = ['high-temperature', 'high-humidity', 'abnormal-pressure', 'low-battery', 'high-latency', 'pause-telemetry', 'duplicate-message', 'delayed-message', 'out-of-order-message', 'invalid-payload', 'disconnect-mqtt', 'reset-normal'] as const
export type CommandType = typeof commandTypes[number]
const duration = z.number().int().min(1).max(600).optional()
export const commandRequestSchema = z.object({ deviceId: z.string().regex(/^WX-[A-Z]{3}-001$/), commandType: z.enum(commandTypes), durationSeconds: duration, parameters: z.record(z.string(), z.unknown()).default({}) }).strict().superRefine((value, ctx) => {
  const parameter = value.parameters
  const target = (key: string, min: number, max: number) => { const number = parameter[key]; if (typeof number !== 'number' || number < min || number > max) ctx.addIssue({ code: 'custom', path: ['parameters', key], message: `${key} must be between ${min} and ${max}.` }) }
  if (value.commandType === 'high-temperature') target('targetTemperature', 35, 60)
  if (value.commandType === 'high-humidity') target('targetHumidity', 85, 100)
  if (value.commandType === 'abnormal-pressure') target('targetPressure', 800, 1200)
  if (value.commandType === 'low-battery') target('targetBattery', 1, 20)
  if (value.commandType === 'high-latency') target('delayMilliseconds', 1000, 30_000)
  if (['pause-telemetry', 'disconnect-mqtt'].includes(value.commandType) && !value.durationSeconds) ctx.addIssue({ code: 'custom', path: ['durationSeconds'], message: 'A duration is required for this command.' })
  if (Object.keys(parameter).some(key => !['targetTemperature', 'targetHumidity', 'targetPressure', 'targetBattery', 'delayMilliseconds'].includes(key))) ctx.addIssue({ code: 'custom', path: ['parameters'], message: 'Unsupported command parameter.' })
})
export const acknowledgementSchema = z.object({ schemaVersion: z.literal(1), commandId: z.string().uuid(), deviceId: z.string().regex(/^WX-[A-Z]{3}-001$/), status: z.enum(['acknowledged', 'running', 'completed', 'failed', 'expired', 'cancelled']), message: z.string().max(300), timestamp: z.string().datetime({ offset: true }) }).strict()
const transitions: Record<string, string[]> = { queued: ['published', 'failed', 'expired', 'cancelled'], published: ['acknowledged', 'failed', 'expired', 'cancelled'], acknowledged: ['running'], running: ['completed', 'failed', 'cancelled'] }
export const validTransition = (from: string, to: string) => from === to || Boolean(transitions[from]?.includes(to))
