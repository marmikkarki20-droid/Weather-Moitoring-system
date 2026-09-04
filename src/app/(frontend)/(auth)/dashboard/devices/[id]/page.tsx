import { DashboardDataPanel } from '@/components/dashboard-data-panel'
export default async function DevicePage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <DashboardDataPanel mode="history" deviceId={id} /> }
