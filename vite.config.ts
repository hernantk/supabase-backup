import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import electronRenderer from 'vite-plugin-electron-renderer'
import path from 'path'

const sharedElectronExternals = [
  'electron',
  'electron-store',
  '@aws-sdk/client-s3',
  '@google-cloud/storage',
  '@azure/storage-blob',
  '@supabase/supabase-js',
  'archiver',
  'node-cron',
  'winston',
  'yauzl',
]

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              output: { format: 'cjs' },
              external: sharedElectronExternals,
            },
          },
        },
      },
      {
        entry: 'electron/preload.ts',
        onstart(args) {
          args.reload()
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              output: { format: 'cjs' },
            },
          },
        },
      },
    ]),
    electronRenderer(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
