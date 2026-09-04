import type { Access, FieldAccess } from 'payload'

/**
 * Roles supported by the `users` collection. Kept in one place so
 * access-control helpers and collection configs stay in sync.
 */
export type Role = 'admin' | 'viewer'

type MaybeRoleUser = unknown

const getRole = (user: MaybeRoleUser): Role | undefined => {
  if (!user || typeof user !== 'object' || !('role' in user)) return undefined
  return (user as { role?: Role }).role
}

/** True if the given user has the `admin` role. */
export const isAdminUser = (user: MaybeRoleUser): boolean => getRole(user) === 'admin'

/** True if the given user has the `viewer` role. */
export const isViewerUser = (user: MaybeRoleUser): boolean => getRole(user) === 'viewer'

/** True for interactive dashboard principals, never native service accounts. */
export const isDashboardUser = (user: MaybeRoleUser): boolean => isAdminUser(user) || isViewerUser(user)

/**
 * Collection/field access rule: any authenticated user (admin or viewer)
 * may perform the operation, e.g. reading weather data.
 */
export const isAuthenticated: Access = ({ req: { user } }) => Boolean(user)

/**
 * Collection access rule: only administrators may perform the operation
 * (create/update/delete/read). Denies anonymous and viewer users.
 */
export const isAdmin: Access = ({ req: { user } }) => isAdminUser(user)

/**
 * Admin Panel access rule: only administrators may access the Payload
 * Admin Panel UI. Matches the narrower `{ req } => boolean` signature
 * Payload uses for `collection.access.admin`.
 */
export const isAdminPanelUser = ({ req: { user } }: { req: { user: MaybeRoleUser } }): boolean =>
  isAdminUser(user)

/**
 * Field-level access rule: only administrators may read/update this field.
 * Same semantics as `isAdmin` but matches Payload's field-access signature.
 */
export const isAdminField: FieldAccess = ({ req: { user } }) => isAdminUser(user)
