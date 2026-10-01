'use client'

import { LogOut } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function LogoutButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const logout = async () => {
    setLoading(true)

    try {
      const response = await fetch('/api/users/logout', {
        method: 'POST',
        credentials: 'same-origin',
      })

      if (!response.ok) throw new Error('Logout failed')

      router.replace('/admin/login?redirect=/dashboard')
      router.refresh()
    } catch {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={() => void logout()}
      disabled={loading}
      aria-label="Log out"
      title="Log out"
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted disabled:cursor-wait disabled:opacity-60"
    >
      <LogOut aria-hidden="true" size={14} />
      <span className="logout-label">{loading ? 'Logging out...' : 'Log out'}</span>
    </button>
  )
}
