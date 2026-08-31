import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { patchNotesLocalApiPlugin } from './vite-plugins/patchNotesLocalApiPlugin.ts'
import { comboLabLocalApiPlugin } from './vite-plugins/comboLabLocalApiPlugin.ts'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages ではリポジトリ名がパスに含まれる
  // (https://yuto-boobam.github.io/Combo-LAB/) ため、base を合わせる
  base: '/Combo-LAB/',
  plugins: [
    react(),
    tailwindcss(),
    patchNotesLocalApiPlugin(),
    comboLabLocalApiPlugin(),
  ],
  server: {
    // Rootedと同じ既定ポート(5173)を使うと、どちらかが先に起動している時に
    // もう片方が別ポートへ自動でずれ、localStorage（ポート込みのオリジン単位）が
    // 別物になってデータが消えたように見える事故が起きる。ポートを固定し、
    // 使用中なら自動フォールバックせず落ちるようにして事故を早期に気付けるようにする。
    port: 5190,
    strictPort: true,
  },
})
