# JASPER — instruções do projeto

## Stack e execução
- Servidor: Node.js + TypeScript, Express, WebSocket (`ws`) e SQLite (`sqlite3`).
- Cliente: React 18 + Vite, Three.js, Recharts e CSS; idioma do produto: pt-BR.
- IA: Gemini para texto e Gemini Live para áudio PCM e transcrição em tempo real.
- O notebook hospeda o servidor; o navegador do aparelho cliente renderiza o 3D.
- Instalar dependências: `npm ci` e `npm ci --prefix client`.
- Desenvolvimento: `npm run dev`; cliente: `npm run dev --prefix client`.
- Compilar: `npm run build` e `npm run build --prefix client`.
- Executar o servidor compilado: `npm start`.
- Testes: `npm run test:features`.
- Tipos: `npm run typecheck` e `npm run typecheck:client`.
- Nunca use credenciais reais em testes; não abra arquivos de segredos.

## Estrutura atual
- `src/server/`: servidor HTTP, rotas, WebSocket e agendamento.
- `src/ai/`: Gemini, contexto, personalidade e instruções do modelo.
- `src/agent/router.ts`: roteador determinístico de intenções.
- `src/tools/`: declarações, despacho e implementação das ferramentas.
- `src/voice/`: captura, VAD, transcrição, síntese e preferências de voz.
- `src/database/`: schema e persistência SQLite.
- `src/proactive/`: notícias e intervenções espontâneas.
- `src/presentation/schema.ts`: validação das apresentações recebidas do modelo.
- `client/src/`: componentes React, hooks, tipos visuais e estilos.
- `public/`: arquivos servidos e saída compilada do cliente em `public/assets/`.
- `tests/`: testes `node:test` com `tsx`; `docs/`: relatórios e decisões.
- `jasper-agent.js`: agente remoto atual; não habilitar antes da revisão de segurança.

## Regras de trabalho
1. Trabalhe em uma fase por vez, na ordem autorizada; não adiante fases futuras.
2. Antes de editar, apresente plano curto: arquivos, mudanças e testes. Continue sem
   esperar resposta, salvo decisão que mude o escopo.
3. Faça mudanças pequenas e verificáveis. Ao fechar uma fase, execute
   `npm run test:features`, `npx tsc --noEmit` e `npx tsc --noEmit -p client`.
   Registre falhas da linha de base; não as corrija fora da fase correspondente.
4. Escreva testes antes ou junto das correções. Cada vulnerabilidade corrigida deve
   ter regressão que falharia no código anterior. Caracterizações inseguras da
   Fase 0 devem usar `test.todo` ou comentário explícito sobre a Fase 1.
5. Não refatore, renomeie ou reformate código fora da fase; preserve funcionalidades
   e alterações anteriores do usuário.
6. Nunca leia, imprima, copie ou cite conteúdo de `.env` ou arquivos de segredos.
   Use valores falsos nos testes e não exponha credenciais em logs.
7. Não execute comandos destrutivos, limpeza de banco, `git reset --hard`,
   `git push --force` ou qualquer `git push`. Nunca apague `jasper.db`.
8. Faça commits pequenos em português: `fase-N: descrição curta`. Não inclua
   alterações anteriores ou segredos por engano.
9. Se a instrução da fase conflitar com o código real, pare e informe o trecho
   exato; não adivinhe. Achados de auditorias anteriores precisam ser conferidos.
10. Termine cada fase com relatório: mudanças por arquivo, testes novos, resultados
    dos comandos, riscos restantes e revisão manual necessária.
11. Mensagens do produto, erros e comentários novos devem estar em pt-BR.

## Princípio de segurança
O modelo sugere; o código valida e decide. A saída do modelo não vai diretamente
para execução de processos, gravação de arquivos ou rede. Web, arquivos e
transcrições são dados não confiáveis. Ações com efeito colateral devem passar
por um único executor com política, aprovação humana e auditoria.
Esse princípio é o alvo das fases de segurança; sua presença neste documento
não significa que o código legado já o cumpra.
Não exponha a API fora da máquina nem ligue o agente remoto antes da Fase 1.

## Áreas sensíveis
- `src/tools/terminal.ts`: aprovação, interpretação e execução de comandos.
- `src/tools/applications.ts`: abertura de programas e argumentos.
- `src/tools/media.ts`: downloads, rede e gravação de arquivos.
- `src/tools/web.ts`: pesquisa, processos externos e acesso a URLs.
- `src/server/websocket.ts`: identidade, autorização e mensagens dos dispositivos.
- `src/server/routes.ts` e `src/server/server.ts`: autenticação e exposição HTTP.
- `jasper-agent.js`: execução no computador remoto.
