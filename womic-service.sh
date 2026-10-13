#!/bin/bash
DEFAULT_MIC="alsa_input.pci-0000_00_1f.3-platform-skl_hda_dsp_generic.HiFi__hw_sofhdadsp_6__source"
LOOPBACK_MIC="alsa_input.platform-snd_aloop.0.analog-stereo"
PHONE_IP="${1:-192.168.100.13}"

# Garante que o microfone interno esteja ativo e desmutado
pactl set-source-mute "$DEFAULT_MIC" 0 2>/dev/null || true
pactl set-default-source "$DEFAULT_MIC" 2>/dev/null || true

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
    pactl set-default-source "$LOOPBACK_MIC" 2>/dev/null || true
    /home/velton/.gemini/antigravity/scratch/jasper/micclient-x86_64.AppImage -t Wifi "$TARGET_IP"
    echo "⚠️ WO Mic desconectado. Restaurando microfone do notebook..."
    pactl set-default-source "$DEFAULT_MIC" 2>/dev/null || true
  else
    pactl set-default-source "$DEFAULT_MIC" 2>/dev/null || true
  fi
  sleep 2
done
