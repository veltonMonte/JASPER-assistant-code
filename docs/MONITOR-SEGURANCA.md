# Relatório de Implementação — Monitor de Segurança 24h

Data: 21/10/2026.
Branch: `feat/monitor-seguranca-24h`

## Objetivo
Implementar o agente de segurança contínuo (24h) em segundo plano no JASPER para auditar periodicamente o sistema host, detectando:
1. Processos suspeitos e maliciosos (mineradores de criptomoeda como xmrig/cpuminer, reverse shells, ferramentas de invasão e executáveis em pastas temporárias não autorizadas).
2. Integridade e permissões de arquivos críticos (permissões abertas em arquivos de segredos `.env`, chaves SSH e droppers/scripts em `/tmp` ou `/dev/shm`).
3. Notificação proativa aos dispositivos principais (Masters) por voz (`SYSTEM_ANNOUNCEMENT` com `speak: true`) e visualmente via WebSocket.
4. Consulta sob demanda via linguagem natural pelo usuário ("como está a segurança do sistema?") integrada ao `IntentRouter` e ao catálogo de ferramentas do Gemini (`verificar_seguranca_sistema`).
5. Endpoints REST autenticados `GET /api/security/status` e `POST /api/security/scan`.

## Arquivos Criados e Alterados

- `src/security/system-monitor.ts`: Módulo central de auditoria e serviço de monitoramento periódico com suporte a Linux e Windows.
- `src/tools/system-security.ts`: Ferramenta executável `verificarSegurancaSistema` com retorno estruturado e amigável em pt-BR.
- `src/tools/index.ts`: Registro da ferramenta `verificar_seguranca_sistema` nas declarações do Gemini e despacho de execução.
- `src/agent/router.ts`: Rota direta de baixa latência para intenções de verificação de segurança no `IntentRouter`.
- `src/server/server.ts`: Inicialização automática do `systemSecurityMonitor.start()` no bootstrap do servidor.
- `src/server/websocket.ts`: Assinatura do evento `security_threat_detected` para anúncio sonoro e visual aos clientes Master.
- `src/server/routes.ts`: Endpoints `GET /api/security/status` e `POST /api/security/scan`.
- `tests/security-monitor.test.ts`: Suíte de testes com 6 casos cobrindo mineradores, shells reversos, arquivos em diretórios voláteis, permissões, deduplicação de alertas e rotas.
- `docs/MONITOR-SEGURANCA.md`: Este relatório de entrega da funcionalidade.

## Testes e Validações

- `npx tsx --test tests/security-monitor.test.ts`: **6/6 testes passaram** (100% de sucesso).
- `npm run typecheck`: **Passou sem erros**.
- `npm run typecheck:client`: **Passou sem erros**.
- Deduplicação de ameaças verificada: o monitor não dispara spam para ameaças que já foram notificadas anteriormente.

## Próximos Passos (Próxima Branch)
- Branch `fix/restricao-terminal-seguranca`:
  - Remoção total do agente remoto legado (`jasper-agent.js`, `public/agent.js`, `src/tools/remote-terminal.ts`).
  - Restrição absoluta da execução e aprovação de comandos de terminal exclusivamente para a máquina Master (`isMasterClient` / `masterClients`).
