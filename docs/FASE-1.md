# Relatório de fase 1 — correções críticas de segurança

Data: 18/10/2026. Branch: `refactor/seguranca-3d`.
Esta fase corrige os caminhos críticos no lugar; não cria o registro de
ferramentas da Fase 3 e não modifica o agente remoto da Fase 6.

## Brechas, correções e regressões

| Brecha | Arquivos | Correção | Testes |
|---|---|---|---|
| Nome de programa vira shell | `src/tools/applications.ts`, `src/security/process.ts` | Lista fixa de binário e argumentos; desconhecidos recusados; abertura sem shell | `security-tools`: nome com `; touch`, desconhecido e Firefox simulado |
| Expansão de consultas pelo shell | `src/tools/web.ts` | `execFile` com argumentos separados; consulta até 300 caracteres, sem controles | `security-tools`: `$()` e crases como dados literais |
| SSRF e redirecionamento para rede interna | `src/security/netguard.ts`, `src/tools/web.ts` | HTTP/HTTPS público; valida todos os endereços DNS; rejeita privados, reservados, Tailscale e IPv6 local; DNS fixado na conexão; até três redirecionamentos validados | `security-tools`: IPs internos, localhost, file, DNS privado e redirect para loopback |
| Leitura web sem limite ou fronteira de confiança | `src/tools/web.ts` | Corpo até 1 MB, timeout, envelope `untrusted: true`, origem e conteúdo | `security-tools`: envelope e conteúdo extraído |
| Download executa URL ou grava tipo arbitrário | `src/tools/media.ts` | Vídeo via argumentos e `--`, timeout de 10 min, limite declarado de 50 MB; imagem até 10 MB, MIME permitido e nome gerado com criação exclusiva | `security-tools`: URL com aspas/ponto e vírgula, recusa de URL privada e resposta que não é imagem |
| Modelo autoaprova terminal após 800 ms | `src/tools/terminal.ts`, `src/tools/index.ts`, `src/ai/prompts.ts` | Ferramenta apenas consulta aguardando/aprovado/negado/expirado; argumentos de decisão removidos; fonte `tool` não resolve | `security-terminal`: passagem de tempo e argumentos forjados não executam |
| Prefixo lembrado libera outro comando | `src/tools/terminal.ts` | Comparação exata normalizada, 30 min, somente leitura segura sem metacaracteres, concedida pela UI | `security-terminal`: comando encadeado continua pendente e permissão expira |
| Classificação por `startsWith` e fala fraca | `src/tools/terminal.ts`, `src/agent/router.ts` | Tokenização, lista curta de leitura, arquivos sensíveis e shell em alto risco; confirmação explícita; alto risco somente UI | `security-terminal`: arquivos sensíveis, cadeia, interpretador, `ok` e `confirmo` em alto risco |
| Subprocesso herda chaves | `src/security/process.ts`, `src/tools/terminal.ts` | Ambiente mínimo e cwd fixo; timeout e saída limitada | `security-process`, `security-terminal`: variável falsa não aparece no subprocesso |
| Enter global ou UI enganosa aprova | `client/src/components/ChatFeed.tsx` | Aprovação no botão, sem Enter global; texto de voz e opção lembrar limitados à política real | Compilação e revisão do componente; verificação manual restante abaixo |
| Modelo ou fala ambiente autoriza aparelho | `src/tools/index.ts`, `src/tools/devices.ts`, `src/server/websocket.ts`, `src/ai/prompts.ts`, `DeviceApprovalBanner.tsx` | Ferramenta removida; caminhos de fala removidos; resolução recusa voz/tool; somente UI master pode decidir | `security-terminal`, `security-proxy`: ferramenta desconhecida, recusa de voz/tool e aprovação UI simulada |
| REST sem autenticação | `src/security/auth.ts`, `src/server/routes.ts`, `client/src/hooks/useJasperWebSocket.ts`, `ProactivePanel.tsx`, `App.tsx` | Todas as rotas API exigem Bearer, exceto GET health; sessão ou credencial de máquina em comparação constante; cliente transmite sessão | `security-api`: health público, HEAD e rotas privadas recusados, sessão e token falso de máquina aceitos |
| Token padrão fraco e rede aberta por padrão | `src/security/credentials.ts`, `src/config/config.ts`, `src/server/server.ts`, `README.md` | Produção recusa token ausente/fraco/exemplo; desenvolvimento gera token temporário e exibe uma vez no console do servidor; HOST padrão loopback | `security-api`: função de credenciais e importação da configuração de produção em subprocesso com valores falsos |
| Origem livre e proxy vira master | `src/security/origin.ts`, `src/server/server.ts`, `src/server/websocket.ts`, `client/vite.config.ts` | Mesma origem ou lista explícita; WS limitado a 1 MB; proxy headers e Host externo impedem master; exceção Vite apenas local/desenvolvimento/origem 5173 | `security-api`, `security-proxy`: origem externa, forwarded headers, Host externo e exceção Vite |

