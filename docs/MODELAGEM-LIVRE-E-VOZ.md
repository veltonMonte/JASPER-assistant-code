# Modelagem livre e recuperação da voz

18/10/2026. Continuação dos tipos SceneSpec v2 iniciados pelo usuário.
As fases de segurança 3–7 continuam pausadas; o rascunho da fase 3 não foi restaurado.

## Implementação

- `shared/scene-types.ts` e `scene-capabilities.ts`: contrato iniciado pelo usuário,
  convenções de coordenadas corrigidas (extrude em XY, profundidade +Z), descrição
  das operações com campos e limites reais para instruir a geração.
- `src/presentation/scene-schema.ts`: validação de nós, referências, transformações,
  materiais, repetições expandidas, malhas, contornos e furos; erros com caminho.
  Limites compartilhados: 256 nós, 512 instâncias expandidas, 30 mil vértices,
  60 mil triângulos, 8 níveis e 64 KiB por cena. A árvore de filhos não permite
  referências parentais circulares; estruturas circulares na entrada são rejeitadas.
- `client/src/presentation/scene/SceneCompiler.ts`: geometria genérica de caixas,
  esferas/elipsoides, cilindros, cones, cápsulas, toros, planos, extrusões com furos,
  revolução de perfis, tubos curvos e malhas indexadas. Materiais/geometrias
  compartilhados, instanciamento, hierarquia, cancelamento e geração em fatias.
- `scene-session.ts` e `scene-generation.ts`: estado por sessão autenticada,
  alterações validadas, ids preservados, histórico de oito versões, desfazer,
  limite de sessões e expiração. Estado fica em memória e não sobrevive a reinício.
- `visual-intent.ts` e `visual-generator.ts`: geração visual separada do transporte
  de voz, seleção de modelo Flash anunciado pelo provedor, JSON estruturado,
  duas correções no máximo, prazo total de 65 segundos, cancelamento e tratamento
  de quota/acesso/indisponibilidade. Não faz busca web nem substitui por preset
  quando uma geração falha. A saída passa pelo despacho de ferramentas existente.
- `schema.ts`, `tools/index.ts`, `ai/prompts.ts`: suporte à cena v2 e às edições;
  remove átomo padrão e inferência de preset por título. Compatibilidade com
  apresentações legadas que informam preset ou peças explicitamente.
- `server/websocket.ts`, `routes.ts`, `gemini-live.ts`, `gemini.ts`: contexto visual
  por sessão; a apresentação é enviada apenas ao solicitante. Recuperação única
  de pedidos Live sem resposta; não repete ferramentas com efeitos colaterais.
- `SceneRuntime.ts`, `Presentation3D.tsx`, `PresentationScreen.tsx`, `App.tsx`:
  conserva renderizador, mantém assunto anterior durante a construção, adapta
  câmera aos limites reais, oferece vista superior e aguarda cena pronta para
  narrar. A compilação não executa código do modelo nem carrega arquivos remotos.

## Voz

O cliente fechava a saída de áudio em cada interrupção e marcava o desbloqueio
antes de confirmar a retomada. Eventos de estado também podiam cancelar uma
leitura local em preparação. Agora para apenas as fontes, conserva a saída já
liberada, retoma em gestos posteriores, limita a espera de autoplay e só fecha
na desmontagem. Turnos Live que chegam somente em texto solicitam a mesma voz
natural; turnos com áudio não duplicam a leitura. Cada resposta tem Ouvir resposta.
Interrupção explícita pausa a narração da apresentação sem destruir o contexto.
Leituras manuais e prévias de voz podem começar com a escuta armada, respeitando
turnos ocupados. Uma apresentação aberta e pausada não bloqueia o envio do
microfone; somente preparação ou narração ativa pausam a captura para evitar eco.

Na verificação real, um pedido 3D derrubou o canal Live antes de qualquer saída.
Por isso pedidos visuais por texto usam geração estruturada independente. Há
recuperação para queda/turno vazio antes de resposta ou ferramenta. A leitura
natural foi reproduzida no navegador e retornou ao estado de espera. O microfone
foi negado pelo navegador de teste; captação falada não foi validada nessa aba.

## Testes e evidências

