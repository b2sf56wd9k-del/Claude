import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// ARTIFACT=1 gera os arquivos na raiz de dist-artifact, para o script scripts/build-artifact.mjs montar a página.
const artifact = process.env.ARTIFACT === '1'

export default defineConfig({
  base: './',
  plugins: [react()],
  build: artifact ? { outDir: 'dist-artifact', assetsDir: '', modulePreload: false } : {},
})
