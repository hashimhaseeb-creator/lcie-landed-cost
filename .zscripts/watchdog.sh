#!/bin/bash
# LCIE dev-server watchdog
# --------------------------------------------------------------------
# Polls port 3000 every 30s. If the Next.js dev server is dead, restarts
# it via `bun run dev` with nohup + setsid so the new server survives
# bash-session cleanup. Logs every action to watchdog.log.
#
# The watchdog itself is launched via `nohup setsid ... & disown` so it
# detaches from the controlling terminal and survives across bash tool
# calls — keeping the preview pane on the Z.ai Code platform alive.
#
# Usage:
#   nohup setsid /home/z/my-project/.zscripts/watchdog.sh \
#     > /home/z/my-project/.zscripts/watchdog.out 2>&1 < /dev/null & disown

PROJECT_DIR="/home/z/my-project"
DEV_LOG="$PROJECT_DIR/dev.log"
PID_FILE="$PROJECT_DIR/.zscripts/dev.pid"
LOG_FILE="$PROJECT_DIR/.zscripts/watchdog.log"
POLL_INTERVAL_SECS=30
HEALTH_URL="http://127.0.0.1:3000/"
MAX_LOG_LINES=2000  # rotate when log exceeds this many lines

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE"
}

port_3000_listening() {
  ss -tlnp 2>/dev/null | grep -q ':3000 '
}

health_check_ok() {
  curl -fsS --max-time 5 -o /dev/null "$HEALTH_URL" 2>/dev/null
}

start_dev_server() {
  # Kill any zombie Next.js processes first
  pkill -9 -f "next dev" 2>/dev/null || true
  pkill -9 -f "next-server" 2>/dev/null || true
  pkill -9 -f "bun.*run.*dev" 2>/dev/null || true
  sleep 1
  # Start the dev server detached from this watchdog's process group
  cd "$PROJECT_DIR" || return 1
  nohup setsid bun run dev > "$DEV_LOG" 2>&1 < /dev/null &
  local new_pid=$!
  disown "$new_pid" 2>/dev/null || true
  echo "$new_pid" > "$PID_FILE"
  log "STARTED dev server (initial PID $new_pid, may fork to next-server)"
}

rotate_log_if_needed() {
  if [ -f "$LOG_FILE" ]; then
    local lines
    lines=$(wc -l < "$LOG_FILE" 2>/dev/null || echo 0)
    if [ "$lines" -gt "$MAX_LOG_LINES" ]; then
      # Keep the last 1000 lines
      tail -n 1000 "$LOG_FILE" > "$LOG_FILE.tmp" 2>/dev/null && mv "$LOG_FILE.tmp" "$LOG_FILE"
      log "LOG ROTATED — was $lines lines, kept last 1000"
    fi
  fi
}

log "watchdog started (PID $$, polling every ${POLL_INTERVAL_SECS}s, health-check $HEALTH_URL)"

# Main loop
while true; do
  rotate_log_if_needed

  # Quick port check first
  if port_3000_listening; then
    # Port is up — do an HTTP health check to confirm the server is actually responding
    if ! health_check_ok; then
      log "PORT 3000 listening but health check FAILED — server hung, killing + restarting"
      pkill -9 -f "next dev" 2>/dev/null || true
      pkill -9 -f "next-server" 2>/dev/null || true
      pkill -9 -f "bun.*run.*dev" 2>/dev/null || true
      sleep 2
      start_dev_server
      sleep 10  # give the new server time to bind before the next poll
    fi
    # else: healthy — silently continue
  else
    log "PORT 3000 NOT listening — dev server is dead, restarting"
    start_dev_server
    sleep 12  # Next.js needs ~10s for initial Turbopack compile on first request
  fi

  sleep "$POLL_INTERVAL_SECS"
done
