# Relatório de fase 0 — base e higiene

Data: 18/10/2026. Projeto: `/home/velton/projetos/jasper`.
Branch: `refactor/seguranca-3d`, criada a partir de `main` (`db6a017`).
Marco inicial vazio: `6e9a1bf` (`fase-0: ponto de partida`).

## Escopo e estado inicial

Nenhum comportamento do produto foi alterado. As alterações e arquivos não
rastreados das melhorias anteriores foram preservados e não incluídos nos
commits da fase por engano. Os resultados abaixo descrevem essa árvore de
trabalho atual, que contém código anterior ainda sem commit; o marco vazio
sozinho não constitui um snapshot completo desse código.

Nenhum conteúdo de arquivo de segredos foi inspecionado, copiado ou incluído.
Não houve publicação, limpeza do banco, ativação de agente remoto ou abertura
de acesso de rede. Testes novos usam configuração falsa e simulam Wake-on-LAN.

## Linha de base anterior às alterações da fase

| Comando | Resultado inicial |
|---|---|
| `npm run test:features` | Passou: 11 arquivos de testes, sem falha |
| `npx tsc --noEmit` | Passou |
| `npx tsc --noEmit -p client` | Passou |
| `npm run build` | Passou |
| `npm run build --prefix client` | Passou, com aviso de bundles acima de 500 kB |

Cliente na linha de base: JavaScript principal 876,94 kB (gzip 256,91 kB);
apresentação 606,82 kB (gzip 153,05 kB); CSS 50,25 kB (gzip 11,95 kB).
O aviso de tamanho não foi corrigido nesta fase.

## Alterações por arquivo

- `package.json`: adicionados `typecheck` e `typecheck:client`, sem mudar
  dependências. O script `test:features` já existia na árvore de trabalho inicial.
- `AGENTS.md`: documentação atualizada para Node/TS, React/Vite, Three.js,
  comandos, estrutura, regras de trabalho, princípio de segurança e áreas
  sensíveis; 70 linhas.
- `.gitignore`: incluídos `public/assets/` e `client/public/*.apk`.
- `public/assets/`: retirados 24 bundles do índice com `git rm --cached`;
  arquivos mantidos no disco. Não havia APK rastreado nesses caminhos.
- `tests/terminal-characterization.test.ts`: bloqueios, classificação de risco,
  interpretação da fala, pendência, aprovação de `echo`, negação, uso único e
  timeout simulado de 90 segundos.
- `tests/router-characterization.test.ts`: oito frases de roteamento mais
  aprovação e negação pendentes. Rede simulada; terminal de leitura é negado
  pelo teste, e somente `echo roteador-ok` é executado após aprovação.
- `tests/tools-characterization.test.ts`: ferramenta desconhecida e terminal
  sem argumentos, sem rede ou gravação no banco.
- `docs/FASE-0.md`: este relatório e a linha de base.

## Novos testes e comportamentos inseguros

Foram acrescentados dez testes executáveis e três `test.todo` para a Fase 1:
autoaprovação pelo modelo após 800 ms, liberação por prefixo e herança de
segredos no subprocesso. As caracterizações de `cat` sensível e de `ok` como
aprovação têm comentário explícito sobre o comportamento inseguro atual.
Nenhum teste abre os arquivos sensíveis citados como exemplos.

O teste do roteador também revelou que uma resolução no mesmo microtask pode
anteceder a instalação do listener do caminho bloqueante. A simulação foi
ajustada para uma decisão assíncrona de interface; o produto não foi corrigido
nesta fase. Reavaliar esse fluxo na migração de aprovações da Fase 3.

## Verificação após as mudanças

| Verificação | Resultado |
|---|---|
| Novos três arquivos de testes | Passou |
| `npm run test:features` | Passou: 14 arquivos, sem falha |
| `npx tsc --noEmit` | Passou |
| `npx tsc --noEmit -p client` | Passou |
| `git diff --check` | Passou |
| `git ls-files public/assets/ 'client/public/*.apk'` | Nenhum arquivo |
| Preservação dos bundles no disco | Confirmada |

Os builds da linha de base passaram; nenhuma fonte do produto mudou nesta
fase. O executor de testes no Node 18 agrega os resultados por arquivo; os
três TODOs aparecem ao executar diretamente o arquivo de terminal.

## Riscos restantes e revisão manual

As brechas de execução de programas, busca/download via shell, SSRF,
autoaprovação, autorização de aparelhos pelo modelo e API sem autenticação
permanecem no escopo da Fase 1. Esta fase não declara o projeto seguro.

Revisar os três testes novos e os comentários de comportamento inseguro.
Manter o agente remoto desativado e não ampliar a exposição da API antes das
correções. As credenciais mencionadas no documento do usuário precisam ser
trocadas pelo proprietário nos serviços correspondentes; esta fase não lê
nem modifica esses segredos. Revisar também as alterações anteriores ainda
sem commit antes de incorporá-las ao histórico.
