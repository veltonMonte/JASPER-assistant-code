#!/bin/bash
set -e

echo "=== Configurando Inicialização Automática do JASPER no Linux (systemd) ==="

SERVICE_DIR="$HOME/.config/systemd/user"
mkdir -p "$SERVICE_DIR"

# 1. Serviço Backend
cat << 'EOF' > "$SERVICE_DIR/jasper-backend.service"
[Unit]
Description=JASPER AI Assistant Backend
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/velton/.gemini/antigravity/scratch/jasper
ExecStart=/usr/bin/npm run dev
Restart=always
RestartSec=5
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/bin

[Install]
WantedBy=default.target
EOF

# 2. Serviço Frontend
cat << 'EOF' > "$SERVICE_DIR/jasper-frontend.service"
[Unit]
Description=JASPER AI Assistant Frontend
After=network.target jasper-backend.service

[Service]
Type=simple
WorkingDirectory=/home/velton/.gemini/antigravity/scratch/jasper/client
ExecStart=/usr/bin/npm run dev
Restart=always
RestartSec=5
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/bin

[Install]
WantedBy=default.target
EOF

echo "Recarregando daemon do systemd..."
systemctl --user daemon-reload

echo "Habilitando inicialização automática dos serviços..."
systemctl --user enable jasper-backend.service
systemctl --user enable jasper-frontend.service

echo "Habilitando permanência de login no boot (linger)..."
loginctl enable-linger "$USER" || true

echo "Iniciando os serviços agora..."
systemctl --user start jasper-backend.service
systemctl --user start jasper-frontend.service

echo "=== Configuração Concluída com Sucesso! ==="
echo "Status do Backend:"
systemctl --user status jasper-backend.service --no-pager || true
echo ""
echo "Status do Frontend:"
systemctl --user status jasper-frontend.service --no-pager || true
