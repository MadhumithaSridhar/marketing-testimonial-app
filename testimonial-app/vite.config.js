import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // IMPORTANT for GitHub Pages: set this to '/<your-repo-name>/'
  // e.g. if your repo is github.com/you/testimonial-app, use '/testimonial-app/'
  base: '/testimonial-app/',
  resolve: {
    alias: {
      '@components': path.resolve(__dirname, './src/components'),
      '@lib': path.resolve(__dirname, './src/lib'),
    },
  },
})
