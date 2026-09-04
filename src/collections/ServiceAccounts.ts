import type { CollectionConfig } from 'payload'

import { isAdmin, isAdminPanelUser } from '@/access'

/**
 * Non-interactive principals for server-to-server integrations. Payload owns
 * API-key generation, encryption, and authentication for this collection.
 */
export const ServiceAccounts: CollectionConfig = {
  slug: 'service-accounts',
  labels: {
    singular: 'Service Account',
    plural: 'Service Accounts',
  },
  auth: {
    useAPIKey: true,
    // A gateway is not a dashboard user and must never use email/password
    // login, cookies, or normal interactive authentication endpoints.
    disableLocalStrategy: true,
  },
  admin: {
    group: 'System',
    useAsTitle: 'name',
  },
  access: {
    admin: isAdminPanelUser,
    create: isAdmin,
    read: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'accountType',
      type: 'select',
      required: true,
      defaultValue: 'edge-gateway',
      options: [{ label: 'Edge Gateway', value: 'edge-gateway' }],
    },
    {
      name: 'active',
      type: 'checkbox',
      required: true,
      defaultValue: true,
    },
    {
      name: 'description',
      type: 'textarea',
    },
    {
      name: 'lastUsedAt',
      type: 'date',
      admin: {
        date: { pickerAppearance: 'dayAndTime' },
        readOnly: true,
      },
    },
  ],
}
