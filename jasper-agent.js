#!/usr/bin/env node
/**
 * ==============================================================================
 * JASPER Remote Terminal Agent
 * ==============================================================================
 * Conecta o terminal desta máquina ao JASPER Assistant central.
 * Permite que o JASPER execute diagnósticos e comandos nesta máquina com segurança.
 *
 * Modo de Uso:
 *   node jasper-agent.js --host http://IP_DO_JASPER:3000 --token SEU_TOKEN [--name "Meu PC"]
 * ==============================================================================
 */

const { exec } = require("child_process");
const os = require("os");
const WebSocket = require("ws");

// Parse de argumentos
const args = process.argv.slice(2);
function getArg(name, def = null) {
  const idx = args.indexOf(name);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return def;
}

const hostArg = getArg("--host", "http://127.0.0.1:3000");
const token = getArg("--token");
const deviceName = getArg("--name", os.hostname() || "Computador Remoto");
const deviceId = getArg("--id", "agent_" + Buffer.from(os.hostname()).toString("hex").slice(0, 8));

if (!token) {
  console.error("\n❌ Erro: O parâmetro --token é obrigatório.");
  console.log("Exemplo de uso:");
  console.log(`  node jasper-agent.js --host http://100.108.231.26:3000 --token SEU_TOKEN --name "${os.hostname()}"\n`);
  process.exit(1);
}

// Constrói URL do WebSocket
let wsUrl = hostArg.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
if (!wsUrl.endsWith("/ws")) {
  wsUrl = wsUrl.replace(/\/$/, "") + "/ws";
}

console.log("==================================================");
console.log("🤖 JASPER REMOTE TERMINAL AGENT");
console.log("📡 Conectando ao JASPER em: " + wsUrl);
console.log("💻 Dispositivo: " + deviceName + " (" + os.platform() + ")");
console.log("🔑 ID do Agente: " + deviceId);
console.log("==================================================\n");

function connect() {
  const ws = new WebSocket(wsUrl);

  ws.on("open", () => {
    console.log("✅ Conexão WebSocket estabelecida. Registrando terminal...");
    ws.send(JSON.stringify({
      type: "REGISTER_TERMINAL_AGENT",
      deviceId,
      deviceName,
      platform: os.platform(),
      token,
    }));
  });

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === "TERMINAL_AGENT_REGISTERED") {
        console.log("🎉 Agente autenticado e pronto! " + (msg.message || ""));
      } else if (msg.type === "TERMINAL_AGENT_ERROR") {
        console.error("❌ Falha de registro: " + msg.message);
      } else if (msg.type === "EXECUTE_REMOTE_COMMAND") {
        const { execId, command } = msg;
        console.log(`⚡ Executando comando solicitado pelo JASPER: "${command}"`);

        exec(command, { timeout: 45000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
          const output = (stdout || "").trim() || (stderr || "").trim();
          if (err) {
            console.warn(`⚠️ Comando falhou: ${err.message}`);
          } else {
            console.log(`✅ Comando concluído (${output.length} bytes de saída)`);
          }

          ws.send(JSON.stringify({
            type: "REMOTE_COMMAND_RESULT",
            execId,
            success: !err,
            output,
            error: err ? err.message : null,
          }));
        });
      }
    } catch (e) {
      console.error("Erro ao processar mensagem do servidor:", e.message);
    }
  });

  ws.on("close", () => {
    console.warn("⚠️ Conexão perdida. Tentando reconectar em 5 segundos...");
    setTimeout(connect, 5000);
  });

  ws.on("error", (err) => {
    console.error("❌ Erro no WebSocket:", err.message);
  });
}

connect();
