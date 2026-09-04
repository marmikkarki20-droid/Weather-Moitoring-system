import type { CollectionConfig } from 'payload'

import { isAdmin, isAuthenticated } from '@/access'

/**
 * Immutable telemetry records reported by a `devices` station. Grouped
 * under "Weather System" in the Admin Panel.
 *
 * - Administrators: can read and delete readings (e.g. to purge bad data).
 * - Viewers: read-only.
 * - Nobody can update a stored reading through the API — telemetry is
 *   append-only. Creation is restricted to administrators/server-side
 *   trusted code (the seed script uses the Local API, which can bypass
 *   access control explicitly); the public REST/GraphQL API cannot be used
 *   to write readings at this stage.
 */
export const WeatherReadings: CollectionConfig = {
  slug: 'weather-readings',
  labels: {
    singular: 'Weather Reading',
    plural: 'Weather Readings',
  },
  admin: {
    group: 'Weather System',
    useAsTitle: 'sequenceNumber',
    defaultColumns: [
      'device',
      'temperature',
      'humidity',
      'validationStatus',
      'serverTimestamp',
    ],
  },
  access: {
    // No one may update a stored reading via the API — telemetry is
    // append-only once written.
    update: () => false,
    delete: isAdmin,
    read: isAuthenticated,
    // Only admins (or server-side code using overrideAccess) may create
    // readings; the seed script is the only writer during this stage.
    create: isAdmin,
  },
  fields: [
    {
      name: 'device',
      type: 'relationship',
      relationTo: 'devices',
      required: true,
      index: true,
    },
    {
      name: 'sequenceNumber',
      type: 'number',
      required: true,
      min: 0,
      admin: {
        description:
          'Monotonically increasing per-device sequence number, used with `device` for MQTT QoS 1 duplicate protection.',
      },
    },
    {
      name: 'temperature',
      type: 'number',
      required: true,
      min: -60,
      max: 70,
    },
    {
      name: 'humidity',
      type: 'number',
      required: true,
      min: 0,
      max: 100,
    },
    {
      name: 'pressure',
      type: 'number',
      required: true,
      min: 800,
      max: 1200,
    },
    {
      name: 'rainfall',
      type: 'number',
      required: true,
      min: 0,
    },
    {
      name: 'windSpeed',
      type: 'number',
      required: true,
      min: 0,
    },
    {
      name: 'battery',
      type: 'number',
      required: true,
      min: 0,
      max: 100,
    },
    {
      name: 'deviceTimestamp',
      type: 'date',
      required: true,
      admin: {
        date: { pickerAppearance: 'dayAndTime' },
        description: 'Timestamp reported by the device itself.',
      },
    },
    {
      name: 'gatewayTimestamp',
      type: 'date',
      required: true,
      admin: {
        date: { pickerAppearance: 'dayAndTime' },
        description: 'Timestamp the edge gateway received/forwarded the reading.',
      },
    },
    {
      name: 'serverTimestamp',
      type: 'date',
      required: true,
      index: true,
      admin: {
        date: { pickerAppearance: 'dayAndTime' },
        description: 'Timestamp the server persisted the reading.',
      },
    },
    {
      name: 'latencyMs',
      type: 'number',
      required: true,
      min: 0,
      admin: {
        description: 'End-to-end latency in milliseconds (device to server).',
      },
    },
    {
      name: 'validationStatus',
      type: 'select',
      required: true,
      defaultValue: 'valid',
      index: true,
      options: [
        { label: 'Valid', value: 'valid' },
        { label: 'Invalid', value: 'invalid' },
        { label: 'Stale', value: 'stale' },
        { label: 'Duplicate', value: 'duplicate' },
      ],
    },
    {
      name: 'rawPayload',
      type: 'json',
      admin: {
        description: 'Original raw payload as received, kept for debugging/audit purposes.',
      },
    },
  ],
  indexes: [
    // Readings by device ordered by server timestamp (also covers "latest
    // readings per device" and date-range filtering when combined with a
    // WHERE on device).
    {
      fields: ['device', 'serverTimestamp'],
    },
    // Pure date-range filtering across all devices.
    {
      fields: ['serverTimestamp'],
    },
    // Filtering by validation status (e.g. only `valid` readings).
    {
      fields: ['validationStatus'],
    },
    // Composite uniqueness constraint for MQTT QoS 1 duplicate protection:
    // a given device may only report a given sequence number once.
    {
      fields: ['device', 'sequenceNumber'],
      unique: true,
    },
  ],
}
