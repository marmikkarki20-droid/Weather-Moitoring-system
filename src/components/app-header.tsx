import Link from 'next/link'
import { ConnectionStatus } from '@/components/dashboard-realtime'

/**
 * Minimal application header placeholder.
 * Full navigation/branding will be expanded in later stages.
 */
export function AppHeader({ userLabel, role }: { userLabel: string; role: string }) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur">
      <Link href="/dashboard" className="font-semibold tracking-tight">
        WeatherGrid
      </Link>
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <ConnectionStatus />
        {userLabel} <span className="rounded bg-muted px-2 py-0.5 text-xs uppercase">{role}</span>
      </div>
    </header>
  )
}
