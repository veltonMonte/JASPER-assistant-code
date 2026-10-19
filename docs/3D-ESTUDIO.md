# Estúdio 3D — evolução de 19/10/2026

## Objetivo e escopo

Melhorar o acabamento e a coerência espacial das gerações livres, com custo adequado ao notebook Intel i3-1115G4 e aproximadamente 4 GB de RAM. O navegador do cliente renderiza a cena; o Gemini continua responsável pela descrição geométrica. Nenhum modelo de geração 3D pesado foi instalado localmente.

O guia foi adaptado ao SceneSpec v2 já existente. As onze operações geométricas livres continuam disponíveis; as cenas do laboratório são exemplos de verificação, não uma lista de assuntos permitidos pelo gerador.

## Acabamento e montagem

- `client/src/presentation/style/materials.ts`: biblioteca com madeira procedural, plástico, metal, tecido, borracha, vidro e tela; cores escuras recebem brilho mínimo, preservando branco e cinza neutros. Cache por compilação, sem texturas externas.
- `client/src/presentation/style/geometry.ts`: quinas arredondadas econômicas e ajuste do grupo de exibição ao chão e ao centro. Coordenadas e unidades originais permanecem disponíveis para edições. Um piso plano muito maior que o assunto não domina o enquadramento; pisos proporcionais de arquitetura são preservados.
- `client/src/presentation/style/studio.ts`: luz principal neutra, preenchimento e contorno discretos; palco proporcional; sombra radial leve ou mapa de sombra conforme o perfil.
- `client/src/presentation/style/assembly.ts`: entrada escalonada com suavização e pequeno excesso de escala. Poses calculadas a partir das matrizes finais, permitindo repetir sem deslocamento acumulado. Respeita preferência por movimento reduzido.
- `client/src/presentation/scene/SceneCompiler.ts`: reaproveita materiais, geometrias e lotes de instâncias; reduz biséis quando os limites de vértices/triângulos seriam excedidos; rótulos no topo das caixas envolventes transformadas, com linhas de chamada.
- `client/src/presentation/presets/custom.ts` e `types.ts`: o formato antigo de peças também recebe materiais e montagem melhorados.
- `client/src/presentation/runtime/SceneRuntime.ts`: integração dos estilos, palco, iluminação, montagem e descarte. Eixo vertical consistente ao alternar plantas e objetos, com órbita acima do palco. Sombras recalculadas quando a cena se move; bloom fica reservado ao holograma. Ambiente procedural pequeno, somente nos perfis equilibrado/alto.
- `client/src/components/Presentation3D.tsx`: controles Estúdio/Desenho/Holograma, repetição da montagem, qualidade e diagnóstico. Legendas podem ser ativadas sob demanda para manter o objeto desobstruído. O tempo mostrado no painel é de montagem local, não o tempo de espera do provedor.
- `client/scene-lab.html` e `client/src/presentation/scene-lab.tsx`: laboratório de desenvolvimento com cadeira, castelo, dinossauro, teclado, computador, casa, óculos, carro e abajur. Não faz parte da entrada de produção.

- `client/src/components/PresentationErrorBoundary.tsx` e integração em `App.tsx`: recuperação por apresentação, tentativa manual e detalhe de diagnóstico. Uma falha anterior não mantém apresentações novas bloqueadas.
- `client/src/lib/loadWithRetry.ts`: até duas repetições curtas para falhas de rede no carregamento da tela, sem repetir erros de programação ou recarregar a conversa.

O perfil leve mantém limite de 30 FPS e pixel ratio 1; usa sombra radial e dispensa ambiente e pós-processamento pesado. Os perfis equilibrado/alto oferecem mais detalhes. O controle adaptativo existente continua ativo. Não há garantia de FPS em qualquer aparelho.

## Encaixe e geração

- `shared/scene-placement.ts` e `shared/scene-types.ts`: suporte opcional a `place`, com apoio `on`, posicionamento `under`, lateral `beside`, alinhamento, recuo, folga e deslocamento local. Filhos podem usar a geometria do pai imediato como apoio, sem incluir outros filhos no cálculo desse apoio. `floor` é número; nenhuma expressão ou código é interpretado.
- `src/presentation/scene-schema.ts`: valida as relações antes de resolver posições; rejeita ciclos, referências fora do grupo e do pai geométrico imediato, números inválidos e posições fora dos limites.
- `src/presentation/scene-session.ts`: edições recalculam dependentes; um deslocamento direto remove a relação daquela peça. As alterações permanecem atômicas.
- `shared/scene-capabilities.ts`: instruções para silhueta, apoios, proporções, materiais compartilhados, curvas e escolha de geometrias conforme o assunto; geração compacta como padrão. Antes da geometria, o modelo descreve brevemente o assunto concreto, a silhueta e suas características marcantes. Grupos estruturais permanecem neutros, com rotação nas folhas para não girar pernas/apoios acidentalmente. Modelos Flash 2.5 usam raciocínio limitado a 1024 tokens; o processamento de geração continua no provedor.
- `src/presentation/visual-generator.ts`: seleção de Flash completo mais recente anunciado, com retorno ao modelo configurado se houver recusa ou indisponibilidade; cache temporário de criações autocontidas, separado por conversa, limitado a oito entradas e aproximadamente 512 KB por instância do gerador, com validade de vinte minutos. Reexecuta a validação ao recuperar. Pedidos contextuais e edições seguem para o modelo. O cache não persiste após reiniciar o servidor.

