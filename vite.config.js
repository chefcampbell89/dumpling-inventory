import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// Dumpling Genie pins its OWN fixed ports so its dev/preview servers never collide
// with the Ops Genie fork, which uses Vite's defaults (5173 / 4173). strictPort
// makes Vite fail loudly if the port is already taken, instead of silently serving
// on the next free port — which is how localhost:5173 ended up showing the wrong app.
export default defineConfig({
  plugins: [react()],
  server: { port: 5180, strictPort: true },
  preview: { port: 4180, strictPort: true },
})
