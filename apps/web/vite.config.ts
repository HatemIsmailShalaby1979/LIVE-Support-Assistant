import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    // transformers.js ships its own ONNX runtime and resolves worker and wasm
    // assets at runtime; pre-bundling it breaks those paths.
    exclude: ['@huggingface/transformers'],
  },
})
