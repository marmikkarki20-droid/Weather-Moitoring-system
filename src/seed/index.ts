/**
 * Idempotent development seed script.
 *
 * Seeds three locations (Sydney, Melbourne, Brisbane), one simulated
 * device per location, 24+ historical weather readings per device, default
 * alert rules, the local edge-gateway account, and user notification
 * preferences. Readings are mostly normal, with a few clearly abnormal
 * records for visibility.
 *
 * Uses the Payload Local API directly (`overrideAccess: true`) — this is a
 * trusted, server-side-only script and is not exposed over HTTP. It must be
 * run with `pnpm seed` from a machine with access to DATABASE_URI; it does
 * not go through, and does not weaken, the public REST/GraphQL API access
 * rules defined on the collections.
 *
 * Running this script multiple times is safe: locations are matched by
 * `code`, devices by `deviceId`, and readings by `(device, sequenceNumber)`,
 * so re-running only fills in what's missing instead of duplicating data.
 *
 * Usage:
 *   pnpm seed
 */
import { getPayload } from 'payload'
import { randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import config from '@/payload.config'

type LocationSeed = {
  code: string
  name: string
  city: string
  country: string
  timezone: string
  latitude: number
  longitude: number
}

const LOCATIONS: LocationSeed[] = [
  {
    code: 'SYD',
    name: 'Sydney Observatory Hill',
    city: 'Sydney',
    country: 'Australia',
    timezone: 'Australia/Sydney',
    latitude: -33.8607,
    longitude: 151.2050,
  },
  {
    code: 'MEL',
    name: 'Melbourne CBD',
    city: 'Melbourne',
    country: 'Australia',
    timezone: 'Australia/Sydney',
    latitude: -37.8136,
    longitude: 144.9631,
  },
  {
    code: 'BNE',
    name: 'Brisbane City',
    city: 'Brisbane',
    country: 'Australia',
    timezone: 'Australia/Brisbane',
    latitude: -27.4698,
    longitude: 153.0251,
  },
]

const READINGS_PER_DEVICE = 24
// Readings spaced 1 hour apart, ending "now" — a useful recent window for a
// dashboard without needing a running simulator yet.
const READING_INTERVAL_MS = 60 * 60 * 1000
// Every 8th reading (indices 7, 15, 23, ...) is deliberately abnormal so the
// data mix is easy to spot-check.
const ABNORMAL_EVERY_N = 8

const DEFAULT_ALERT_RULES = [
  { name: 'High temperature', code: 'high-temperature', ruleType: 'metric-threshold', metric: 'temperature', condition: 'above', warningValue: 35, criticalValue: 42 },
  { name: 'High humidity', code: 'high-humidity', ruleType: 'metric-threshold', metric: 'humidity', condition: 'above', warningValue: 85, criticalValue: 95 },
  { name: 'Low battery', code: 'low-battery', ruleType: 'metric-threshold', metric: 'battery', condition: 'below', warningValue: 20, criticalValue: 10 },
  { name: 'High latency', code: 'high-latency', ruleType: 'metric-threshold', metric: 'latencyMs', condition: 'above', warningValue: 2000, criticalValue: 5000 },
  { name: 'Abnormal pressure', code: 'abnormal-pressure', ruleType: 'metric-threshold', metric: 'pressure', condition: 'outside-range', warningMinimum: 950, warningMaximum: 1050, criticalMinimum: 900, criticalMaximum: 1100 },
  { name: 'Device offline', code: 'device-offline', ruleType: 'device-offline', offlineMultiplier: 3, minimumOfflineSeconds: 30 },
] as const

/** Small deterministic pseudo-random generator so re-runs are reproducible. */
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seededFloat(rand: () => number, min: number, max: number) {
  return min + rand() * (max - min)
}

async function setLocalEnvValue(name: string, value: string) {
  const envPath = resolve(process.cwd(), '.env')
  const source = await readFile(envPath, 'utf8')
  const newline = source.includes('\r\n') ? '\r\n' : '\n'
  const lines = source.split(/\r?\n/)
  const index = lines.findIndex((line) => line.startsWith(`${name}=`))

  if (index >= 0) {
    lines[index] = `${name}=${value}`
  } else {
    if (lines.at(-1) !== '') lines.push('')
    lines.push(`${name}=${value}`)
  }

  await writeFile(envPath, lines.join(newline), 'utf8')
}

async function seed() {
  const payload = await getPayload({ config })

  payload.logger.info('Starting WeatherGrid development seed...')

  for (const [locationIndex, loc] of LOCATIONS.entries()) {
    // 1. Location — matched/deduplicated by unique `code`.
    const existingLocation = await payload.find({
      collection: 'locations',
      where: { code: { equals: loc.code } },
      limit: 1,
      overrideAccess: true,
    })

    let location = existingLocation.docs[0]
    if (!location) {
      location = await payload.create({
        collection: 'locations',
        overrideAccess: true,
        data: {
          name: loc.name,
          code: loc.code,
          city: loc.city,
          country: loc.country,
          timezone: loc.timezone,
          latitude: loc.latitude,
          longitude: loc.longitude,
          active: true,
          description: `Seed location for ${loc.city}, used for development and demo data.`,
        },
      })
      payload.logger.info(`Created location ${loc.code} (${loc.city})`)
    } else {
      payload.logger.info(`Location ${loc.code} already exists, skipping create`)
    }

    // 2. Device — one per location, matched/deduplicated by unique `deviceId`.
    const deviceId = `WX-${loc.code}-001`
    const existingDevice = await payload.find({
      collection: 'devices',
      where: { deviceId: { equals: deviceId } },
      limit: 1,
      overrideAccess: true,
    })

    let device = existingDevice.docs[0]
    if (!device) {
      device = await payload.create({
        collection: 'devices',
        overrideAccess: true,
        data: {
          deviceId,
          name: `${loc.city} Weather Station`,
          location: location.id,
          status: 'online',
          active: true,
          simulationEnabled: true,
          publishingIntervalSeconds: 10,
          firmwareVersion: '0.1.0-dev',
          description: `Simulated device seeded for ${loc.city}.`,
        },
      })
      payload.logger.info(`Created device ${deviceId}`)
    } else {
      payload.logger.info(`Device ${deviceId} already exists, skipping create`)
    }

    // 3. Historical readings — matched/deduplicated by (device, sequenceNumber).
    const rand = mulberry32(1000 + locationIndex)
    const now = Date.now()
    let created = 0
    let latestReading: { temperature: number; humidity: number; battery: number; recordedAt: string } | null =
      null

    for (let seq = 1; seq <= READINGS_PER_DEVICE; seq += 1) {
      const existingReading = await payload.find({
        collection: 'weather-readings',
        where: {
          and: [{ device: { equals: device.id } }, { sequenceNumber: { equals: seq } }],
        },
        limit: 1,
        overrideAccess: true,
      })

      const msAgo = (READINGS_PER_DEVICE - seq) * READING_INTERVAL_MS
      const deviceTimestamp = new Date(now - msAgo)
      const gatewayTimestamp = new Date(deviceTimestamp.getTime() + 250)
      const serverTimestamp = new Date(gatewayTimestamp.getTime() + 400)

      const isAbnormal = seq % ABNORMAL_EVERY_N === 0

      const temperature = isAbnormal
        ? seededFloat(rand, 45, 55) // clearly abnormal heat spike
        : seededFloat(rand, 14, 28)
      const humidity = isAbnormal
        ? seededFloat(rand, 0, 5) // implausibly low humidity
        : seededFloat(rand, 40, 85)
      const pressure = isAbnormal ? seededFloat(rand, 850, 900) : seededFloat(rand, 1005, 1025)
      const rainfall = isAbnormal ? seededFloat(rand, 80, 120) : seededFloat(rand, 0, 5)
      const windSpeed = isAbnormal ? seededFloat(rand, 90, 130) : seededFloat(rand, 2, 25)
      const battery = isAbnormal ? seededFloat(rand, 1, 8) : seededFloat(rand, 55, 100)
      const latencyMs = Math.round(seededFloat(rand, 80, 600))

      const reading = {
        temperature: Number(temperature.toFixed(1)),
        humidity: Number(humidity.toFixed(1)),
        battery: Number(battery.toFixed(1)),
        recordedAt: serverTimestamp.toISOString(),
      }

      if (!latestReading || seq === READINGS_PER_DEVICE) {
        latestReading = reading
      }

      if (existingReading.docs.length > 0) {
        continue
      }

      await payload.create({
        collection: 'weather-readings',
        overrideAccess: true,
        data: {
          device: device.id,
          sequenceNumber: seq,
          temperature: reading.temperature,
          humidity: reading.humidity,
          pressure: Number(pressure.toFixed(1)),
          rainfall: Number(rainfall.toFixed(1)),
          windSpeed: Number(windSpeed.toFixed(1)),
          battery: reading.battery,
          deviceTimestamp: deviceTimestamp.toISOString(),
          gatewayTimestamp: gatewayTimestamp.toISOString(),
          serverTimestamp: serverTimestamp.toISOString(),
          latencyMs,
          validationStatus: isAbnormal ? 'invalid' : 'valid',
          rawPayload: {
            source: 'seed-script',
            sequenceNumber: seq,
            abnormal: isAbnormal,
          },
        },
      })
      created += 1
    }

    payload.logger.info(
      `Seeded ${created} new reading(s) for ${deviceId} (${READINGS_PER_DEVICE - created} already existed)`,
    )

    // Keep the device's latestMetrics snapshot in sync with the newest reading.
    if (latestReading) {
      await payload.update({
        collection: 'devices',
        id: device.id,
        overrideAccess: true,
        data: {
          lastSeen: latestReading.recordedAt,
          latestMetrics: {
            temperature: latestReading.temperature,
            humidity: latestReading.humidity,
            battery: latestReading.battery,
            recordedAt: latestReading.recordedAt,
          },
        },
      })
    }
  }

  for (const rule of DEFAULT_ALERT_RULES) {
    const existing = await payload.find({ collection: 'alert-rules', where: { code: { equals: rule.code } }, limit: 1, overrideAccess: true })
    if (existing.docs[0]) {
      payload.logger.info(`Alert rule ${rule.code} already exists, skipping create`)
      continue
    }
    await payload.create({
      collection: 'alert-rules', overrideAccess: true,
      data: { ...rule, enabled: true, cooldownSeconds: 300, autoResolve: true, scope: 'all-devices' },
    })
    payload.logger.info(`Created default alert rule ${rule.code}`)
  }

  // 4. Edge gateway service account. If the local key is missing, generate
  // one and persist it only to the git-ignored .env file. The value is never
  // written to logs or source-controlled examples.
  const gatewayAccountName = 'WeatherGrid Edge Gateway'
  let gatewayAPIKey = process.env.GATEWAY_API_KEY?.trim()
  if (!gatewayAPIKey) {
    gatewayAPIKey = randomUUID()
    await setLocalEnvValue('GATEWAY_API_KEY', gatewayAPIKey)
    process.env.GATEWAY_API_KEY = gatewayAPIKey
    payload.logger.info('Generated the gateway API key and stored it in the local .env file')
  }

  const existingGatewayAccount = await payload.find({
    collection: 'service-accounts',
    where: { name: { equals: gatewayAccountName } },
    limit: 1,
    overrideAccess: true,
  })

  if (existingGatewayAccount.docs[0]) {
    await payload.update({
      collection: 'service-accounts',
      id: existingGatewayAccount.docs[0].id,
      overrideAccess: true,
      data: {
        accountType: 'edge-gateway',
        active: true,
        enableAPIKey: true,
        apiKey: gatewayAPIKey,
        description: 'Local edge gateway used to ingest MQTT telemetry into WeatherGrid.',
      },
    })
    payload.logger.info('Synchronized the WeatherGrid edge gateway service account')
  } else {
    await payload.create({
      collection: 'service-accounts',
      overrideAccess: true,
      data: {
        name: gatewayAccountName,
        accountType: 'edge-gateway',
        active: true,
        enableAPIKey: true,
        apiKey: gatewayAPIKey,
        description: 'Local edge gateway used to ingest MQTT telemetry into WeatherGrid.',
      },
    })
    payload.logger.info('Created the WeatherGrid edge gateway service account')
  }

  // 5. Give every existing interactive user a complete, conservative local
  // notification profile. Preview mode remains opt-in and sends no real mail.
  const users = await payload.find({
    collection: 'users',
    limit: 100,
    overrideAccess: true,
  })

  for (const user of users.docs) {
    const existingPreference = await payload.find({
      collection: 'notification-preferences',
      where: { user: { equals: user.id } },
      limit: 1,
      overrideAccess: true,
    })
    if (existingPreference.docs[0]) continue

    await payload.create({
      collection: 'notification-preferences',
      overrideAccess: true,
      data: {
        user: user.id,
        emailEnabled: false,
        minimumSeverity: 'warning',
        alertCreated: true,
        alertEscalated: true,
        alertResolved: true,
        deviceOffline: true,
        deviceRecovered: true,
        allDevices: true,
        quietHoursEnabled: false,
        timezone: 'UTC',
        dailyDigestEnabled: false,
        weeklyDigestEnabled: false,
        includePDFReport: false,
      },
    })
    payload.logger.info(`Created default notification preferences for user ${user.id}`)
  }

  payload.logger.info('WeatherGrid development seed complete.')
  process.exit(0)
}

try {
  await seed()
} catch (error) {
  console.error('Seed script failed:', error)
  process.exit(1)
}
