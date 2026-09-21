import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [cloudflareTest({
    wrangler: { configPath: './worker/wrangler.jsonc' },
    miniflare: {
      bindings: {
        AUTH_SECRET: 'worker-runtime-test-auth-secret',
        TIME_CLOCK_DEVICE_MASTER_SECRET: 'worker-runtime-test-device-secret',
      },
    },
  })],
  test: {
    include: ['worker/**/*.integration.test.js'],
  },
})
