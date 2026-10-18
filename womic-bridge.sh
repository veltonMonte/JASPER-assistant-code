# Inicialização e encerramento somente dos processos pertencentes à ponte WO Mic.
find_loopback_device() {
  local card_num
  card_num=$(awk '/\[Loopback[[:space:]]*\]/ && $1 ~ /^[0-9]+$/ { print $1; exit }' "${1:-/proc/asound/cards}" 2>/dev/null || true)
  [ -n "$card_num" ] || return 1
  printf 'plughw:%s,1,0\n' "$card_num"
}

stop_bridge_processes() {
  local pid
  for pid in "${CAPTURE_PID:-}" "${BRIDGE_PID:-}"; do
    if [ -n "$pid" ]; then
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
    fi
  done
  CAPTURE_PID=""
  BRIDGE_PID=""
  if [ -n "${BRIDGE_DIR:-}" ]; then
    rm -f -- "$BRIDGE_DIR/audio.pcm"
    rmdir -- "$BRIDGE_DIR" 2>/dev/null || true
    BRIDGE_DIR=""
  fi
}

start_audio_bridge() {
  local loopback_dev pid
  loopback_dev=$(find_loopback_device) || { echo "⚠️ Driver snd-aloop não está pronto."; return 1; }
  [ -n "${MICCLIENT_PID:-}" ] && kill -0 "$MICCLIENT_PID" 2>/dev/null || return 1
  stop_bridge_processes
  BRIDGE_DIR=$(mktemp -d "${TMPDIR:-/tmp}/jasper-womic-XXXXXX") || return 1
  if ! mkfifo "$BRIDGE_DIR/audio.pcm"; then stop_bridge_processes; return 1; fi
  echo "🔗 Iniciando ponte de áudio: $loopback_dev -> WO Mic…"
  arecord -D "$loopback_dev" -f S16_LE -r 48000 -c 1 -q > "$BRIDGE_DIR/audio.pcm" &
  CAPTURE_PID=$!
  pacat -p --raw --format=s16le --rate=48000 --channels=1 -d womic_mic < "$BRIDGE_DIR/audio.pcm" &
  BRIDGE_PID=$!
  sleep 0.5
  for pid in "$CAPTURE_PID" "$BRIDGE_PID" "$MICCLIENT_PID"; do
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "⚠️ A conexão ou a ponte de áudio encerrou antes de ficar pronta."
      stop_bridge_processes
      return 1
    fi
  done
  if ! pactl set-default-source womic_mic.monitor; then stop_bridge_processes; return 1; fi
  move_active_recording_streams "womic_mic.monitor"
  notify_backend "womic"
  echo "✅ Cliente e ponte de áudio do WO Mic estão ativos."
}

stop_audio_bridge() {
  stop_bridge_processes
  DEFAULT_MIC=$(find_notebook_mic)
  pactl set-default-source "$DEFAULT_MIC" 2>/dev/null || true
  move_active_recording_streams "$DEFAULT_MIC"
  notify_backend "notebook"
  echo "🔙 Microfone do notebook restaurado ($DEFAULT_MIC)."
}
