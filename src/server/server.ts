import express from 'express';
import http from 'http';
import path from 'path';
import cors from 'cors';
import { config } from '../config/config.js';
import { dbManager } from '../database/database.js';
import routes from './routes.js';
import { jasperWsServer } from './websocket.js';
import { scheduler } from './scheduler.js';
import { proactiveService } from '../proactive/runtime.js';
import { isAllowedOrigin } from '../security/origin.js';
import { systemSecurityMonitor } from '../security/system-monitor.js';
import { innerLife } from '../ai/inner-life-service.js';

const app = express();

// Middlewares
app.use((req, res, next) => {
  if (!isAllowedOrigin(req.header('origin'), req.header('host'), req.protocol, config.security.allowedOrigins)) {
    res.status(403).json({ error: 'Origem não permitida.' }); return;
  }
  next();
});
app.use(cors((req, callback) => callback(null, { origin: typeof req.headers.origin === 'string' ? req.headers.origin : false })));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api', routes);

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

// Rota de fallback para a SPA Web
app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Inicialização dos serviços
async function bootstrap() {
  try {
    console.log('🚀 Inicializando Servidor Central do JASPER...');
    if (config.security.generated) console.log(`Token temporário da API para esta execução de desenvolvimento: ${config.security.token}`);
    
    // 1. Inicializa Banco de Dados SQLite
    await dbManager.init();

    // 2. Inicializa o agendador de alarmes e tarefas
    scheduler.start();

    // 3. Inicializa o agente de monitoramento de segurança 24h
    systemSecurityMonitor.start();

    try {
      await proactiveService.init();
      proactiveService.start();
    } catch (error: any) {
      console.warn('Notícias proativas indisponíveis:', error.message);
    }

    const server = http.createServer(app);
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`❌ O Jasper já está usando a porta ${config.port}. Feche a instância anterior antes de iniciar outra.`);
      } else {
        console.error('❌ Erro no servidor HTTP:', err);
      }
      process.exit(1);
    });

    server.listen(config.port, config.host, () => {
      jasperWsServer.init(server);

      console.log(`\n==================================================`);
      console.log(`🤖 JASPER AI Personal Assistant ON-LINE`);
      console.log(`🌐 Servidor HTTP:  http://${config.host}:${config.port}`);
      console.log(`📡 WebSocket:      ws://${config.host}:${config.port}/ws`);
      console.log(`📱 Acesso Celular: http://<IP_DO_NOTEBOOK>:${config.port}`);
      console.log(`==================================================\n`);
    });

    const gracefulShutdown = async (signal: string) => {
      console.log(`\n🛑 Sinal ${signal} recebido. Salvando estado e encerrando o JASPER com segurança...`);
      try {
        await innerLife.flush();
        systemSecurityMonitor.stop();
        scheduler.stop();
        await dbManager.close();
      } catch (err) {
        console.error('⚠️ Erro ao encerrar serviços:', err);
      } finally {
        process.exit(0);
      }
    };

    process.once('SIGINT', () => void gracefulShutdown('SIGINT'));
    process.once('SIGTERM', () => void gracefulShutdown('SIGTERM'));
  } catch (error: any) {
    console.error('❌ Erro fatal durante a inicialização do JASPER:', error.message);
    process.exit(1);
  }
}

bootstrap();
