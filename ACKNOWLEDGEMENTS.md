# Acknowledgements

This project, **WeatherGrid — Distributed IoT Weather Monitoring System**, is an original
academic project. It builds on ideas and code from two MIT-licensed open-source repositories,
credited below.

## 1. Payload App Starter

- Repository: https://github.com/brijr/payload-starter
- License: MIT
- Usage: This project's foundation — the Next.js App Router structure, Payload CMS
  configuration, PostgreSQL adapter setup, authentication/role-based access control pattern on
  the `Users` collection, Tailwind CSS, and shadcn/ui conventions — is directly derived from and
  modeled on this starter. File layout (`src/app/(frontend)`, `src/app/(payload)`,
  `src/collections`, `src/payload.config.ts`) and configuration choices (Postgres-only adapter,
  no Prisma/Firebase/MongoDB/Express) follow this starter's practices.

See [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md) for the full MIT license text as it
applies to reused code and patterns.

## 2. Real-Time IoT Edge Agent

- Repository: https://github.com/zaydabash/real-time-iot-edge-agent
- License: MIT
- Usage: **Architectural reference only, for future stages.** No code, configuration, or
  dependencies from this repository have been copied or merged into the codebase at this stage.
  It will inform the design of upcoming MQTT ingestion, simulated-device telemetry, fault
  tolerance, and live dashboard features once those stages begin. Until then, none of its
  IoT/MQTT/telemetry implementation exists in this project.

## Current Stage

This stage delivers only the application foundation: Next.js + Payload CMS + PostgreSQL,
authentication and roles, and a placeholder authenticated dashboard route. IoT-specific features
(MQTT, device/location collections, weather readings, alerts, simulation, charts, maps) are
explicitly out of scope until later stages.
