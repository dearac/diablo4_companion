import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    server: {
      fs: {
        allow: [
          resolve('src/renderer'),
          resolve('src/shared'),
          resolve('node_modules')
        ]
      }
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          detach: resolve(__dirname, 'src/renderer/detach.html')
        }
      }
    }
  }
})
