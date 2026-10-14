#!/bin/bash
DEFAULT_MIC="alsa_input.pci-0000_00_1f.3-platform-skl_hda_dsp_generic.HiFi__hw_sofhdadsp_6__source"
PHONE_IP="${1:-192.168.100.13}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Garante que o microfone interno esteja ativo e desmutado
pactl set-source-mute "$DEFAULT_MIC" 0 2>/dev/null || true
pactl set-default-source "$DEFAULT_MIC" 2>/dev/null || true

setup_womic_nodes() {
  # Cria o null-sink womic_mic se não existir
  if ! pactl list short sinks | grep -q "womic_mic"; then
    pactl load-module module-null-sink sink_name=womic_mic sink_properties=device.description="WOMic" 2>/dev/null || true
  fi
  # Cria o remap-source womic_source se não existir
  if ! pactl list short sources | grep -q "womic_source"; then
    pactl load-module module-remap-source master=womic_mic.monitor source_name=womic_source source_properties=device.description="WO_Mic" 2>/dev/null || true
  fi
}

start_audio_bridge() {
  # Mata bridges antigas se houver
  pkill -f "arecord -D plughw:1,1" 2>/dev/null || true
  # Inicia bridge ALSA plughw:1,1 -> PipeWire womic_mic
  nohup arecord -D plughw:1,1 -f S16_LE -r 48000 -c 1 -q 2>/dev/null | pacat -p --raw --format=s16le --rate=48000 --channels=1 -d womic_mic >/dev/null 2>&1 &
  BRIDGE_PID=$!
  sleep 0.5
  pactl set-default-source womic_source 2>/dev/null || true
  # Conecta streams ativos do Firefox diretamente ao womic_source
  pw-link womic_source:capture_FL Firefox:input_FL 2>/dev/null || true
  pw-link womic_source:capture_FR Firefox:input_FR 2>/dev/null || true
  pw-link -d alsa_input.platform-snd_aloop.0.analog-stereo:capture_FL Firefox:input_FL 2>/dev/null || true
  pw-link -d alsa_input.platform-snd_aloop.0.analog-stereo:capture_FR Firefox:input_FR 2>/dev/null || true
}

stop_audio_bridge() {
  if [ -n "$BRIDGE_PID" ]; then
    kill "$BRIDGE_PID" 2>/dev/null || true
  fi
  pkill -f "arecord -D plughw:1,1" 2>/dev/null || true
  pactl set-default-source "$DEFAULT_MIC" 2>/dev/null || true
  # Reconecta Firefox ao microfone padrão do notebook se estiver ativo
  pw-link "$DEFAULT_MIC:capture_FL" Firefox:input_FL 2>/dev/null || true
  pw-link "$DEFAULT_MIC:capture_FR" Firefox:input_FR 2>/dev/null || true
  pw-link -d womic_source:capture_FL Firefox:input_FL 2>/dev/null || true
  pw-link -d womic_source:capture_FR Firefox:input_FR 2>/dev/null || true
}

find_womic_ip() {
  python3 -c '
import socket
from concurrent.futures import ThreadPoolExecutor

def check_ip(ip):
    s = socket.socket()
    s.settimeout(0.2)
    try:
        if s.connect_ex((ip, 8125)) == 0:
            return ip
    except:
        pass
    finally:
        s.close()
    return None

ips = [f"192.168.100.{i}" for i in range(1, 255)]
with ThreadPoolExecutor(max_workers=30) as ex:
    for ip in ex.map(check_ip, ips):
        if ip:
            print(ip)
            break
' 2>/dev/null
}

setup_womic_nodes

while true; do
  TARGET_IP="$PHONE_IP"
  if ! nc -z -w 1 "$TARGET_IP" 8125 2>/dev/null; then
    DISCOVERED=$(find_womic_ip)
    if [ -n "$DISCOVERED" ]; then
      TARGET_IP="$DISCOVERED"
    fi
  fi

  if nc -z -w 1 "$TARGET_IP" 8125 2>/dev/null; then
    echo "📱 Conectando ao WO Mic em $TARGET_IP:8125..."
    setup_womic_nodes
    
    # Inicia micclient em background
    "$SCRIPT_DIR/micclient-x86_64.AppImage" -t Wifi "$TARGET_IP" &
    MICCLIENT_PID=$!
    
    sleep 1
    start_audio_bridge
    
    # Aguarda micclient finalizar
    wait "$MICCLIENT_PID" 2>/dev/null || true
    
    echo "⚠️ WO Mic desconectado. Restaurando microfone do notebook..."
    stop_audio_bridge
  else
    pactl set-default-source "$DEFAULT_MIC" 2>/dev/null || true
  fi
  sleep 2
done
