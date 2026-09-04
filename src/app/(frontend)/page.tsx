import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-3xl font-semibold">WeatherGrid</h1>
      <p className="max-w-md text-muted-foreground">
        Distributed IoT Weather Monitoring System — application foundation stage. IoT telemetry,
        devices and dashboards will be added in later stages.
      </p>
      <div className="flex gap-3">
        <Link
          href="/dashboard"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Go to Dashboard
        </Link>
        <Link
          href="/admin"
          className="rounded-md border border-border px-4 py-2 text-sm font-medium"
        >
          Admin Panel
        </Link>
      </div>
    </main>
  )
}
