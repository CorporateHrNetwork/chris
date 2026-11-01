import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import {demoIsolation} from './scripts/demo-build-isolation.mjs'

// Development keeps browser traffic on one origin. Requests under /api are
// proxied to the local CHRiS backend, which lets a temporary HTTPS tunnel expose
// the complete application without making remote browsers call localhost:5000.
export default defineConfig({
  plugins: [demoIsolation(),react()],
  build:{emptyOutDir:true,rollupOptions:{output:{chunkFileNames:chunk=>'assets/'+chunk.name.replace(/zermatt/gi,'demo')+'-[hash].js'}}},
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
    },
  },
})
