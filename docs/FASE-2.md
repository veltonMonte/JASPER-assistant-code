# Fase 2 — base reutilizável do 3D

Data: 18/10/2026. Referência: arquivo de 899 linhas presente no projeto antes
desta fase, preservado temporariamente para comparação; não foi usado o zip.

## Diagnóstico antes da alteração

O átomo gerava 24.000 pontos por rejeição; o Lorenz, 16.000, com clones de Color
por ponto. O carro atualizava 1.200 posições na CPU a cada quadro. Todos usavam
blending aditivo; tamanhos de pontos: átomo .055, Lorenz .065, vento .045 e
poeira .1. Havia 1.800 pontos adicionais de fundo, DPR até 2, antialias e bloom
em resolução cheia. Cada etapa remontava o renderer; composer e passes não
recebiam descarte. Núcleons, planetas e nós tinham geometrias individuais.

Conclusão: coexistiam bloqueio inicial de geração, alocações, custo de
preenchimento/bloom e risco de acumular contextos. A renderização roda no
aparelho cliente; reduzir carga do servidor não corrigiria esses problemas.

## Arquivos e comportamento

- `shared/presentation-types.ts`: tipos únicos para cliente e servidor.
- `shared/presentation-presets.ts`: metadados, padrões e validação; o prompt é
  gerado dessa mesma fonte. Aceita somente density .25–1, elemento enumerado e
  cores hex. Quantidades brutas, campos desconhecidos e presets inválidos falham.
  As quatro chaves comuns continuam aceitas em todos os presets para compatibilidade
  com a ferramenta atual; cada builder usa apenas os campos pertinentes.
- `src/presentation/schema.ts`: valida config e infere preset uma vez no servidor
  quando ausente. Peças explícitas continuam escolhendo custom.
- `src/ai/prompts.ts`: catálogo gerado e instrução para rótulos curtos.
- `client/src/presentation/presets/`: cinco builders existentes e custom,
  instanciamento de núcleons/planetas/nós, arestas da rede agrupadas.
- `runtime/SceneRuntime.ts`: um renderer por montagem, troca de assunto,
  observers de tamanho/visibilidade, pausa em segundo plano, render sob demanda
  para assunto estático sem rotação, descarte dos passes/composer e contexto.
- `runtime/samples.ts`, `cloud.ts`: amostras determinísticas em fatias, cache
  limitado a oito buffers imutáveis, CDF radial inversa, Lorenz intercalado,
  vento no shader, pontos limitados a 1–6 pixels. Cache compartilha amostras
  quando configurações e quantidades coincidem entre tiers.
- `runtime/quality.ts`: perfis e adaptação em janelas de dois segundos;
  reduz drawRange em 25% antes de reduzir tier; recuperação após estabilidade.
- `runtime/labels.ts`, `resources.ts`: quebra/limite de rótulos e descarte único
  de recursos compartilhados. CSS2D dispensa texturas de texto.
- `Presentation3D.tsx`: controles de qualidade/rotação, indicador de geração,
  fallback dos seis modos e painel `?debug=1`.
- `PresentationScreen.tsx`: retirada da key do componente 3D entre etapas.
- `client/src/lib/presentation.ts`: reexporta tipos compartilhados.
- `client/src/index.css`: estilos de rótulos, controles e diagnóstico.
- `tsconfig.json`, `package.json`, README: compilação inclui shared; entrada
  compilada passa a `dist/src/server/server.js` e npm start acompanha a mudança.

A tela de apresentação, o schema e os tipos estavam sem rastreamento no início.
Foram registrados como dependências desta implementação, preservando seu conteúdo
anterior; isso não constitui uma revisão da narração. Os demais trabalhos locais
anteriores permanecem fora dos commits desta fase. As alterações anteriores do
CSS e das dependências não foram incluídas por engano.

## Contagens (density=1; assunto + poeira)

| Preset | Antes | low | medium | high |
|---|---:|---:|---:|---:|
| atom | 24.000 + 1.800 | 7.700 + 300 | 24.000 + 900 | 24.000 + 1.800 |
| flow_field | 16.000 + 1.800 | 7.700 + 300 | 16.000 + 900 | 16.000 + 1.800 |
| cyber_car | 1.200 + 1.800 | 1.200 + 300 | 1.200 + 900 | 1.200 + 1.800 |
| solar_system | 0 + 1.800 | 0 + 300 | 0 + 900 | 0 + 1.800 |
| neural_network | 0 + 1.800 | 0 + 300 | 0 + 900 | 0 + 1.800 |

