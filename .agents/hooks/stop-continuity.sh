#!/usr/bin/env bash
# Stop hook — while a dev-execute stream is active, ask Claude Code to continue the loop.
# Limits: max 3 continuations per run (counter in the state file, reset by /dev-execute);
# states older than STALE_HOURS are ignored (crash protection). Fail open on any error.
STALE_HOURS=12
MAX_CONT=3

main() {
  local dir="${CLAUDE_PROJECT_DIR:-$PWD}"
  cd "$dir" 2>/dev/null || return 0
  [ -d .claude/runs ] || return 0

  local f plan status started cont planfile left active=0 msg="" now
  now=$(date +%s)
  for f in .claude/runs/*.state; do
    [ -e "$f" ] || return 0
    plan=$(sed -n 's/^plan:[[:space:]]*//p' "$f" | head -1)
    status=$(sed -n 's/^status:[[:space:]]*//p' "$f" | head -1)
    started=$(sed -n 's/^started:[[:space:]]*//p' "$f" | head -1)
    cont=$(sed -n 's/^continuations:[[:space:]]*//p' "$f" | head -1); cont=${cont:-0}
    [ "$status" = "executing" ] && [ -n "$plan" ] || continue
    # stale run (crashed session) → do not block
    if [ -n "$started" ]; then
      local st; st=$(date -d "$started" +%s 2>/dev/null || echo "$now")
      [ $(( (now - st) / 3600 )) -ge "$STALE_HOURS" ] && continue
    fi
    [ "$cont" -ge "$MAX_CONT" ] && continue
    active=$((active + 1))
    # bump counter
    if grep -q '^continuations:' "$f"; then
      sed -i "s/^continuations:.*/continuations: $((cont + 1))/" "$f"
    else
      printf 'continuations: %s\n' "$((cont + 1))" >> "$f"
    fi
    left=0
    planfile=$(ls docs/50-plans/"${plan}"-*.md 2>/dev/null | head -1)
    [ -n "$planfile" ] && left=$(grep -c '☐' "$planfile" 2>/dev/null || echo 0)
    msg="${msg} ${plan}: ${left} open task(s);"
  done

  [ "$active" -gt 0 ] || return 0
  printf '{"decision":"block","reason":"dev-execute is still active:%s Do not stop. Continue the loop: pick the next READY task in the plan DAG; if the stream is blocked, set its .claude/runs state to paused, report the blocker, then stop."}' "$msg"
}

main
exit 0
