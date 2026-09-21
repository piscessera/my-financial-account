#!/usr/bin/env bash
# Mechanical gate — runs everything a phase must pass WITHOUT a model:
#   validate-docs · TEST_CMD · LINT_CMD · SECRETS_CMD (optional) · PLAN phase rows all ☑ (optional)
# Commands come from .claude/gate.env (copy gate.env.example). Exit 0 = PASS, 1 = FAIL.
#
# Usage: bash .claude/scripts/gate.sh [--plan PLAN-NNNN --phase Pn] [--dir <worktree>] [--skip-tests]

set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="$ROOT"; PLAN=""; PHASE=""; SKIP_TESTS=0
while [ $# -gt 0 ]; do
  case "$1" in
    --plan) PLAN="$2"; shift 2 ;;
    --phase) PHASE="$2"; shift 2 ;;
    --dir) DIR="$(cd "$2" && pwd)"; shift 2 ;;
    --skip-tests) SKIP_TESTS=1; shift ;;
    *) echo "unknown arg: $1"; exit 2 ;;
  esac
done

ENV_FILE="$ROOT/.claude/gate.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "gate: FAIL — $ENV_FILE missing. Copy .claude/gate.env.example and fill TEST_CMD / LINT_CMD."
  exit 1
fi
# shellcheck disable=SC1090
. "$ENV_FILE"

pass=0; fail=0; results=()
run_step() { # name, command (string) — runs in $DIR
  local name="$1" cmd="$2" out rc
  if [ -z "$cmd" ]; then results+=("- $name: skipped (not configured)"); return; fi
  out=$(cd "$DIR" && bash -c "$cmd" 2>&1); rc=$?
  if [ $rc -eq 0 ]; then
    pass=$((pass+1)); results+=("- $name: PASS ($(printf '%s' "$out" | tail -n 1 | cut -c1-120))")
  else
    fail=$((fail+1)); results+=("- $name: FAIL (exit $rc)"); results+=("$(printf '%s' "$out" | tail -n 25 | sed 's/^/    /')")
  fi
}

run_step "validate-docs" "node \"$ROOT/.claude/scripts/validate-docs.js\""
[ $SKIP_TESTS -eq 1 ] || run_step "tests" "${TEST_CMD:-}"
run_step "lint" "${LINT_CMD:-}"
run_step "secrets" "${SECRETS_CMD:-}"

if [ -n "$PLAN" ]; then
  planfile=$(ls "$DIR"/docs/50-plans/"$PLAN"-*.md 2>/dev/null | head -1)
  if [ -z "$planfile" ]; then fail=$((fail+1)); results+=("- plan rows: FAIL ($PLAN not found under $DIR)")
  else
    if [ -n "$PHASE" ]; then pn="${PHASE#P}"; open=$(grep -c "^| AT-${pn}\.[0-9]* |.*☐" "$planfile")
    else open=$(grep -c '☐' "$planfile"); fi
    if [ "${open:-0}" -eq 0 ]; then pass=$((pass+1)); results+=("- plan rows ${PHASE:-all}: PASS (0 open)")
    else fail=$((fail+1)); results+=("- plan rows ${PHASE:-all}: FAIL ($open open task(s))"); fi
    # every TC row linked by the phase must have a Result — cheap heuristic: TC file rows with empty Result
    tcid=$(sed -n 's/^links:.*\(TC-[0-9]\{4\}\).*/\1/p' "$planfile" | head -1)
    tcfile=$(ls "$DIR"/docs/30-test-cases/"$tcid"-*.md 2>/dev/null | head -1)
    if [ -n "$tcfile" ]; then
      empty=$(grep -E '^\| [0-9]+ \|' "$tcfile" | awk -F'|' '{r=$7; gsub(/ /,"",r); if(r=="") n++} END{print n+0}')
      results+=("- TC results: $empty case(s) without a result in $tcid (must be 0 for the cases in scope)")
    fi
  fi
fi

echo "=== mechanical gate ($(date +%F' '%H:%M)) dir=$DIR ${PLAN:+plan=$PLAN} ${PHASE:+phase=$PHASE}"
printf '%s\n' "${results[@]}"
if [ $fail -eq 0 ]; then echo "=== gate: PASS ($pass step(s))"; exit 0
else echo "=== gate: FAIL ($fail failing, $pass passing)"; exit 1; fi
