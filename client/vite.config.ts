import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const apkPlugin = () => ({
  name: 'apk-mime-type',
  configureServer(server: any) {
    server.middlewares.use((req: any, res: any, next: any) => {
      if (req.url && req.url.includes('.apk')) {
        res.setHeader('Content-Type', 'application/vnd.android.package-archive');
        res.setHeader('Content-Disposition', `attachment; filename="${path.basename(req.url.split('?')[0])}"`);
      }
      next();
    });
  }
});

export default defineConfig({
  plugins: [react(), apkPlugin()],
  build: {
    outDir: path.resolve(__dirname, '../public'),
    emptyOutDir: false,
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/ws': {
        target: 'ws://127.0.0.1:3000',
        ws: true,
      },
      '/api': {
        target: 'http://127.0.0.1:3000',
      },
    },
  },
})
