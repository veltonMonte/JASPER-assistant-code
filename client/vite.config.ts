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

// Runtime hooks need a fresh React tree, and main.tsx must never call createRoot twice.
const reloadRuntimeHooks = () => ({
  name: 'reload-runtime-hooks',
  handleHotUpdate(context: { file: string; server: { ws: { send: (message: { type: string; path: string }) => void } } }) {
    const file = context.file.replace(/\\/g, '/');
    if (file.includes('/src/hooks/') || file.endsWith('/src/main.tsx')) {
      context.server.ws.send({ type: 'full-reload', path: '*' });
      return [];
    }
  },
});

export default defineConfig({
  plugins: [react(), apkPlugin(), reloadRuntimeHooks()],
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
        configure(proxy) {
          proxy.on('proxyReqWs', (proxyReq, req) => {
            // The backend sees Vite as localhost; preserve the browser's real IP.
            proxyReq.setHeader('x-jasper-client-ip', req.socket.remoteAddress || '');
            proxyReq.setHeader('x-jasper-proxy', 'vite');
          });
        },
      },
      '/api': {
        target: 'http://127.0.0.1:3000',
      },
    },
  },
})
