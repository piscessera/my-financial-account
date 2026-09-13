#!/usr/bin/env node
// PreToolUse guard — enforces dev-standard §7 / §11 with code instead of prose.
//
// Blocks:
//   1. any Write/Edit/MultiEdit (or a write-ish Bash command) targeting a SHARED file
//      (docs/INDEX.md, docs/90-daily-logs/, CLAUDE.md, .claude/) when the call comes from a
//      sub-agent, or when the target lives inside a .worktrees/ checkout;
//   2. the qa-reviewer role writing anything except its own REV report in docs/60-reviews/.
//
// Fail-open: any parse error → exit 0 (allow). Output: {"decision":"block","reason":...} exit 0.

const SHARED = [/(^|\/)docs\/INDEX\.md$/i, /(^|\/)docs\/90-daily-logs\//i, /(^|\/)CLAUDE\.md$/i, /(^|\/)\.claude\//i];
const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const BASH_WRITE = /(>>?|\btee\b|\bsed\s+-i|\bmv\b|\bcp\b|\brm\b|\btruncate\b)/;

function block(reason) {
  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
  process.exit(0);
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(raw || '{}');
    const tool = input.tool_name || '';
    const ti = input.tool_input || {};
    const agent = input.agent_type || input.agent_name || input.subagent_type || '';
    const isSubagent = Boolean(agent || input.agent_id || input.parent_session_id);
    const norm = (p) => String(p || '').replace(/\\/g, '/');

    // collect candidate target paths
    let targets = [];
    if (WRITE_TOOLS.has(tool)) {
      targets = [norm(ti.file_path || ti.notebook_path)];
    } else if (tool === 'Bash') {
      const cmd = String(ti.command || '');
      if (!BASH_WRITE.test(cmd)) return process.exit(0);
      // any shared-path mention in a write-ish command counts
      targets = (cmd.match(/[^\s"'|;&]+/g) || []).map(norm);
    } else {
      return process.exit(0);
    }

    const inWorktree = targets.some((t) => /(^|\/)\.worktrees\//.test(t));
    const touchesShared = targets.some((t) => SHARED.some((re) => re.test(t)));

    // rule 2 — qa-reviewer is read-only except its REV report
    if (/qa-reviewer/i.test(agent)) {
      const allowed = targets.every((t) => /(^|\/)docs\/60-reviews\//.test(t));
      if (WRITE_TOOLS.has(tool) && !allowed) {
        return block(`qa-reviewer is read-only (dev-review): may write only docs/60-reviews/REV-*.md, not ${targets.join(', ')}. Report the finding instead of fixing it.`);
      }
      if (tool === 'Bash' && targets.length && !allowed) {
        return block('qa-reviewer is read-only: Bash may run tests, lint and git read commands only — no file writes.');
      }
    }

    // rule 1 — shared files
    if (touchesShared && (isSubagent || inWorktree)) {
      return block(
        `Shared file (${targets.filter((t) => SHARED.some((re) => re.test(t))).join(', ')}) may be changed only by the orchestrator on main (dev-standard §7/§11). ` +
        (isSubagent ? 'You are a sub-agent: return the INDEX row / log line in your report instead.' : 'This path is inside a worktree: feature branches never edit shared files.')
      );
    }
    process.exit(0);
  } catch {
    process.exit(0); // fail open
  }
});
