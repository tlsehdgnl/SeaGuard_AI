import { defineConfig } from 'vite';
export default defineConfig({
  esbuild: { jsxFactory: 'localizedElement', jsxInject: 'import { localizedElement } from "/src/i18n.js"' },
  server: { proxy: { '/api': process.env.SEAGUARD_DEV_API_TARGET || 'http://127.0.0.1:8000' } },
});
