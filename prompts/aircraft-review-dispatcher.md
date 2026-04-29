# Aircraft review dispatcher (cron tick)

You are the dispatcher for the aircraft photo verification campaign. You run on every cron tick (~30 min). Each tick is a fresh session — there is no memory of previous ticks except what is on disk. **Be fast and quiet. Do the work, log one line, exit.**

**Working dir:** `c:/Users/mirod/Documents/Code/mdurana/Web/games`

## What to do

### 1. Read state (one shell call)

```
node scripts/aircraft-review-status.mjs --verbose
```

Parse the table. Note: ignore any rows where the family name contains `-pilot-` (those were one-off pilot runs, not part of the 87-unit production queue).

### 2. Auto-merge done patches (if any)

If the table shows any rows in state `done-patch`, run:

```
node scripts/merge-aircraft-review-patches.mjs
```

The script is idempotent. After it finishes, re-read the status table.

### 3. Compute the worker pool

**Pool target:** 4 active workers concurrently. (Tunable — higher = faster wallclock but burns Sonnet quota faster. 4 is conservative given we observed Sonnet rate-limit at 3 simultaneous earlier.)

"Active" = a patch whose `verdicts.length > 0` AND mtime within the last 20 min AND `completed: false`.

`needed = 4 - active`.

If `needed <= 0`: log `tick: 4/4 active, no launches` and exit (skip to step 5).

### 4. Launch workers

Pick `needed` work units from the union of `queued` + `stuck` patches (small URL counts first — finish those families faster so the merge log shows visible progress). For each:

1. Look up `tmp/pilot-inputs/<family>[-c<chunk>].json` (pre-written input — `{family, chunk, spec, urls}`). If missing, run `node scripts/aircraft-review-plan.mjs --prewrite` first.
2. Spawn the worker via the helper:

   ```
   node scripts/spawn-worker.mjs <family> [<chunk>]
   ```

   `spawn-worker.mjs` builds the resolved prompt, sanitizes env vars (clears `CLAUDE_*` / `ANTHROPIC_*` so the parent session doesn't leak in), starts a detached `claude -p --model sonnet --dangerously-skip-permissions` process, redirects its output to `tmp/aircraft-review-logs/<tag>.log`, and prints `spawned <tag> pid=<n> log=<path>` before exiting. The detached worker survives this dispatcher session's exit.

3. Run the helper via the **Bash tool**. Don't use `run_in_background: true` — the helper itself returns in <1s; what we want is the *worker* it spawns to outlive us, and `spawn-worker.mjs` already handles that with `detached: true; unref()`.

Don't wait for any of them. Launch and move on.

### 5. Log + exit

Compute totals:
- `verdicts_total` = sum of `verdicts.length` across every patch in `tmp/aircraft-review-patches/` and `processed/`.
- `verdicts_delta` = current total minus the previous tick's total (read from the last `verdicts_total=` line in `tmp/aircraft-review-watcher.log`; treat missing as 0).

Health classification:
- **GREEN** if `verdicts_delta > 0` OR `active > 0` (system is producing).
- **YELLOW** if `verdicts_delta == 0` AND `launched > 0` this tick (just kicked things off, haven't seen fruit yet).
- **RED** if `verdicts_delta == 0` AND `active == 0` AND `(queued + stuck) > 0` (work waiting, nothing happening — likely Sonnet rate-limited).
- **DONE** if `(queued + stuck + active + done-patch) == 0`.

Append exactly one line to `tmp/aircraft-review-watcher.log`:

```
[<ISO>] tick: launched=<X>, active=<Y>, done-patch-merged=<Z>, stuck=<S>, queued=<Q>, verdicts_total=<T>, verdicts_delta=<D>, health=<COLOR>
```

If health is RED two ticks in a row, append a second line: `RED reason: <best guess from stderr in tmp/aircraft-review-logs/ — usually rate-limit>`.

Reply to the user (the cron runner) with **only the tick line above.** Nothing else.

## Notes

- Don't ask clarifying questions. Cron tick is fire-and-forget.
- Don't merge mid-tick. Once at step 2 is enough.
- If you see no work to do (queue + active + done-patch + stuck all 0 and pending 0): log `health=DONE, campaign complete` and recommend the user delete the cron job.
- Workers that hit Sonnet rate-limits exit fast (zero verdicts written, log file shows the error). They'll appear `stuck` next tick and get relaunched. Cheap to retry; don't worry about it.
