import express from 'express';
import http from 'http';
import path from 'path';
import cors from 'cors';
import { config } from '../config/config.js';
import { dbManager } from '../database/database.js';
import routes from './routes.js';
import { jasperWsServer } from './websocket.js';
import { scheduler } from './scheduler.js';

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir arquivos estáticos do Web Client / PWA no Celular
const publicDir = path.resolve(process.cwd(), 'public');
app.use(express.static(publicDir, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.apk')) {
      res.setHeader('Content-Type', 'application/vnd.android.package-archive');
      res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
    }
  }
}));

// Rotas da API REST
app.use('/api', routes);

// Rota de fallback para a SPA Web
app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Inicialização dos serviços
async function bootstrap() {
  try {
    console.log('🚀 Inicializando Servidor Central do JASPER...');
    
    // 1. Inicializa Banco de Dados SQLite
    await dbManager.init();

    // 2. Inicializa o agendador de alarmes e tarefas
    scheduler.start();

    const tryListen = (port: number) => {
      const server = http.createServer(app);

      server.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          console.warn(`⚠️ Porta ${port} ocupada. Tentando porta ${port + 1}...`);
          tryListen(port + 1);
        } else {
          console.error('❌ Erro no servidor HTTP:', err);
        }
      });

      server.listen(port, config.host, () => {
        // Inicializa o WebSocketServer apenas quando a porta foi confirmada
        jasperWsServer.init(server);

        console.log(`\n==================================================`);
        console.log(`🤖 JASPER AI Personal Assistant ON-LINE`);
        console.log(`🌐 Servidor HTTP:  http://${config.host}:${port}`);
        console.log(`📡 WebSocket:      ws://${config.host}:${port}/ws`);
        console.log(`📱 Acesso Celular: http://<IP_DO_NOTEBOOK>:${port}`);
        console.log(`==================================================\n`);
      });
    };

    tryListen(config.port);
  } catch (error: any) {
    console.error('❌ Erro fatal durante a inicialização do JASPER:', error.message);
    process.exit(1);
  }
}

bootstrap();
