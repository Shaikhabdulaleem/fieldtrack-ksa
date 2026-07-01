import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// HTTPS is only needed when testing the driver app on Android (GPS + camera
// require a secure origin on Android Chrome). Run `npm run dev:https` to
// enable it. Admin/manager dashboard testing on desktop uses plain HTTP.
const useHttps = process.env.VITE_HTTPS === 'true'

function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

export default defineConfig({
  plugins: [
    figmaAssetResolver(),
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
    // Only active when started with `npm run dev:https` (driver mobile testing)
    ...(useHttps ? [basicSsl()] : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  server: {
    host: true,
    proxy: {
      // Proxy /api and /uploads to the backend in development.
      // The frontend uses relative URLs (/api/v1/...) so there are no
      // mixed-content or port-mismatch issues.
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],
})
