# Humanização do Jasper

Branch: `feat/jasper-humano`.

## O que mudou
1. **Vida interior real** (`src/ai/inner-life.ts`, `src/ai/inner-life-service.ts`)
   - Estado persistido em `assistant_settings` (`jasper.inner_life`): ânimo, energia, afinidade, intervalo desde a última conversa e deriva dos traços.
   - O tom da fala do usuário (elogio, agradecimento, alegria, frustração, cansaço, grosseria, pedido de brevidade) é classificado por regras determinísticas, sem chamar o modelo.
   - O ânimo volta ao normal com o tempo (meia-vida de 6 h) e a energia acompanha o ritmo do dia.
   - A afinidade cresce devagar com a convivência e cai depois de ausências longas.
   - Os traços (humor, sarcasmo, formalidade, extensão, atenção) derivam no máximo ±12 pontos sobre os ajustes manuais do usuário. "Restaurar personalidade" zera esse histórico.
2. **Prompts** (`personality.ts`, `prompts.ts`): bloco "Estilo J.A.R.V.I.S. à brasileira", lista de frases de atendimento a evitar e regra de honestidade ajustada para permitir expressar o estado interno sem fingir ser humano.
3. **Respostas diretas** (`src/agent/phrasebook.ts`): frases variadas, sem repetição seguida, com registro mais próximo conforme a afinidade. Mensagens de segurança do terminal não foram alteradas.
4. **Ligações**: texto (`gemini.ts`) a cada resposta; voz ao vivo (`gemini-live.ts`) na abertura da sessão; WebSocket registra as falas.
5. **API REST e Encerramento Seguro**:
   - `GET /api/personality/inner-life`: consulta em tempo real de ânimo, energia e afinidade com descrições em linguagem natural.
   - Graceful Shutdown no `server.ts` capturando `SIGINT` e `SIGTERM` para garantir o flush do estado antes de encerrar o processo.

## Limites conhecidos
- Na voz ao vivo o estado entra no prompt na abertura da sessão; o texto o recebe a cada resposta.
- O ânimo nunca altera fatos, ferramentas, aprovações nem alertas de segurança.

## Testes
`tests/inner-life.test.ts` (14 testes). Suíte completa: 176/191, com os mesmos 9 arquivos da linha de base (testes Linux-only no Windows).
