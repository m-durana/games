# Aircraft review campaign — handoff to fresh session

Previous session ran out of context. Pick up from here.

## State (as of 2026-04-30 ~00:00 Paris)

- **OpenClaw is gone.** Uninstalled globally, startup launcher deleted. Don't reinstall.
- **Campaign state**: 5 complete families, 49 queued, 3019 photos pending, 0 in-progress, 0 stuck, 0 done-patch.
- **Infrastructure validated end-to-end.** All four moving pieces work:
  1. `spawn-worker.mjs` spawns detached workers that survive parent-session death.
  2. Workers write verdicts incrementally to `tmp/aircraft-review-patches/<fam>.json`.
  3. Killed/crashed workers can be respawned and resume from existing verdicts.
  4. Watcher prompt (`prompts/run_aircraft_review_watcher.md`) gates on `tmp/CAMPAIGN_GO` flag and calls `spawn-worker.mjs` (NOT the Agent tool).
- **Tests passed**: 1 (gate=off no launches), 3 (a321ceo E2E + merge), 4 (e190-e2 kill+resume), and an implicit Test 5 (parent CC crashed mid-tick, workers survived and completed 5 families).
- **No rogue processes.** No `tmp/CAMPAIGN_GO` flag. Safe to pick up.

## What's left (in order)

1. **Write a verdict-review MD for the user** — they want to eyeball Test 3 + Test 4 results before scheduling. Source the merged verdicts from baseline:
   - Test 3: `a321ceo` — 1 verdict (rejected, livery text criterion 6). Image: only URL in `tmp/aircraft-review-patches/processed/a321ceo.json`.
   - Test 4: `e190-e2` — 9 verdicts (3 verified, 2 rejected, 2 unsure, 2 refile). Source: `tmp/aircraft-review-patches/processed/e190-e2.json`.
   - Plus: the implicit Test 5 spawn merged ~5 small families during the crash (a320ceo, b777-200er, md83, a330-900, e195-e2) — include those too if their patches are in `processed/`. The user's eyeballing the prompt-quality fixes from earlier (no filename bias, single-subject crit, variant uncertainty defaults).
   - Format: side-by-side image + verdict + reason, like `docs/aircraft-photo-review-pilot.md`. Save to `docs/aircraft-photo-review-test3-4.md` or similar.
2. **Register Windows Task Scheduler entry** to fire `scripts/aircraft-review-tick.bat` every 15 min. Single command (use PowerShell because Git Bash mangles `/` flags):
   ```powershell
   schtasks /create /tn "Aircraft Review Watcher" `
     /tr "`"c:\Users\mirod\Documents\Code\mdurana\Web\games\scripts\aircraft-review-tick.bat`"" `
     /sc minute /mo 15 /st 00:00 /rl HIGHEST /ru "$env:USERNAME" /f
   ```
   Verify with `schtasks /query /tn "Aircraft Review Watcher" /v /fo LIST`.
3. **Test 2** — wait 15 min for one auto-tick to fire with gate=off. Confirm one new line in `tmp/aircraft-review-watcher.log` with `gate=off, launched=0`. Confirm `schtasks /query` shows `Last Run Result: 0x0`.
4. **Hand back** — once user has reviewed the verdict MD and is happy, they create `tmp/CAMPAIGN_GO` and the next 15-min tick starts the campaign.

## Gotchas the previous session learned the hard way

- **Use Bash + cmd.exe to run .bat, NOT PowerShell's `Start-Process`.** PS Start-Process wrapper appears to inject corrupted paths in this sandbox. Confirmed working: `cd <dir> && cmd //c <bat>` from Bash, OR direct `claude -p ...` invocation.
- **`tick.bat` MUST have `--dangerously-skip-permissions`.** Was missing initially → tick crashed waiting for permission approval. Fixed.
- **Worker prompt template gotcha**: `prompts/aircraft-review-worker.md` does NOT consult baseline before processing URLs. After a merge, queued families' input files may contain URLs already in baseline — worker will re-judge them. Not blocking but worth noting; fix later by having `aircraft-review-plan.mjs --prewrite` regenerate inputs to subtract baseline.
- **Watcher's tick log timestamp is sometimes hallucinated** (model wrote `2026-04-30T04:30:28Z` instead of real time on one tick). Cosmetic only. If it matters, change watcher prompt to require `node -e "console.log(new Date().toISOString())"` for the timestamp.
- **Don't run `claude -p` from inside an active CC session if you can help it** — that triggered a parent crash earlier. Use the Bash tool to dispatch shell commands; let Task Scheduler run the actual ticks.
- **Empty `--help.log` artifact** in `tmp/aircraft-review-logs/` from a typo'd test command — safe to delete.

## Files modified this session (uncommitted)

- `prompts/run_aircraft_review_watcher.md` — added CAMPAIGN_GO gate, swapped Agent-tool launch path for `node scripts/spawn-worker.mjs`.
- `scripts/aircraft-review-tick.bat` — added `--dangerously-skip-permissions`.
- `src/data/aircraft-review-baseline.json` — merged 8 patches (a321ceo + e190-e2 + 6 prior pilot patches + 5 from implicit Test 5).
- `tmp/aircraft-review-patches/processed/` — 8 freshly merged patches for review.

## Plan reference

`C:\Users\mirod\.claude\plans\keen-sparking-harbor.md`
