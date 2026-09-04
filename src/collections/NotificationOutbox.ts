import type { CollectionConfig } from 'payload'
import { isAdmin } from '@/access'
export const NotificationOutbox: CollectionConfig = {
  slug: 'notification-outbox', admin: { group: 'Notifications', useAsTitle: 'subject', defaultColumns: ['notificationType', 'recipientEmail', 'status', 'nextAttemptAt'] },
  access: { create: () => false, update: () => false, delete: () => false, read: isAdmin },
  fields: [
    { name: 'idempotencyKey', type: 'text', required: true, unique: true, index: true }, { name: 'notificationType', type: 'select', required: true, index: true, options: ['alert-created', 'alert-escalated', 'alert-resolved', 'device-offline', 'device-recovered', 'daily-digest', 'weekly-digest'].map(value => ({ label: value, value })) }, { name: 'recipientUser', type: 'relationship', relationTo: 'users', required: true, index: true }, { name: 'recipientEmail', type: 'email', required: true }, { name: 'alert', type: 'relationship', relationTo: 'alerts' }, { name: 'device', type: 'relationship', relationTo: 'devices' },
    { name: 'status', type: 'select', required: true, defaultValue: 'pending', index: true, options: ['pending', 'processing', 'sent', 'retry', 'failed', 'cancelled'].map(value => ({ label: value, value })) }, { name: 'subject', type: 'text', required: true }, { name: 'templateData', type: 'json', required: true }, { name: 'attemptCount', type: 'number', required: true, defaultValue: 0, min: 0 }, { name: 'nextAttemptAt', type: 'date', required: true, index: true }, { name: 'lockedAt', type: 'date' }, { name: 'lockedBy', type: 'text' }, { name: 'sentAt', type: 'date' }, { name: 'providerMessageId', type: 'text' }, { name: 'lastErrorCategory', type: 'text' }, { name: 'lastErrorMessage', type: 'text' },
  ], indexes: [{ fields: ['status', 'nextAttemptAt'] }, { fields: ['recipientUser', 'notificationType'] }],
}
