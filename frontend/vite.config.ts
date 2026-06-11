import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// Proxy target: localhost for host-run dev, overridden to the Docker service
// (http://backend:3000) by docker-compose.override.yml for in-container HMR.
const proxyTarget = process.env.VITE_PROXY_TARGET || 'http://localhost:3000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true,
    proxy: {
      '/api': {
        target: proxyTarget,
        changeOrigin: true,
      },
      '/socket.io': {
        target: proxyTarget,
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    // No production sourcemaps: smaller deploy and no source exposure. Re-enable
    // locally with `vite build --sourcemap` when debugging a prod bundle.
    sourcemap: false,
    rollupOptions: {
      output: {
        // Split heavy, rarely-changing dependencies into long-cacheable vendor
        // chunks so app code updates don't bust the framework cache.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id))
            return 'react-vendor'
          if (id.includes('@tanstack')) return 'query-vendor'
          if (id.includes('socket.io') || id.includes('engine.io')) return 'realtime-vendor'
          if (id.includes('react-hook-form') || id.includes('@hookform') || id.includes('zod'))
            return 'form-vendor'
          return undefined
        },
      },
    },
  },
})
