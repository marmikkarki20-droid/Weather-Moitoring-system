'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell, ChartNoAxesCombined, CloudSun, Cpu, FileDown, FlaskConical, Gauge, Map, Radio, ServerCog, TriangleAlert } from 'lucide-react'

const navigation = [
  { label: 'Overview', href: '/dashboard', icon: Gauge },
  { label: 'Live', href: '/dashboard/live', icon: Radio },
  { label: 'History', href: '/dashboard/history', icon: ChartNoAxesCombined },
  { label: 'Devices', href: '/dashboard/devices', icon: Cpu },
  { label: 'Map', href: '/dashboard/map', icon: Map },
  { label: 'Alerts', href: '/dashboard/alerts', icon: TriangleAlert },
  { label: 'Notifications', href: '/dashboard/notifications', icon: Bell },
  { label: 'Reports', href: '/dashboard/reports', icon: FileDown },
  { label: 'System', href: '/dashboard/system', icon: ServerCog },
  { label: 'Simulation', href: '/dashboard/simulation', icon: FlaskConical },
]

export function AppSidebar() {
  const pathname = usePathname()

  return (
    <aside className="app-sidebar">
      <Link href="/dashboard" className="sidebar-brand">
        <span className="brand-icon"><CloudSun size={21} /></span>
        <span><strong>WeatherGrid</strong><small>IoT operations</small></span>
      </Link>
      <p className="nav-label">Monitoring</p>
      <nav aria-label="Dashboard navigation" className="sidebar-nav">
        {navigation.map(({ label, href, icon: Icon }) => {
          const active = href === '/dashboard' ? pathname === href : pathname.startsWith(href)
          return (
            <Link key={href} href={href} className={`nav-link ${active ? 'active' : ''}`}>
              <Icon size={18} aria-hidden="true" /><span>{label}</span>
              {label === 'Live' && <i className="live-indicator" aria-hidden="true" />}
            </Link>
          )
        })}
      </nav>
      <div className="sidebar-status"><span /><div><strong>Services online</strong><small>Local development</small></div></div>
    </aside>
  )
}
