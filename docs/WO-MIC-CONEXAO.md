# Recuperação da conexão WO Mic

18/10/2026. O celular era encontrado em Wi-Fi, mas o cliente encerrava com
“Please first load ALSA snd-aloop”. O driver existia no kernel instalado, porém
não estava carregado e não havia placa Loopback em `/proc/asound/cards`.
A ponte continuava iniciando e anunciando sucesso com uma fonte sem áudio.
A dependência é descrita nas [instruções oficiais do WO Mic para Linux](https://wolicheng.com/womic/wo_mic_linux.html).

## Alterações

- `womic-service.sh`: aguarda uma placa Loopback real antes de conectar; não
  repete conexões que já falharam por falta do driver. Durante a espera seleciona
  o microfone físico como alternativa. Trata falha ao iniciar a ponte e não anuncia
  sucesso se o cliente encerrou. O encerramento não repete o próprio trap.
- `womic-bridge.sh`: identifica a placa real e usa captura DEV=1, SUBDEV=0,
  correspondente ao cliente oficial. Só seleciona WO Mic quando cliente,
  captura e reprodução estão vivos. Encerra somente os processos que criou,
  usando um canal temporário privado, sem procurar/matar processos por texto.
  Falhas preservam a separação entre microfone e captura do Sunshine.
- `scripts/enable-womic-loopback.sh`: ajuste curto e revisável que exige
  administrador; carrega somente `snd-aloop` e escreve esse nome em
  `/etc/modules-load.d/jasper-womic.conf` para os próximos inícios.
- `tests/womic-bridge.test.ts`: cinco regressões usando dispositivos e processos
  simulados: driver ausente, número/subdispositivo correto, cliente encerrado,
  captura que falha, ponte saudável e restauração, além de sintaxe/autorização.

## Verificação

Os cinco testes novos e os três testes de roteamento passaram isoladamente.
`npm run test:features`: **130/130 testes**, 27 arquivos. `npm run typecheck`
e `npm run typecheck:client` passaram.

O serviço corrigido foi carregado e registrou a ausência real do driver, sem
anunciar conexão. Jasper e Sunshine permaneceram ativos; a captura do Sunshine
continuou ligada à saída virtual da transmissão.

## Ativação no notebook

O Linux exigiu autorização de administrador. O sudo não interativo solicitou
senha e a solicitação gráfica pkexec não ficou visível para o usuário; ela foi
encerrada pelo sistema como “Request dismissed”. Nenhuma senha foi solicitada
ou recebida no chat. A ativação pode ser feita no terminal do Linux com:

```bash
sudo bash /home/velton/projetos/jasper/scripts/enable-womic-loopback.sh
```

Após o comando, o serviço detecta o driver e tenta reconectar automaticamente.
O aplicativo WO Mic do celular deve continuar iniciado em modo Wi-Fi. Não basta
a porta do celular responder para confirmar captação: é preciso conferir cliente,
ponte e reconhecimento de fala no Jasper. O usuário executou o ajuste e confirmou a mensagem de ativação. Foi verificado:
`sysfs`/ALSA com `snd_aloop` e placa Loopback, cliente conectado ao telefone,
captura e reprodução da ponte ativas. Uma medição sem gravação de arquivo
observou RMS 0,0917 e pico 0,7041 em aproximadamente seis segundos de áudio.
O arquivo de carregamento persistente contém `snd-aloop`. Os dois vínculos de
áudio do Sunshine continuam ativos na saída virtual correta.

O usuário relatou depois que o botão de microfone da interface fica desativado;
a investigação dessa etapa do navegador continua após restaurar a ponte.

O aviso visual do microfone é legado e não comprova fluxo de áudio. A notificação
HTTP antiga da ponte depende da autenticação introduzida na Fase 1 e permanece
fora desta correção de driver; as regras de autenticação não foram flexibilizadas.
Nenhum arquivo de segredos ou credencial foi aberto, impresso ou copiado.
