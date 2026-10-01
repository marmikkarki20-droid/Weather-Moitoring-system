import Link from 'next/link'
import { ExternalLink, UserRound } from 'lucide-react'
import { ConnectionStatus } from '@/components/dashboard-realtime'
import { LogoutButton } from '@/components/logout-button'

export function AppHeader({ userLabel, role }: { userLabel: string; role: string }) {
  return (
    <header className="app-header">
      <div className="header-title"><p>WeatherGrid network</p><strong>Operations dashboard</strong></div>
      <div className="header-controls">
        <ConnectionStatus />
        {role === 'admin' && <Link href="/admin" className="header-link" title="Open Payload Admin"><ExternalLink size={15} /><span>Admin</span></Link>}
        <div className="user-summary"><span className="user-avatar"><UserRound size={16} /></span><div><strong>{userLabel}</strong><small>{role}</small></div></div>
        <LogoutButton />
      </div>
    </header>
  )
}
