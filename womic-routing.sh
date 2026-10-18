# Funções de áudio sem inicialização de dispositivos ou serviços.

# Descobre o microfone físico padrão do notebook
find_notebook_mic() {
  local cur
  cur=$(pactl get-default-source 2>/dev/null || true)
  if [ -n "$cur" ] && [[ "$cur" != *"womic"* ]] && [[ "$cur" != *"Loopback"* ]] && [[ "$cur" != *"aloop"* ]] && [[ "$cur" != *".monitor" ]]; then
    echo "$cur"
    return
  fi
  local mic
  mic=$(pactl list short sources 2>/dev/null | grep -iE 'sofhdadsp.*source' | awk '{print $2}' | head -n1)
  if [ -z "$mic" ]; then
    mic=$(pactl list short sources 2>/dev/null | grep 'alsa_input' | grep -v -iE 'loopback|womic|aloop' | tail -n1 | awk '{print $2}')
  fi
  if [ -z "$mic" ]; then
    mic="alsa_input.pci-0000_00_1f.3-platform-skl_hda_dsp_generic.HiFi__hw_sofhdadsp_6__source"
  fi
  echo "$mic"
}

# A captura do Sunshine/OBS e o áudio de compartilhamento de tela não são microfones.
move_active_recording_streams() {
  local target_source="$1"
  local stream_id
  while IFS= read -r stream_id; do
    [[ "$stream_id" =~ ^[0-9]+$ ]] || continue
    pactl move-source-output "$stream_id" "$target_source" 2>/dev/null || true
  done < <(pactl -f json list source-outputs 2>/dev/null | python3 -c '
import json, re, sys
try:
    streams = json.load(sys.stdin)
except (ValueError, TypeError):
    sys.exit(0)
if not isinstance(streams, list):
    sys.exit(0)
for stream in streams:
    if not isinstance(stream, dict):
        continue
    props = stream.get("properties", {})
    if not isinstance(props, dict):
        continue
    if str(props.get("stream.capture.sink", "false")).lower() in ("true", "1"):
        continue
    names = [str(props.get(key, "")).lower() for key in ("application.name", "application.process.binary")]
    browser = any(re.fullmatch(r"(?:firefox(?:-esr)?|chromium(?:-browser)?|(?:google-)?chrome(?:-stable)?|brave(?:-browser)?|microsoft-edge(?:-stable)?|codex)", name) for name in names)
    index = stream.get("index")
    if browser and isinstance(index, int) and not isinstance(index, bool) and index >= 0:
        print(index)
' 2>/dev/null)
}
