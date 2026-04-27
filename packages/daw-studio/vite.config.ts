import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: {
    hmr: { port: 5175 },
  },
  resolve: {
    dedupe: ['react', 'react-dom', 'zustand'],
  },
  build: mode === 'lib' ? {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'DAWStudio',
      fileName: 'daw-studio',
      formats: ['es', 'umd'],
    },
    rollupOptions: {
      external: ['react', 'react-dom'],
      output: { globals: { react: 'React', 'react-dom': 'ReactDOM' } },
    },
  } : {},
}))
