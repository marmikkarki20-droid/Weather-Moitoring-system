import type { CollectionConfig } from 'payload'

import { isAdmin } from '@/access'

/**
 * Physical weather station locations (e.g. a city). Grouped with `devices`
 * and `weather-readings` under "Weather System" in the Admin Panel.
 *
 * - Administrators: full create/read/update/delete access.
 * - Viewers: read-only access, and only to locations marked `active`.
 */
export const Locations: CollectionConfig = {
  slug: 'locations',
  labels: {
    singular: 'Location',
    plural: 'Locations',
  },
  admin: {
    group: 'Weather System',
    useAsTitle: 'name',
    defaultColumns: ['name', 'code', 'city', 'country', 'active'],
  },
  access: {
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
    read: ({ req: { user } }) => {
      if (!user) return false
      // Admins see every location; viewers only see active ones.
      const role = (user as { role?: string }).role
      if (role === 'admin') return true
      return { active: { equals: true } }
    },
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'code',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: {
        description: 'Unique short identifier for this location (e.g. SYD, MEL, BNE).',
      },
    },
    {
      name: 'city',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'stateOrRegion',
      type: 'text',
    },
    {
      name: 'country',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'latitude',
      type: 'number',
      required: true,
      min: -90,
      max: 90,
    },
    {
      name: 'longitude',
      type: 'number',
      required: true,
      min: -180,
      max: 180,
    },
    {
      name: 'timezone',
      type: 'text',
      required: true,
    },
    {
      name: 'active',
      type: 'checkbox',
      defaultValue: true,
      index: true,
    },
    {
      name: 'description',
      type: 'textarea',
    },
  ],
}
