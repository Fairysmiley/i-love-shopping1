#!/usr/bin/env bash
set -euo pipefail

curl -s https://ngrok-agent.s3.amazonaws.com/ngrok.asc | sudo tee /etc/apt/trusted.gpg.d/ngrok.asc >/dev/null
echo "deb https://ngrok-agent.s3.amazonaws.com buster main" | sudo tee /etc/apt/sources.list.d/ngrok.list >/dev/null
sudo apt update
sudo apt install -y ngrok

echo "[install-ngrok] Done. Run: ngrok config add-authtoken <your-authtoken>"
