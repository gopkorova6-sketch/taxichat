#!/bin/bash
# Runs on every container start (postStartCommand): ensures the app and the
# public tunnel are up, surviving Codespace stop/hibernate cycles.
cd /workspaces/taxichat

# Cloudflared binary persists in the container; download on first run
if [ ! -f ./cloudflared ]; then
  curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o ./cloudflared
  chmod +x ./cloudflared
fi

# App (ephemeral MongoDB + demo data auto-seed on empty database)
(setsid nohup npm start > server.log 2>&1 < /dev/null &)

# Public anonymous tunnel; the trycloudflare URL rotates on every restart
(setsid nohup ./cloudflared tunnel --url http://localhost:4000 > cf.log 2>&1 < /dev/null &)
