import { headers as getHeaders } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import React from 'react'

import config from '@payload-config'
import { AppHeader } from '@/components/app-header'
import { AppSidebar } from '@/components/app-sidebar'
import { DashboardRealtimeProvider } from '@/components/dashboard-realtime'

/**
 * Authenticated route group layout. Redirects to the Payload admin login
 * if there is no signed-in user, and renders the shared header/sidebar shell.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const headers = await getHeaders()
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers })

  // API-key-only service accounts authenticate to ingestion only; they are
  // never interactive dashboard principals.
  if (!user || !('role' in user)) {
    redirect('/admin/login?redirect=/dashboard')
  }

  const dashboardUser = user as { name?: string; email: string; role?: string }
  const userLabel = dashboardUser.name || dashboardUser.email
  const role = dashboardUser.role ?? 'viewer'

  return (
    <DashboardRealtimeProvider><div className="flex min-h-screen flex-col">
      <AppHeader userLabel={userLabel} role={role} />
      <div className="flex flex-1"><AppSidebar /><main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main></div>
    </div></DashboardRealtimeProvider>
  )
}
