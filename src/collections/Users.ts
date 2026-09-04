import type { CollectionConfig } from 'payload'

import { isAdmin, isAdminField, isAdminPanelUser } from '@/access'

/**
 * Users collection with built-in Payload authentication.
 *
 * Roles:
 * - `admin`: full access, including the Payload Admin Panel and user management.
 * - `viewer`: authenticated frontend access only (e.g. the /dashboard placeholder).
 */
export const Users: CollectionConfig = {
  slug: 'users',
  auth: true,
  admin: {
    useAsTitle: 'email',
  },
  access: {
    // Only admins may access the Admin Panel UI itself.
    admin: isAdminPanelUser,
    // Only admins may create, read, update, or delete user records
    // (other than reading/updating their own account via auth endpoints).
    create: isAdmin,
    read: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  fields: [
    {
      name: 'name',
      type: 'text',
    },
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'viewer',
      saveToJWT: true,
      options: [
        { label: 'Administrator', value: 'admin' },
        { label: 'Viewer', value: 'viewer' },
      ],
      access: {
        // Only admins may change a user's role.
        update: isAdminField,
      },
    },
  ],
}

