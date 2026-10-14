#!/bin/bash
# ==============================================================================
# JASPER - WO Mic Intelligent Audio Bridge Service
# Autodetecção de sub-rede, dispositivo ALSA Loopback e fallback automático
# ==============================================================================

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MICCLIENT_BIN="$SCRIPT_DIR/micclient-x86_64.AppImage"
BRIDGE_PID=""
MICCLIENT_PID=""

# Descobre o microfone físico padrão do notebook
find_notebook_mic() {
  local cur
  cur=$(pactl get-default-source 2>/dev/null || true)
  if [ -n "$cur" ] && [[ "$cur" != *"womic"* ]] && [[ "$cur" != *"Loopback"* ]]; then
    echo "$cur"
    return
  fi
  local mic
  mic=$(pactl list short sources 2>/dev/null | grep -i 'Digital' | awk '{print $2}' | head -n1)
  if [ -z "$mic" ]; then
    mic=$(pactl list short sources 2>/dev/null | grep 'alsa_input' | grep -v -iE 'loopback|womic' | tail -n1 | awk '{print $2}')
  fi
  if [ -z "$mic" ]; then
    mic="alsa_input.pci-0000_00_1f.3-platform-skl_hda_dsp_generic.HiFi__hw_sofhdadsp_6__source"
  fi
  echo "$mic"
}

DEFAULT_MIC=$(find_notebook_mic)
echo "🎙️ Microfone padrão do notebook detectado: $DEFAULT_MIC"

# Descobre dinamicamente o dispositivo ALSA Loopback
find_loopback_device() {
  local card_num
  card_num=$(awk '/Loopback/ {print $1; exit}' /proc/asound/cards 2>/dev/null || true)
  if [ -n "$card_num" ]; then
    echo "plughw:${card_num},1"
  else
    echo "plughw:CARD=Loopback,DEV=1"
  fi
}

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

# Move todos os fluxos de gravação ativos (navegador, etc) para uma fonte
move_active_recording_streams() {
  local target_source="$1"
  for stream_id in $(pactl list short source-outputs 2>/dev/null | awk '{print $1}'); do
    pactl move-source-output "$stream_id" "$target_source" 2>/dev/null || true
  done

  # Garante ligação direta no PipeWire para navegadores (Firefox/Chrome)
  for in_port in $(pw-link -i 2>/dev/null | grep -iE 'Firefox:input|Chromium:input|chrome:input' || true); do
    if [ "$target_source" = "womic_mic.monitor" ]; then
      if [[ "$in_port" == *"_FL" ]]; then
        pw-link "womic_mic:monitor_FL" "$in_port" 2>/dev/null || true
      else
        pw-link "womic_mic:monitor_FR" "$in_port" 2>/dev/null || true
      fi
    fi
  done
}

start_audio_bridge() {
  pkill -f "arecord.*Loopback" 2>/dev/null || true
  pkill -f "pacat -p.*womic_mic" 2>/dev/null || true
  
  local loopback_dev
  loopback_dev=$(find_loopback_device)
  echo "🔗 Iniciando bridge de áudio: $loopback_dev -> PipeWire womic_mic..."
  
  nohup arecord -D "$loopback_dev" -f S16_LE -r 48000 -c 1 -q 2>/dev/null | \
    pacat -p --raw --format=s16le --rate=48000 --channels=1 -d womic_mic >/dev/null 2>&1 &
  BRIDGE_PID=$!
  
  sleep 0.5
  pactl set-default-source womic_mic.monitor 2>/dev/null || true
  move_active_recording_streams "womic_mic.monitor"
  notify_backend "womic"
  echo "✅ Áudio do WO Mic roteado com sucesso para o sistema e aplicativos!"
}

stop_audio_bridge() {
  if [ -n "$BRIDGE_PID" ]; then
    kill "$BRIDGE_PID" 2>/dev/null || true
    BRIDGE_PID=""
  fi
  pkill -f "arecord.*Loopback" 2>/dev/null || true
  pkill -f "pacat -p.*womic_mic" 2>/dev/null || true
  
  DEFAULT_MIC=$(find_notebook_mic)
  pactl set-default-source "$DEFAULT_MIC" 2>/dev/null || true
  move_active_recording_streams "$DEFAULT_MIC"
  notify_backend "notebook"
  echo "🔙 Microfone do notebook restaurado ($DEFAULT_MIC)."
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

while true; do
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
    start_audio_bridge
    
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
