import Link from 'next/link'

export function AppSidebar() {
  return (
    <aside className="hidden w-60 shrink-0 border-r border-border bg-muted/20 p-4 md:block">
      <nav aria-label="Dashboard navigation" className="flex flex-col gap-1 text-sm">
        {[['Overview', '/dashboard'], ['Live Monitoring', '/dashboard/live'], ['History', '/dashboard/history'], ['Devices', '/dashboard/devices'], ['Weather Map', '/dashboard/map'], ['Alerts', '/dashboard/alerts'], ['Notifications', '/dashboard/notifications'], ['Reports', '/dashboard/reports'], ['System Health', '/dashboard/system'], ['Simulation Lab', '/dashboard/simulation']].map(([label, href]) => <Link key={href} href={href} className="rounded-md px-3 py-2 text-muted-foreground outline-none transition hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-sky-500">{label}</Link>)}
      </nav>
    </aside>
  )
}
