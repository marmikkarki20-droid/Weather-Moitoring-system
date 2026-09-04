import type { CollectionConfig } from 'payload'
import { isAdminUser, isDashboardUser } from '@/access'

const ownOrAdmin = ({ req }: { req: { user?: unknown } }) => {
  if (isAdminUser(req.user)) return true
  if (!isDashboardUser(req.user) || !req.user || typeof req.user !== 'object' || !('id' in req.user)) return false
  return { user: { equals: (req.user as { id: number }).id } }
}
export const NotificationPreferences: CollectionConfig = {
  slug: 'notification-preferences', admin: { group: 'Notifications', useAsTitle: 'user' },
  access: { create: ownOrAdmin, read: ownOrAdmin, update: ownOrAdmin, delete: () => false },
  fields: [
    { name: 'user', type: 'relationship', relationTo: 'users', required: true, unique: true, index: true, access: { update: () => false } },
    { name: 'emailEnabled', type: 'checkbox', defaultValue: false, required: true }, { name: 'minimumSeverity', type: 'select', defaultValue: 'warning', required: true, options: ['warning', 'critical'].map(value => ({ label: value, value })) },
    ...['alertCreated', 'alertEscalated', 'alertResolved', 'deviceOffline', 'deviceRecovered'].map(name => ({ name, type: 'checkbox' as const, defaultValue: true, required: true })),
    { name: 'selectedLocations', type: 'relationship', relationTo: 'locations', hasMany: true }, { name: 'selectedDevices', type: 'relationship', relationTo: 'devices', hasMany: true }, { name: 'allDevices', type: 'checkbox', defaultValue: true, required: true },
    { name: 'quietHoursEnabled', type: 'checkbox', defaultValue: false, required: true }, { name: 'quietHoursStart', type: 'text', admin: { description: '24-hour local time, HH:MM.' } }, { name: 'quietHoursEnd', type: 'text', admin: { description: '24-hour local time, HH:MM.' } }, { name: 'timezone', type: 'text', required: true, defaultValue: 'UTC' },
    { name: 'dailyDigestEnabled', type: 'checkbox', defaultValue: false, required: true }, { name: 'dailyDigestTime', type: 'text' }, { name: 'weeklyDigestEnabled', type: 'checkbox', defaultValue: false, required: true }, { name: 'weeklyDigestDay', type: 'select', options: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(value => ({ label: value, value })) }, { name: 'weeklyDigestTime', type: 'text' }, { name: 'includePDFReport', type: 'checkbox', defaultValue: false, required: true }, { name: 'lastDailyDigestAt', type: 'date' }, { name: 'lastWeeklyDigestAt', type: 'date' },
  ],
}
