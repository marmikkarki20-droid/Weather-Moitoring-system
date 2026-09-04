import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { delimiter, resolve } from 'node:path'
import process from 'node:process'

const [service, ...pythonArgs] = process.argv.slice(2)

if (!service || pythonArgs.length === 0) {
  console.error('Usage: node scripts/service-python.mjs <service> <python-args...>')
  process.exit(1)
}

const serviceDir = resolve('services', service)

if (!existsSync(serviceDir)) {
  console.error(`Unknown service "${service}" at ${serviceDir}`)
  process.exit(1)
}

const venvCandidates =
  process.platform === 'win32'
    ? ['Scripts/python.exe', 'Scripts/python', 'bin/python3', 'bin/python']
    : ['bin/python3', 'bin/python', 'Scripts/python.exe', 'Scripts/python']

const pathCandidates =
  process.platform === 'win32'
    ? [
        { command: 'py', argsPrefix: ['-3'] },
        { command: 'python', argsPrefix: [] },
        { command: 'python3', argsPrefix: [] },
      ]
    : [
        { command: 'python3', argsPrefix: [] },
        { command: 'python', argsPrefix: [] },
        { command: 'py', argsPrefix: ['-3'] },
      ]

const candidates = [
  ...venvCandidates
    .map((relativePath) => resolve(serviceDir, '.venv', relativePath))
    .filter((command) => existsSync(command))
    .map((command) => ({ command, argsPrefix: [] })),
  ...pathCandidates,
]

const env = {
  ...process.env,
  PYTHONPATH: process.env.PYTHONPATH
    ? `${serviceDir}${delimiter}${process.env.PYTHONPATH}`
    : serviceDir,
}

let lastError

for (const candidate of candidates) {
  const args = [...candidate.argsPrefix, ...pythonArgs]
  const result = spawnSync(candidate.command, args, {
    env,
    stdio: 'inherit',
  })

  if (result.error?.code === 'ENOENT') {
    lastError = result.error
    continue
  }

  if (result.error) {
    console.error(result.error.message)
    process.exit(1)
  }

  process.exit(result.status ?? 0)
}

console.error(`Could not find Python for ${service}. Create services/${service}/.venv or install Python 3.`)
if (lastError) {
  console.error(lastError.message)
}
process.exit(1)
