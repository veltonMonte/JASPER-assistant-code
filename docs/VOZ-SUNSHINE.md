# Voz sem som na transmissão Sunshine/Moonlight

18/10/2026. Correção do incidente em que o Jasper mostrava “Respondendo” e o
orb reagia, mas a fala não chegava ao Moonlight. O usuário confirmou o retorno
da voz pelo botão **Ouvir resposta** depois da correção.

## Causa comprovada

O serviço de voz devolveu HTTP 200 e um WAV mono a 24 kHz, com 3,56 segundos,
RMS 0,161 e 59.552 amostras acima de 0,01. A geração não estava silenciosa.
A saída padrão e o Firefox apontavam para `sink-sunshine-stereo`, sem mudo.

Entretanto, a captura `sunshine-record` estava ligada ao microfone físico.
Os vínculos efetivos do PipeWire confirmaram a ligação. Mudanças manuais nessa
captura voltavam ao microfone: `womic-service.sh` movia **todos** os fluxos de
gravação, incluindo o Sunshine, ao selecionar/restaurar o WO Mic.
O estado SPEAKING e a animação do orb, isoladamente, não comprovam que a fala
chega à transmissão ou aos alto-falantes.

## Alterações

- `womic-service.sh`: carrega as funções de roteamento específicas da ponte.
- `womic-routing.sh`: redireciona somente entradas reconhecidas de navegadores;
  preserva Sunshine, OBS e capturas de áudio da tela. Usa inventário JSON e não
  altera gravações se a consulta falhar. A descoberta do microfone físico também
  descarta fontes `.monitor`. Retirada a ligação adicional de portas que podia
  misturar fontes na captura do navegador. Usa Python já exigido pela ponte.
- `tests/womic-routing.test.ts`: inventários e comandos simulados, sem alterar
  áudio real ou acessar rede. Testa troca entre WO Mic/notebook, preservação de
  transmissões, captura de tela, nomes/ids desconhecidos e inventário inválido;
  valida a sintaxe dos dois arquivos de shell.
- Configuração local externa ao repositório:
  `/home/velton/.config/sunshine/sunshine.conf` recebeu somente
  `audio_sink = sink-sunshine-stereo`, opção documentada em
  [Configuração do Sunshine](https://github.com/LizardByte/Sunshine/blob/master/docs/configuration.md#audio_sink).

Foi reiniciada apenas `jasper-womic.service` para carregar a correção, e a captura
ativa do Sunshine foi redirecionada para `sink-sunshine-stereo.monitor`.
Os vínculos efetivos passaram a duas conexões ativas da saída virtual para o
Sunshine e permaneceram corretos após os ciclos da ponte. Jasper, Sunshine e a
ponte continuaram ativos. A sessão de transmissão permaneceu aberta.

## Verificação

- Três testes novos passaram isoladamente.
- `npm run test:features`: **125/125 testes**, 26 arquivos, sem falhas.
- `npm run typecheck` e `npm run typecheck:client`: ambos passaram.
- A frase de teste foi reproduzida diretamente na saída Sunshine. O usuário
  confirmou a frase completa e, em seguida, confirmou que **Ouvir resposta** no
  Jasper voltou a funcionar pelo Moonlight.
- O serviço HTTP permaneceu online. Arquivos de segredos e credenciais não foram
  abertos, impressos nem copiados. As alterações anteriores do usuário foram
  preservadas. As fases de segurança pausadas continuam fora deste escopo.

A seleção vale para este computador; em um navegador aberto diretamente em
outro aparelho, o som usa a saída daquele aparelho. O próximo reinício do
Sunshine lerá a opção salva. Se o usuário mudar o destino de reprodução, a
captura do Sunshine deve acompanhar a nova saída.
