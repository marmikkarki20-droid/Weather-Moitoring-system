/**
 * Live secure-ingestion verification. Run while the production app is
 * serving. It creates a temporary native API-key account, never prints its
 * key, verifies accepted and idempotent responses, then revokes the account.
 */
import { randomUUID } from 'node:crypto'

import { getPayload } from 'payload'

import config from '@/payload.config'

const endpoint = process.env.PAYLOAD_INGEST_URL || 'http://127.0.0.1:3000/api/telemetry/ingest'

async function main() {
  const payload = await getPayload({ config })
  const accountKey = randomUUID()
  const sequenceNumber = Math.floor(Date.now() / 1000)
  const account = await payload.create({
    collection: 'service-accounts',
    overrideAccess: true,
    data: {
      name: 'Temporary ingestion verifier ' + randomUUID(),
      accountType: 'edge-gateway',
      active: true,
      enableAPIKey: true,
      apiKey: accountKey,
    },
  })

  try {
    const deviceResult = await payload.find({
      collection: 'devices',
      where: { deviceId: { equals: 'WX-SYD-001' } },
      limit: 1,
      overrideAccess: true,
    })
    const device = deviceResult.docs[0]
    if (!device) throw new Error('Seeded Sydney device is missing')

    const now = new Date()
    const telemetry = {
      schemaVersion: 1,
      messageId: randomUUID(),
      deviceId: 'WX-SYD-001',
      locationCode: 'SYD',
      sequenceNumber,
      temperature: 21.5,
      humidity: 55.2,
      pressure: 1012.3,
      rainfall: 0,
      windSpeed: 7.1,
      battery: 98.7,
      deviceTimestamp: new Date(now.getTime() - 250).toISOString(),
      gatewayTimestamp: new Date(now.getTime() - 100).toISOString(),
    }
    const headers = {
      Authorization: 'service-accounts API-Key ' + accountKey,
      'Content-Type': 'application/json',
    }

    const accepted = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(telemetry) })
    const acceptedBody = await accepted.json()
    if (accepted.status !== 201 || acceptedBody.status !== 'accepted') {
      throw new Error('Expected accepted telemetry, got HTTP ' + accepted.status)
    }

    const duplicate = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(telemetry) })
    const duplicateBody = await duplicate.json()
    if (duplicate.status !== 200 || duplicateBody.status !== 'already_processed') {
      throw new Error('Expected idempotent duplicate, got HTTP ' + duplicate.status)
    }

    const stored = await payload.find({
      collection: 'weather-readings',
      where: {
        and: [
          { device: { equals: device.id } },
          { sequenceNumber: { equals: sequenceNumber } },
        ],
      },
      limit: 10,
      overrideAccess: true,
    })
    const updatedDevice = await payload.findByID({
      collection: 'devices',
      id: device.id,
      overrideAccess: true,
    })
    if (stored.totalDocs !== 1 || updatedDevice.latestMetrics?.temperature !== telemetry.temperature) {
      throw new Error('Telemetry persistence verification failed')
    }

    console.log(JSON.stringify({
      status: 'verified',
      accepted: acceptedBody.status,
      duplicate: duplicateBody.status,
      storedReadings: stored.totalDocs,
      deviceId: telemetry.deviceId,
    }))
  } finally {
    await payload.delete({
      collection: 'service-accounts',
      id: account.id,
      overrideAccess: true,
    })
  }
}

try {
  await main()
} catch (error) {
  console.error('Telemetry ingestion verification failed:', error instanceof Error ? error.message : 'unknown error')
  process.exit(1)
}
