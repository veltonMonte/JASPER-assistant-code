# Jasper — ponto de pausa

O usuário pediu em 18/10/2026 para interromper as próximas fases e deixar o
Jasper funcionando. As fases 0, 1 e 2 estão concluídas e documentadas em
FASE-0.md, FASE-1.md e FASE-2.md. Não avançar sem uma nova solicitação.

O começo da fase 3 foi retirado do código ativo e guardado em:
`/home/velton/Documents/Codex/jasper-fase3-em-andamento-2026-10-18/`.
São rascunhos incompletos, sem testes nem integração completa; não copiar por
cima do projeto. O LEIA-ME nessa pasta explica as dependências e os cuidados.
O projeto preserva as alterações locais anteriores de voz, interface e notícias.
Nenhum arquivo de segredos foi aberto ou copiado.

Antes de parar foi corrigido um defeito encontrado no botão de aprovação do
terminal: o transporte emitia um evento sem receptor. Agora chama o resolvedor
já existente, que valida a decisão e só publica o estado depois de resolver.
O teste terminal-ui.test.ts usa credenciais falsas e apenas echo para comprovar
a execução após o clique autorizado, sem rede externa nem acesso a segredos.

Verificação do estado estável: 100 testes da suíte passaram com Node 24.19.0;
o teste adicional do botão passou isoladamente. Tipos do servidor e cliente
passaram, assim como a compilação. No navegador, porta 3000 carregou a interface,
mostrou conexão e microfone ativo e respondeu à pergunta de horário sem erros
no console. A página também respondeu HTTP 200 pelo IP da rede local.
A qualidade perceptiva da voz e o desempenho em outro aparelho precisam ser
conferidos pelo usuário. A limitação conhecida do runner do Node 18 está descrita
no relatório da fase 2; o Node do sistema não foi alterado.

Ao retomar: revisar AGENTS.md, git status e os últimos commits; começar pela
fase 3, conferir o rascunho contra o código atual e completar testes, contexto de
sessão e interface antes de ativá-lo. Fases 4–7 não foram iniciadas.


## Retomada autorizada: modelagem livre e voz — 18/10/2026

O usuário retomou especificamente o plano de modelagem sem presets e pediu
correção das respostas sem voz. Foram integrados os contratos SceneSpec v2
iniciados por ele, compilador geométrico, validação, geração estruturada,
edição por sessão e desfazer. O cliente conserva a saída de áudio desbloqueada
e solicita a voz configurada quando um turno chega apenas em texto.

As fases de segurança 3–7 continuam pausadas. O rascunho externo da fase 3
não foi restaurado. A próxima retomada deve partir do pedido atual do usuário,
sem tratar o parágrafo antigo “Ao retomar” como autorização automática.
Consulte MODELAGEM-LIVRE-E-VOZ.md para arquivos, testes e limites.
