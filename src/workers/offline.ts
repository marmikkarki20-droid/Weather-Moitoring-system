import { getPayload } from 'payload'
import config from '@/payload.config'
import { runOfflineDetection } from '@/workers/offline-detector'

const seconds = Number(process.env.OFFLINE_WORKER_INTERVAL_SECONDS || 10)
const enabled = process.env.OFFLINE_WORKER_ENABLED !== 'false'

async function main() {
  if (!enabled) return
  const payload = await getPayload({ config })
  const execute = async () => {
    try { await runOfflineDetection(payload) } catch (error) { payload.logger.error({ err: error, msg: 'Offline worker run failed' }) }
  }
  await execute()
  const timer = setInterval(execute, Math.max(1, seconds) * 1000)
  const stop = () => { clearInterval(timer); process.exit(0) }
  process.on('SIGINT', stop); process.on('SIGTERM', stop)
}
main().catch(error => { console.error('Offline worker failed:', error); process.exit(1) })