Os arquivos novos cobrem contratos e geometria, três tiers, referências/ids,
limites após repetição, contornos, furos, malhas degeneradas, cancelamento,
edição atômica, desfazer, isolamento de sessão, reparos e indisponibilidade do
provedor. As amostras de assuntos ficam exclusivamente em tests/fixtures e
não são importadas pelo caminho de produção.

Sete cenas foram compiladas nos três tiers: dinossauro, teclado, computador,
casa, óculos, carro e abajur. No navegador foram conferidos os sete assuntos,
incluindo extrusão com furo dos óculos e repetição de 52 teclas. Vinte trocas
seguidas do teclado no modo leve terminaram com os mesmos recursos: 10 geometrias,
1 textura e 1 contexto, sem erros gráficos no console. Geração com cache aquecido
observada em 0,9 ms nessa troca. FPS varia bastante com a carga de memória da
máquina, portanto não foi usado como garantia para outros aparelhos.

Um pedido real de bicicleta, ausente das amostras, abriu a cena em 7,585 s;
a edição de cor demorou 1,831 s e o desfazer recuperou a versão anterior.
A narração da apresentação foi reproduzida. Houve tentativas anteriores com
prazo excedido e cena inválida após os reparos; esses casos retornaram erro,
sem substituir por objeto predefinido. A bicicleta gerada é aproximada e contém
imprecisões de montagem. Evidência visual: `/tmp/jasper-modelagem-livre.jpg`.
O enquadramento considera proporção da tela, escala, plano de corte e neblina;
rótulos de grupos e pontos de interesse também são apresentados.
A cena de cada etapa é ativada apenas dentro da sessão solicitante. O transporte
JSON de microfone usa a mesma seleção de interlocutor do transporte binário.

O runner --test falhou na desserialização de seu canal IPC tanto em Node 18
quanto em Node 24. `scripts/test-features.cjs` conserva o isolamento por arquivo,
executa-os sequencialmente sem esse canal e informa a soma dos resultados.
`tests/no-secrets.cjs` impede dotenv de abrir arquivos nos testes e usa chave falsa.
A verificação final passou: **122/122 testes em 25 arquivos**, com Node 18.19.1.
`npm run typecheck` e `npm run typecheck:client` passaram, assim como
`npm run build` e `npm run build --prefix client`. O Vite avisou sobre pacotes
maiores que 500 kB; a tela de apresentação já é carregada sob demanda.
`GET /api/health` retornou online/IDLE e a interface compilada abriu na porta 3000.
A revisão dos componentes seguiu a lista de boas práticas React: efeitos com
limpeza, callbacks estáveis, carregamento da tela sob demanda e sem remontagem
do renderizador ao trocar a apresentação.

Na versão compilada final da porta 3000, o botão Ouvir resposta foi testado
com o estado LISTENING e microfone ativo: passou a PROCESSING, depois SPEAKING
(“Respondendo”) e retornou à escuta. O console não apresentou avisos nem erros.
Essa conferência valida a reprodução; não foi feita avaliação perceptiva da voz
nem teste de reconhecimento com fala humana. A origem 5173 negou o microfone;
a origem 3000 apresentou captura ativa, sem nova ação sobre permissões.
Captura da interface final: `/tmp/jasper-voz-corrigida.png`.

## Referências da integração

A descoberta de modelos e suas capacidades segue a [API de modelos do Google](https://ai.google.dev/api/models).
O esforço de geração é reduzido com parâmetros próprios de cada família,
conforme a [documentação de thinking do Gemini](https://ai.google.dev/gemini-api/docs/generate-content/thinking).
A implementação não mistura thinkingBudget e thinkingLevel na mesma requisição.

## Limites e revisão manual

As representações são aproximações geométricas geradas por IA, sem garantia de
medidas industriais ou precisão CAD. Não há importação de GLB/texturas externas,
CSG arbitrário, shaders do modelo ou scripts executáveis. O modo superior usa
perspectiva alinhada ao eixo Y. Rótulos respeitam o tier; colisões entre eles
continuam possíveis. Oito versões de desfazer ficam só nesta sessão, em memória.

Confira no aparelho de uso: volume e dispositivo de saída, permissão de microfone,
voz contínua, edição após mudar de etapa e geração com a conexão Gemini disponível.
A seleção de qualidade continua disponível. Uma conexão de geração lenta pode
encerrar por prazo; a cena anterior permanece e a falha é comunicada em português.