Tetos totais: 8.000/25.000/60.000. Bloom: desligado/metade/cheio; DPR:
1/1,25/2; FPS: 30/60/60; rótulos: 8/16/24. Configurações não aumentam esses tetos.

## Medições e verificação

Ensaio isolado no navegador interno, sem voz e sem chamadas ao Gemini. O arquivo
antigo e o novo foram carregados em uma página temporária, depois removida.
Medições de geração em Node 18, três execuções por conjunto; mediana em ms:

| Conjunto | Antes: builder síncrono | Depois: amostras com pausas | Maior fatia depois |
|---|---:|---:|---:|
| átomo 24.000 | 45,81 | 64,83 | 7,20 |
| Lorenz 16.000 | 16,20 | 34,43 | 6,12 |
| vento 1.200 | 1,51 | 1,59 | 3,80 |

As colunas têm escopos diferentes: antes inclui meshes do builder, depois mede
amostras e o tempo de ceder a thread. Não representam ganho de latência total.
O ganho principal é dividir o bloqueio; a geração total pode demorar mais.
Cache no navegador: reconstrução do átomo em cerca de 3,2 ms em uma troca.
Primeira montagem completa chegou a 521 ms com shaders ainda frios e pausas;
compilação inicial de shaders continua sendo um custo e não foi eliminada.

FPS médio de uma janela aquecida de dois segundos, átomo, mesmo navegador:

| Cena | FPS observado |
|---|---:|
| anterior, alta | 42,6 |
| nova, alta | 59,5 |
| nova, equilibrada | 59,5 |
| nova, leve | 30,0 (limitado) |

Os valores variam com carga concorrente: durante compilações houve quedas e a
adaptação reduziu o tier, recuperando-o posteriormente. Não são promessa para
outros aparelhos. O controle de tamanho de ponto foi necessário: pontos maiores
pioraram o resultado num ensaio intermediário.

Todos os cinco presets foram abertos; um erro de shader dos planetas detectado
no navegador foi corrigido para usar vColor.rgb. Depois, console sem erros/avisos.
Vinte trocas consecutivas de neural_network no tier low: antes e depois,
10 geometrias, 1 textura, 1 contexto, 30 FPS. Houve ainda vinte trocas durante
adaptação de qualidade; contexto permaneceu em 1. As estatísticas publicadas no
instante da troca podem mostrar a contagem anterior até o próximo quadro.

Testes novos: config/ids/prompt, perfis e orçamento, adaptação, rótulos,
buffers finitos, cache e cancelamento. Cinco testes novos e cinco de apresentação
passaram isoladamente. Suíte completa: **100 passaram no Node 24.19.0**.
No Node 18.19.1, três arquivos falharam na desserialização interna do runner
(ERR_TEST_FAILURE), sem asserção de produto; problema já observado na Fase 1.
Foi usado o runtime Node 24 já disponível, sem instalar ou trocar o Node do sistema.
`npx tsc --noEmit` e `npx tsc --noEmit -p client`: passaram.
Builds do servidor e cliente: passaram. Cliente: entrada 876,71 kB (gzip 256,92),
apresentação 630,72 kB (gzip 161,22), CSS 51,20 kB (gzip 12,16). Aviso de
chunks acima de 500 kB permanece; separar Recharts pertence à Fase 4.
`git diff --check`: sem erros.

## Roteiro manual restante

1. Abra uma apresentação com `?debug=1&quality=high`; repita medium e low.
2. Troque de etapa vinte vezes, volte ao mesmo assunto/tier e compare geometrias,
   texturas e contextos depois de renderizar. Não compare assuntos diferentes.
3. Grave dez segundos no painel Desempenho do navegador; procure tarefas acima
   de 50 ms, especialmente compilação inicial de shaders, ainda não perfilada.
4. Minimize e restaure a aba; confirme pausa e retorno sem salto. Repita deixando
   o componente fora da área visível. O código limita dt no retorno.
5. Repita em um aparelho fraco real. Não havia um segundo aparelho disponível
   para esta validação; o tier low foi validado no navegador deste ambiente.
6. Confira rótulos e o fallback em navegador sem WebGL; erros são registrados,
   sem esconder a falha. Colisões de rótulos e conteúdo novo pertencem à Fase 4.

A fase não altera a execução das ferramentas nem a voz. Revisão humana recomendada:
limites visuais no aparelho de uso e preservação do aspecto dos cinco modelos.
