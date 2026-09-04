import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { SimulationLab } from '@/components/simulation-lab'

export default async function SimulationPage() { const payload = await getPayload({ config }); const auth = await payload.auth({ headers: await headers() }); if (!auth.user || !('role' in auth.user) || auth.user.role !== 'admin') redirect('/dashboard'); return <SimulationLab /> }