Exemplo de encaixe: um monitor pode usar `place: {on: "base", gap: 0}`; o servidor calcula sua altura a partir das dimensões reais. Nós sem `place` continuam aceitando posições locais, necessárias para criaturas e composições livres.

## Testes

- `tests/scene-style.test.ts`: paleta, bisel, reutilização de materiais/lotes, apoio no chão, montagem repetível, movimento reduzido, orçamento e rótulos de peças rotacionadas.
- `tests/scene-placement.test.ts`: dependências fora de ordem, cadeiras com peças apoiadas, ciclos, entradas inválidas, rotação, escala, grupos e edições.
- `tests/visual-generator.test.ts`: reaproveitamento limitado, isolamento entre conversas, rejeição de referências contextuais e ausência de cache para documentos rejeitados.

Os resultados finais dos comandos e da verificação no navegador são registrados na seção de entrega ao final deste documento.

## Limites desta entrega

A entrada animada começa depois que o documento validado chega ao navegador. Streaming NDJSON por peça, biblioteca persistente/favoritos, assets glTF e ações articuladas sincronizadas com a narração ainda não foram implementados. O estilo Desenho usa sombreamento em degraus; não inclui pós-processamento de contornos ou SSAO. A correção de cores é de legibilidade, sem garantir contraste entre cada par de peças vizinhas.

Os encaixes usam caixas envolventes; formas orgânicas ou curvas podem precisar de um pequeno `offset`. A centralização no cliente usa a geometria construída. Não se promete qualquer objeto com a mesma qualidade nem o primeiro elemento em dois segundos: o prazo depende do provedor e da complexidade do pedido.

## Como conferir

1. Atualize a página do Jasper e peça uma representação 3D nova.
2. Compare os estilos Estúdio e Desenho; mantenha Leve neste notebook.
3. Teste `Repetir montagem`, rotação, zoom e mudança de qualidade.
4. Em desenvolvimento, abra `/scene-lab.html?debug=1&quality=low` na porta 5173 para comparar as cenas de verificação.
5. Para conferir o cache, repita exatamente uma criação autocontida, como “Crie uma luminária.”, na mesma conversa, dentro de vinte minutos. Alterações contextuais devem produzir uma nova solicitação ao modelo.


## Verificação no navegador e limitações observadas

A versão compilada da porta 3000 abriu uma apresentação real de uma cadeira. A falha de abertura enviada pelo usuário não foi reproduzida nesse teste; portanto, não foi identificada sua exceção original. A recuperação foi verificada no laboratório: uma falha simulada exibiu a opção de tentar novamente; a mesma cena voltou sem recarregar a página; uma cena diferente também abriu após uma nova falha. O detalhe do erro fica disponível para diagnóstico se o problema reaparecer.

A primeira geração real de dinossauro passou na validação técnica, mas teve resultado visual ruim. Essa geração NÃO foi considerada aprovação de qualidade. Foram acrescentados planejamento explícito da silhueta, orientação de grupos/folhas e correção de enquadramento quando o modelo adiciona um piso desproporcional.

A comparação final de qualidade com uma nova geração ficou impedida pelo provedor: `gemini-3.8-flash` e `gemini-3.7-flash` retornaram HTTP 503 (`UNAVAILABLE`); `gemini-2.5-flash` retornou HTTP 429 (`RESOURCE_EXHAUSTED`). Não foi exibida uma cena de exemplo como se fosse uma geração bem-sucedida. Nenhuma promessa de geração em dois segundos foi validada.

No laboratório, o renderizador exibiu uma cena de cadeira com 950 triângulos, sete chamadas de desenho, um contexto gráfico e cerca de 28 MB de memória JavaScript nessa sessão. O perfil leve teve variações de aproximadamente 21 a 30 FPS enquanto a máquina também executava desenvolvimento/compilação. Esses números são observações locais, não garantia de desempenho em todos os aparelhos. A captura de recuperação é de uma cena de verificação, não uma geração nova do Gemini.

Captura: `/home/velton/Documents/Codex/2026-10-15/https-chatgpt-com-codex-desktop-auth/outputs/jasper-3d-recuperacao-estudio.jpg`.


## Resultado da entrega

- Suíte completa: **158 de 158 testes passaram**, em 32 arquivos, sem arquivos com falha.
- Tipos do servidor e do cliente: aprovados.
- Compilação do servidor e do cliente: aprovada.
- `git diff --check`: sem erros de espaços em branco.
- Permanece o aviso de tamanho de pacotes do Vite: entrada principal de aproximadamente 881 KB e tela de apresentação de 690 KB, antes da compressão. Não impede a compilação, mas pode afetar a primeira abertura em conexões lentas.
- Recuperação da apresentação: verificada no navegador com falha simulada, tentativa manual e abertura de outra cena; uma apresentação real de cadeira também abriu na porta 3000.
- Qualidade do dinossauro: **pendente de nova geração real e inspeção visual**, devido à indisponibilidade e ao limite do provedor. Não se considera o problema visual resolvido somente pela aprovação dos testes.

As mudanças de voz, microfone, interface geral e outras alterações preexistentes no diretório foram preservadas, sem inclusão nos commits desta entrega. As fases futuras da revisão de segurança continuam fora deste escopo.
