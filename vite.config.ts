import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  root: fileURLToPath(new URL('./src/apps', import.meta.url)),
  plugins: [viteSingleFile()],
  build: {
    outDir: fileURLToPath(new URL('./dist/apps', import.meta.url)),
    emptyOutDir: true,
    rollupOptions: {
      input: fileURLToPath(
        new URL('./src/apps/email-approval.html', import.meta.url),
      ),
    },
  },
});
