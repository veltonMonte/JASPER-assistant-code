# Restrição de Terminal e Remoção de Agente Remoto

## Resumo das Modificações
Esta branch (`fix/restricao-terminal-seguranca`) atende diretamente às seguintes diretrizes de segurança:
1. **Remoção Total do Agente Remoto**:
   - Foram excluídos os arquivos de agente remoto não auditados: `jasper-agent.js`, `public/agent.js` e `src/tools/remote-terminal.ts`.
   - Limpeza dos manipuladores de registro e despacho de WebSocket (`REGISTER_TERMINAL_AGENT` e `REMOTE_COMMAND_RESULT`).
2. **Exclusividade do Dispositivo Master para Terminal**:
   - Apenas o computador principal (Host/Master) pode executar comandos locais no sistema operacional Linux.
   - Dispositivos remotos (celulares, tablets, navegadores em rede local) ficam proibidos de executar comandos de terminal, solicitar comandos por voz/texto ou aprovar ações pendentes.
3. **Política Default-Deny**:
   - `executarTerminal` e `solicitarTerminalPorVoz` possuem padrão `isMaster = false`.
   - Apenas contextos com `isMaster === true` explicitamente verificado pelo servidor têm permissão de envio para execução.
4. **Proteção Multimodal (Texto, Áudio e Gemini Live)**:
   - WebSocket valida a identidade Master em `TERMINAL_APPROVAL_RESPONSE`, `TEXT_COMMAND`, `VOICE_COMMAND` e `processCommandFallback`.
   - `GeminiLiveSession` recebe `setIsMaster(isMaster)` e injeta o contexto nas chamadas de função do modelo.

## Testes Realizados
- `tests/terminal-master-security.test.ts`: 5 testes cobrindo recusa a não-masters, default-deny, aprovação Master, rejeição via Gemini Live e IntentRouter.
- Verificação de tipos TypeScript do servidor (`npx tsc --noEmit`): 0 erros.
- Verificação de tipos TypeScript do cliente (`npx tsc --noEmit -p client`): 0 erros.
