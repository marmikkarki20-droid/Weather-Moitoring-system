import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import path from 'node:path'
import sharp from 'sharp'

import { Users } from '@/collections/Users'
import { Locations } from '@/collections/Locations'
import { Devices } from '@/collections/Devices'
import { WeatherReadings } from '@/collections/WeatherReadings'
import { ServiceAccounts } from '@/collections/ServiceAccounts'
import { AlertRules } from '@/collections/AlertRules'
import { Alerts } from '@/collections/Alerts'
import { SystemEvents } from '@/collections/SystemEvents'
import { SimulationCommands } from '@/collections/SimulationCommands'
import { NotificationPreferences } from '@/collections/NotificationPreferences'
import { NotificationOutbox } from '@/collections/NotificationOutbox'
import { telemetryIngestEndpoint } from '@/endpoints/telemetry-ingest'
import { acknowledgeAlertEndpoint, resolveAlertEndpoint } from '@/endpoints/alert-actions'
import { dashboardStreamEndpoint } from '@/endpoints/dashboard-stream'
import { dashboardApiEndpoints } from '@/endpoints/dashboard-api'
import { createSimulationCommandEndpoint, simulationAcknowledgementEndpoint } from '@/endpoints/simulation'
import { reportsEndpoint } from '@/endpoints/reports'
import { notificationEndpoints } from '@/endpoints/notifications'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Users, Locations, Devices, WeatherReadings, ServiceAccounts, AlertRules, Alerts, SystemEvents, SimulationCommands, NotificationPreferences, NotificationOutbox],
  endpoints: [telemetryIngestEndpoint, acknowledgeAlertEndpoint, resolveAlertEndpoint, createSimulationCommandEndpoint, simulationAcknowledgementEndpoint, reportsEndpoint, ...notificationEndpoints, dashboardStreamEndpoint, ...dashboardApiEndpoints],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URI || '',
    },
    // Migrations are managed explicitly via `pnpm migrate` — never let Payload
    // auto-push schema changes (which also prompts interactively and can hang
    // non-interactive scripts such as the seed script).
    push: false,
  }),
  sharp,
})
