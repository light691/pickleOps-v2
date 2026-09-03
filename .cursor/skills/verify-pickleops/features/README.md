# PickleOps verification map

This directory is the maintained source for verifying the user-facing behavior of PickleOps. Read the index before driving the app, then use the matching feature file as the recipe.

## Baseline preconditions

- Launch a disposable instance on port 5174 with `PORT=5174 npm run dev` from the repo root.
- Back up `pickleops.db` before launch and restore it after teardown. Never run two drives at once.
- Seed staff are Mia Villanueva (Manager) and Paolo Garcia (Attendant), PIN `1234`, venue `venue-qc-01`.
- Run `doctor.mjs` and require the 200 root, the 401 guard check, and the printed git revision.
- Never drive an instance that was not started by this verification run.

## Driving conventions

- Start every recipe from the baseline state unless its preconditions say otherwise.
- Prefer ARIA roles and accessible names over CSS selectors or DOM position.
- Treat every command as literal. Keep quoted names and step order unchanged.
- Run browser actions through `helpers/drive.mjs` in one invocation per flow.
- Restore seeded data after a mutation. Do not remove proof artifacts during cleanup.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen.
- UI proof includes an ARIA snapshot and a screenshot with the app identity visible.
- Mutation proof includes a read-only second view of the stored row (another view rendering it, or a `GET` on the API).
- Record the feature ID and entry point used with every artifact.
- Report an unreachable path with the attempted command and the unmet precondition.
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with drive.mjs` starts with `Preconditions:` and uses labeled bullets that pair each user action with an exact command and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

Keep implementation details out of the map. Name only user paths, stable handles, required state, commands, and observable proof.

## Features

- [Court booking](./court-booking.md) covers the Today walk-in flow, clash rejection, and persistence.
- [Calendar](./calendar.md) covers the day grid, reschedule, transfer, and cancel.
- [Open Play](./open-play.md) covers sessions, roster, waitlist, promotion, and paid flags.
- [Payment verification](./payment-verification.md) covers the queue, verify, reject, and role gates.