## Arquivos de apoio e testes existentes

- `tests/terminal-characterization.test.ts`: caracterizações inseguras atualizadas
  para as regras da Fase 1; os três TODOs viraram testes executáveis.
- `tests/device-access.test.ts`: conexão simulada agora fornece Host, como uma
  conexão HTTP real; a ausência dessa informação não concede master.
- `tests/security-process.test.ts`, `security-tools.test.ts`,
  `security-terminal.test.ts`, `security-api.test.ts` e `security-proxy.test.ts`:
  regressões novas, com entradas falsas, rede simulada e comandos inofensivos.
- `package.json`: execução serial dos arquivos de testes. O Node 18 apresentou
  falha intermitente de IPC no executor paralelo (`Unable to deserialize cloned
  data`); a execução serial mantém as asserções e reduz o consumo simultâneo.
- `README.md`: documentação de credenciais, origens, Tailscale e aprovações.

## Verificações

- Linha vermelha registrada antes da implementação dos novos módulos de
  processo/rede e de autenticação. Os testes de terminal também foram executados
  contra o comportamento antigo antes da correção, usando somente `echo` e
  consultas de Git, sem executar payloads destrutivos.
- `npm run test:features`: 95 testes passaram na execução serial final.
- `npx tsc --noEmit`: passou.
- `npx tsc --noEmit -p client`: passou.
- `npm run build` e `npm run build --prefix client`: passaram.
- O aviso anterior de bundles grandes continua para a fase de desempenho.
- Servidor em uso: `GET /api/health` retornou 200 e `GET /api/memory` sem
  credencial retornou 401.
- Navegador: abertura em `127.0.0.1:3000`, conexão e carregamento do painel de
  notícias com a sessão autenticada, sem erros no console.
- `git diff --check`: passou.

## Usos de child_process que restam fora do módulo seguro

- `src/server/websocket.ts`: `execSync` de comando fixo `pactl get-default-source`
  na inicialização da fonte de áudio. Não recebe texto do modelo; migração para
  o utilitário seguro fica na Fase 3.
- `jasper-agent.js` e sua cópia servida `public/agent.js`: executor remoto legado,
  não alterado nesta fase. Não habilitar antes da Fase 6.

O terminal passou a usar o utilitário seguro já nesta fase. Shell explícito
`/bin/sh -c` só é selecionado para sintaxe de shell após aprovação humana de
alto risco pela interface; as demais execuções usam binário e argumentos.

## Limites e revisão manual

1. Revise os diffs de `terminal.ts`, `applications.ts`, `media.ts`, `web.ts`,
   `routes.ts` e `websocket.ts`. Teste no navegador: programa fora da lista,
   comando pendente seguido de “ok”, comando de alto risco e os botões de
   permitir/negar aparelho. A aprovação do comando deve mostrar o literal.
2. Repita de outro aparelho a consulta a `/api/memory` sem credencial: deve
   retornar 401. O ensaio HTTP desta fase foi local; não houve acesso físico a
   outro aparelho.
3. A mitigação de master por IP não substitui identidade por dispositivo. O
   registro, a vinculação de aprovações a sessão/dispositivo, auditoria e papéis
   são trabalho das Fases 3 e 5. Não há declaração de segurança completa.
4. O yt-dlp segue suas próprias requisições de extração/mídia. A URL inicial é
   validada, mas isolamento de todos os subdownloads e de processos descendentes
   exige uma política/sandbox adicional. Não considere esse executável uma
   fronteira de rede equivalente ao cliente HTTP protegido.
5. Não foi lido ou alterado nenhum arquivo de segredos. O proprietário ainda
   precisa trocar as chaves que saíram no ZIP e configurar um token forte de
   produção. A mensagem de token temporário em desenvolvimento segue a instrução
   explícita da fase e existe somente no console do servidor.
6. A árvore inicial continha muitas melhorias sem commit. Arquivos compartilhados
   entre essas melhorias e a segurança preservam tais integrações; os commits
   locais da fase não são uma exportação limpa de todos os arquivos anteriores.
   Revise o estado pendente antes de publicar ou montar uma distribuição.
