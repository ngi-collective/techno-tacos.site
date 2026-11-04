#!/bin/bash
# Stop hook: speaks a final reply line that starts with "Summary: ", so turns without one stay silent.
# SPEAK_BIN overrides the speech command for testing.
set -u

speak_bin="${SPEAK_BIN:-say}"
pid_file="${TMPDIR:-/tmp}/beach-demo-say.pid"

summary=$(jq -r '.last_assistant_message // ""' | sed -n 's/^Summary: //p' | tail -n 1)
[ -n "$summary" ] || exit 0

# Stop the previous summary so two replies never talk over each other.
if [ -f "$pid_file" ]; then
  previous=$(cat "$pid_file")
  [ "$(ps -o comm= -p "$previous" 2>/dev/null | xargs basename 2>/dev/null)" = "$(basename "$speak_bin")" ] && kill "$previous" 2>/dev/null
fi

nohup "$speak_bin" "$summary" >/dev/null 2>&1 &
echo $! > "$pid_file"
exit 0
