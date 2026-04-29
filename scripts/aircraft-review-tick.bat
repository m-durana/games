@echo off
REM Run one watcher tick of the aircraft photo review campaign.
REM Designed to be invoked by Windows Task Scheduler — see
REM docs/aircraft-photo-review-runbook.md for setup instructions.
REM
REM Each invocation is a fresh headless Claude Code session that:
REM   1) reads scripts/aircraft-review-status.mjs
REM   2) merges done-patch entries
REM   3) launches up to N Sonnet sub-agents to fill the worker pool
REM   4) appends one line to tmp/aircraft-review-watcher.log and exits
REM
REM Exit codes:
REM   0  = tick ran (whether or not it launched anything)
REM   non-zero = claude CLI itself failed (auth, network, or hard rate limit)

setlocal
cd /d "%~dp0.."

if not exist "tmp" mkdir tmp

echo. >> tmp\aircraft-review-watcher.log
echo [%DATE% %TIME%] tick start >> tmp\aircraft-review-watcher.log

claude -p "Run one tick of the aircraft photo review watcher. Read prompts/run_aircraft_review_watcher.md and follow it exactly. Working dir is the current directory. Exit fast — do not chitchat, do not ask questions." --dangerously-skip-permissions --output-format text >> tmp\aircraft-review-watcher.log 2>&1

echo [%DATE% %TIME%] tick exit code %ERRORLEVEL% >> tmp\aircraft-review-watcher.log

endlocal
