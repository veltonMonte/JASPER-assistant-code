#!/bin/bash
# Ativa somente o driver de áudio virtual do WO Mic e seu carregamento no próximo início.
set -euo pipefail
if [ "$EUID" -ne 0 ]; then
  echo "Este ajuste precisa da autorização de administrador do Linux."
  echo "Execute: sudo bash /home/velton/projetos/jasper/scripts/enable-womic-loopback.sh"
  exit 1
fi
/usr/sbin/modprobe snd-aloop
printf 'snd-aloop\n' > /etc/modules-load.d/jasper-womic.conf
printf 'Driver do WO Mic ativado e configurado para os próximos inícios.\n'
