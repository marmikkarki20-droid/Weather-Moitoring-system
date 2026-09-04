import { withPayload } from '@payloadcms/next/withPayload'

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for the Linux Docker deployment path described in the README.
  // Windows without Developer Mode cannot create the symlinks Next uses
  // while assembling `.next/standalone`, so omit it only for local Windows
  // builds. Linux/production builds retain standalone output.
  ...(process.platform === 'win32' ? {} : { output: 'standalone' }),

  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]
  },
}

export default withPayload(nextConfig)
