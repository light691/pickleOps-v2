---
name: verify-pickleops
description: Drive the PickleOps pickleball venue app (web UI at localhost) the way staff would, and capture proof. Reach for it whenever behavior must be proven on the running app instead of argued from code.
---

# Verify PickleOps

PickleOps is a staff operations app. One Node process serves the Vite React client and the Hono JSON API from `D:\Web Projects\pickleOps-v2`. State lives in a single `pickleops.db` SQLite file. Seed staff are Mia Villanueva (Manager) and Paolo Garcia (Attendant), PIN `1234`, org `org-rallypoint`, venue `venue-qc-01`.

## Launch

Start a disposable instance on port 5174. Never drive the developer's port 5173 session.

```powershell
Copy-Item pickleops.db $env:TEMP\pk-verify-backup.db -ErrorAction SilentlyContinue
$env:PORT = 5174; npm run dev 2>&1 | Select-Object -First 6
```

Ready means the log prints `PickleOps dev server on http://localhost:5174` and `GET /` answers 200. Keep the job id. Teardown is `job_kill` on exactly that job, nothing by process name.

## Doctor

```powershell
node .cursor/skills/verify-pickleops/helpers/doctor.mjs --base http://localhost:5174
```

It requires `/` to answer 200 with RallyPoint in the title, `/api/today` without a cookie to answer 401 (auth guards live), and prints the git revision under test. Non-zero exit means stop and fix the instance.

## Drive

```powershell
node .cursor/skills/verify-pickleops/helpers/drive.mjs --base http://localhost:5174 --out artifacts/<feature> --do "goto|?view=Today" --do "fill|Staff name|Mia Villanueva" --do "fill|Staff PIN|1234" --do "click|button|Sign in" --do "shot|board.png" --do "aria|board.aria.txt"
```

One invocation is one browser lifetime. Steps run in order and the first failure aborts with the step printed. Supported steps: `goto|path`, `fill|label|value`, `select|label|option`, `click|role|name`, `shot|file`, `aria|file`, `expect|text`, `wait|ms`. Labels and names match by substring because wrapping labels absorb their option text (a select labelled Duration reads as Duration plus its options). On ambiguous matches Playwright fails loudly instead of guessing. Real selectors from this repo: `Staff name`, `Staff PIN`, `Sign in`, court card action buttons (`Add walk-in`), drawer fields `Customer name`, `Mobile number`, `Date`, `Start time`, `Duration`, `Court`, `Players`, `Notes`, submit `Confirm booking`, clash banner `role=alert`, nav items `Today`, `Calendar`, `Open Play`, `Payments`, `Reports`, `Settings`, calendar controls `Previous day`, `Calendar date`, `Next day`, report control `Report period`, settings control `Settings sections`.

## Evidence

Proof lives under `artifacts/<feature>/` (gitignored, survives cleanup). Every proof has the action plus the resulting state: a screenshot with the app identity visible, an ARIA snapshot, and a read-back through a second path (another view rendering the created row, or a `GET` on the API). A save status alone is not proof. Reopen or re-list the record.

## Cleanup

Kill only the job this run started. Stop the server first, then restore the database, then confirm the proof still exists.

```powershell
Copy-Item $env:TEMP\pk-verify-backup.db pickleops.db -Force
Get-ChildItem artifacts/<feature>
```

A cleanup that eats the proof fails the run. Never touch `pickleops.db` while the server is up.

## Helpers

- `helpers/doctor.mjs` is executable and takes `--base`. Shown above.
- `helpers/drive.mjs` is executable and takes `--base`, `--out`, and repeatable `--do` steps. Shown above.
- Both exit non-zero with a message on the first failed check.

## Isolation

Two instances cannot share `pickleops.db`. Never drive an instance this run did not start. Never run two drives at once.
