# Aircraft review watcher tick

You are the watcher for the aircraft photo verification campaign. Each tick runs in a fresh Claude Code session; act fast and exit. **Working directory is the repo root.** Do not chitchat — do the work and write a one-line summary.

## What to do this tick

### 1. Read state

Run `node scripts/aircraft-review-status.mjs --verbose`. Parse the table. Count work units in each state.

### 2. Auto-merge done patches

If any patches show state `done-patch`, run `node scripts/merge-aircraft-review-patches.mjs`. The script is idempotent.

### 3. Decide whether to launch

**Campaign go gate:** If `tmp/CAMPAIGN_GO` does NOT exist, do not launch any workers this tick — even if there's queued work. Skip to step 5 and log a tick line with `launched=0` and a `gate=off` marker. This lets us register the scheduled task and confirm ticks fire without burning Sonnet quota until the user is ready.

The pool target is **5 workers in active progress**. (Tune later — higher = faster wallclock but burns daily Sonnet quota sooner; lower = more steady. 5–10 is a sane range.) "Active progress" = patches whose state is `in-progress` (i.e. has at least one verdict) AND whose `mtime` is within the last 20 minutes. Anything older than 20 min with no progress is treated as `stuck` and is eligible for relaunch.

- If `progressing >= 5`: do nothing. Append `[<ISO time>] tick: 5/5 active, no launches` to `tmp/aircraft-review-watcher.log` and exit.
- Else launch `5 - progressing` new workers from the union of `queued` + `stuck` work units, smallest URL count first. Stuck workers get a fresh launch with the same patch path so they resume where they left off.

### 4. Launch each worker

Workers MUST be spawned as detached OS processes so they survive this tick session's exit. Use the existing `scripts/spawn-worker.mjs` — do **not** use the Agent tool / sub-agents (those die when this `claude -p` session ends ~30s later, which is the bug that wasted half a day earlier).

For each work unit you decide to launch, run via the Bash tool:

```bash
node scripts/spawn-worker.mjs <family> [<chunk>]
```

(omit `<chunk>` when chunk is 0). The script:
- reads `tmp/pilot-inputs/<family>[-c<chunk>].json` (the URL list + spec; pre-written by `scripts/aircraft-review-plan.mjs --prewrite` — if missing, run that first)
- builds the worker prompt from `prompts/aircraft-review-worker.md`
- spawns `claude -p --model sonnet --dangerously-skip-permissions <prompt>` detached, with `CLAUDE*` and `ANTHROPIC_*` env vars scrubbed
- prints `spawned <tag> pid=<pid> log=<path>` to stdout — capture this for the tick line

The worker writes verdicts incrementally to `tmp/aircraft-review-patches/<tag>.json` per the contract in `prompts/aircraft-review-worker.md`. Stuck workers get relaunched the same way; the patch file already has any prior verdicts and the worker contract says to skip URLs already verdicted.

### 5. Log + exit

Compute `verdicts_total` = sum of `verdicts.length` across every patch in `tmp/aircraft-review-patches/` and `tmp/aircraft-review-patches/processed/`. Read the previous `verdicts_total` from the **last** line of `tmp/aircraft-review-watcher.log` that contains `verdicts_total=`. If no prior line, treat prior as 0.

`verdicts_delta` = current `verdicts_total` − prior. This is "verdicts produced since last tick".

Health classification (set `health=...` in the log):
- **GREEN** if `verdicts_delta > 0` OR `progressing > 0`. System is making progress.
- **YELLOW** if `verdicts_delta == 0` AND `launched > 0` this tick (gave it work but no fruit yet — could be early, could be rate-limited).
- **RED** if `verdicts_delta == 0` AND `progressing == 0` AND queue (`queued + stuck`) > 0. Two consecutive RED ticks ≈ rate-limit hit; user/orchestrator should pause and check.
- **DONE** if queue + in-progress + queued + stuck all == 0.

Append one line:

```
[<ISO>] tick: launched=<X>, progressing=<Y>, done=<Z>, stuck=<S>, queued=<Q>, verdicts_total=<T>, verdicts_delta=<D>, health=<COLOR>
```

If `health=RED`, also append a second line: the most likely cause (e.g. `RED reason: launched 3 agents last tick, all 0-verdict — suspect Sonnet rate limit`).

Reply to the user with the tick line. Done.

## Notes

- Don't ask clarifying questions; the loop fires every 15 min and silence wastes the tick.
- If you see no work to do (`progressing` + `queued` + `stuck` = 0 and `pending` = 0), report "campaign complete" and recommend the user `/loop stop`.
- Don't merge between launches — one merge per tick at step 2 is enough.
- Sonnet rate limit is daily-ish; if you launch 5 agents and they all immediately come back rate-limited, the next tick will see them all stuck. The watcher will keep trying every 15 min — wasted work is small (each failed launch is < 100 tokens). Acceptable.
