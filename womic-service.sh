#!/bin/bash
# ==============================================================================
# JASPER - WO Mic Intelligent Audio Bridge Service
# Autodetecção de sub-rede, dispositivo ALSA Loopback e fallback automático
# ==============================================================================

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MICCLIENT_BIN="$SCRIPT_DIR/micclient-x86_64.AppImage"
BRIDGE_PID=""
CAPTURE_PID=""
BRIDGE_DIR=""
MICCLIENT_PID=""

# Roteia somente microfones dos navegadores, preservando capturas de tela e transmissão.
source "$SCRIPT_DIR/womic-routing.sh"
source "$SCRIPT_DIR/womic-bridge.sh"

DEFAULT_MIC=$(find_notebook_mic)
echo "🎙️ Microfone padrão do notebook detectado: $DEFAULT_MIC"

# Notifica o backend do JASPER sobre a alteração do microfone
notify_backend() {
  local mic_type="$1"
  curl -s -X POST http://127.0.0.1:3000/api/audio/mic-status \
    -H "Content-Type: application/json" \
    -d "{\"activeMic\":\"$mic_type\"}" >/dev/null 2>&1 || true
}

# Configura nós virtuais PipeWire/PulseAudio
setup_womic_nodes() {
  if ! pactl list short sinks 2>/dev/null | grep -q "womic_mic"; then
    pactl load-module module-null-sink sink_name=womic_mic sink_properties=device.description="WOMic" 2>/dev/null || true
  fi
}

# Varre dinamicamente todas as sub-redes ativas em busca do WO Mic (porta 8125)
find_womic_ip() {
  python3 -c '
import socket, subprocess, ipaddress
from concurrent.futures import ThreadPoolExecutor

def get_subnets():
    try:
        out = subprocess.check_output(["ip", "-4", "-o", "addr", "show", "scope", "global"]).decode()
    except Exception:
        return []
    subnets = []
    for line in out.strip().split("\n"):
        parts = line.split()
        if len(parts) >= 4:
            iface = parts[1]
            cidr = parts[3]
            if not any(iface.startswith(x) for x in ["docker", "br-", "veth", "tailscale", "lo"]):
                try:
                    subnets.append(ipaddress.ip_network(cidr, strict=False))
                except Exception:
                    pass
    return subnets

def check_ip(ip):
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(0.18)
    try:
        if s.connect_ex((str(ip), 8125)) == 0:
            return str(ip)
    except Exception:
        pass
    finally:
        s.close()
    return None

for net in get_subnets():
    hosts = list(net.hosts())
    if len(hosts) > 1024:
        continue
    with ThreadPoolExecutor(max_workers=60) as ex:
        for res in ex.map(check_ip, hosts):
            if res:
                print(res)
                exit(0)
' 2>/dev/null || true
}

cleanup() {
  trap - SIGINT SIGTERM EXIT
  echo "🛑 Encerrando serviço WO Mic..."
  if [ -n "$MICCLIENT_PID" ]; then
    kill "$MICCLIENT_PID" 2>/dev/null || true
  fi
  stop_audio_bridge
  exit 0
}

trap cleanup SIGINT SIGTERM EXIT

setup_womic_nodes

PREV_TARGET_IP="${1:-}"
WAITING_FOR_DRIVER=0

while true; do
  if ! find_loopback_device >/dev/null; then
    if [ "$WAITING_FOR_DRIVER" = "0" ]; then
      echo "⚠️ WO Mic indisponível: carregue o driver snd-aloop com o instalador de áudio. Usando o microfone do notebook."
      stop_audio_bridge
      WAITING_FOR_DRIVER=1
    fi
    sleep 5
    continue
  fi
  WAITING_FOR_DRIVER=0
  TARGET_IP="$PREV_TARGET_IP"
  
  if [ -z "$TARGET_IP" ] || ! nc -z -w 1 "$TARGET_IP" 8125 2>/dev/null; then
    DISCOVERED=$(find_womic_ip)
    if [ -n "$DISCOVERED" ]; then
      TARGET_IP="$DISCOVERED"
      PREV_TARGET_IP="$DISCOVERED"
    fi
  fi

  if [ -n "$TARGET_IP" ] && nc -z -w 1 "$TARGET_IP" 8125 2>/dev/null; then
    echo "📱 WO Mic detectado em $TARGET_IP:8125! Conectando cliente..."
    setup_womic_nodes
    
    # Executa micclient
    "$MICCLIENT_BIN" -t Wifi "$TARGET_IP" &
    MICCLIENT_PID=$!
    
    sleep 1
    if ! start_audio_bridge; then
      echo "⚠️ A ponte do WO Mic não iniciou. Mantendo o microfone do notebook."
      kill "$MICCLIENT_PID" 2>/dev/null || true
      wait "$MICCLIENT_PID" 2>/dev/null || true
      MICCLIENT_PID=""
      stop_audio_bridge
      sleep 5
      continue
    fi
    
    # Aguarda o processo do micclient
    wait "$MICCLIENT_PID" 2>/dev/null || true
    MICCLIENT_PID=""
    
    echo "⚠️ WO Mic desconectado. Revertendo para o microfone do notebook..."
    stop_audio_bridge
  else
    # Sem WO Mic ativo: garante microfone do notebook
    DEFAULT_MIC=$(find_notebook_mic)
    cur_def=$(pactl get-default-source 2>/dev/null || true)
    if [[ "$cur_def" == *"womic"* ]]; then
      pactl set-default-source "$DEFAULT_MIC" 2>/dev/null || true
      move_active_recording_streams "$DEFAULT_MIC"
      notify_backend "notebook"
    fi
  fi
  sleep 3
done
