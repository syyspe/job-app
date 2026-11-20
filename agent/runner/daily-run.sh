#!/usr/bin/env bash
# What the Windows scheduled task runs (README, "Daily run"): starts job-app if
# it isn't answering, then runs agent:run, all output appended to the day's log.
set -u

cd "$(dirname "$0")/../.." || exit 1
logs="${XDG_STATE_HOME:-$HOME/.local/state}/job-agent/logs"
mkdir -p "$logs"
exec >>"$logs/run-$(date +%F).log" 2>&1
echo "== $(date -Is) daily run"

env_file="${XDG_CONFIG_HOME:-$HOME/.config}/job-agent/env"
url=$(sed -n 's/^JOBAPP_API_URL=//p' "$env_file" | tail -n 1 | tr -d "\"'")

# Any HTTP answer counts; only a failed connection means the server is down.
answering() {
  curl -sk -o /dev/null --max-time 3 "$url/api/login"
}

if [ -n "$url" ] && ! answering; then
  echo "job-app not answering at $url; starting it"
  setsid nohup npm start >>"$logs/server.log" 2>&1 </dev/null &
  for _ in $(seq 60); do
    sleep 2
    answering && break
  done
fi

npm run --silent agent:run
