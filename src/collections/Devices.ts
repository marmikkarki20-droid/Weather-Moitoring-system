import type { CollectionConfig } from 'payload'

import { isAdmin, isAuthenticated } from '@/access'

/**
 * Physical/simulated weather stations, each tied to a `locations` record.
 * Grouped under "Weather System" in the Admin Panel.
 *
 * - Administrators: full create/read/update/delete access.
 * - Viewers: read-only access to all devices.
 *
 * MQTT-driven status/metric updates are intentionally out of scope for this
 * stage — `latestMetrics` and `status` are populated manually or via the
 * seed script for now.
 */
export const Devices: CollectionConfig = {
  slug: 'devices',
  labels: {
    singular: 'Device',
    plural: 'Devices',
  },
  admin: {
    group: 'Weather System',
    useAsTitle: 'name',
    defaultColumns: ['name', 'deviceId', 'location', 'status', 'lastSeen'],
  },
  access: {
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
    read: isAuthenticated,
  },
  fields: [
    {
      name: 'deviceId',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: {
        description: 'Stable device identifier (e.g. WX-SYD-001). Must be unique.',
      },
    },
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'location',
      type: 'relationship',
      relationTo: 'locations',
      required: true,
      index: true,
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'offline',
      index: true,
      options: [
        { label: 'Online', value: 'online' },
        { label: 'Offline', value: 'offline' },
        { label: 'Degraded', value: 'degraded' },
        { label: 'Maintenance', value: 'maintenance' },
      ],
    },
    {
      name: 'active',
      type: 'checkbox',
      required: true,
      defaultValue: true,
      admin: {
        description: 'Inactive devices are rejected by telemetry ingestion.',
      },
    },
    {
      name: 'simulationEnabled',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        description: 'Whether this device should be driven by the future device simulator.',
      },
    },
    {
      name: 'publishingIntervalSeconds',
      type: 'number',
      required: true,
      defaultValue: 10,
      min: 5,
      max: 3600,
    },
    {
      name: 'lastSeen',
      type: 'date',
      admin: {
        date: {
          pickerAppearance: 'dayAndTime',
        },
      },
    },
    {
      name: 'firmwareVersion',
      type: 'text',
    },
    {
      name: 'description',
      type: 'textarea',
    },
    {
      name: 'latestMetrics',
      type: 'group',
      label: 'Latest Metrics',
      admin: {
        description: 'Most recent telemetry snapshot for quick reference on the device record.',
      },
      fields: [
        {
          name: 'temperature',
          type: 'number',
          min: -60,
          max: 70,
          admin: { description: 'Degrees Celsius.' },
        },
        {
          name: 'humidity',
          type: 'number',
          min: 0,
          max: 100,
          admin: { description: 'Relative humidity percentage.' },
        },
        {
          name: 'pressure',
          type: 'number',
          min: 800,
          max: 1200,
          admin: { description: 'Barometric pressure in hPa.' },
        },
        {
          name: 'rainfall',
          type: 'number',
          min: 0,
          admin: { description: 'Rainfall in millimetres.' },
        },
        {
          name: 'windSpeed',
          type: 'number',
          min: 0,
          admin: { description: 'Wind speed in km/h.' },
        },
        {
          name: 'battery',
          type: 'number',
          min: 0,
          max: 100,
          admin: { description: 'Battery charge percentage.' },
        },
        {
          name: 'recordedAt',
          type: 'date',
          admin: {
            date: {
              pickerAppearance: 'dayAndTime',
            },
          },
        },
      ],
    },
  ],
}
