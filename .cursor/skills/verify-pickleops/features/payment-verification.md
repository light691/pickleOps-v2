# Payment verification

Payment verification lets staff work a queue of submitted payments, compare expected against submitted amounts with references, verify or reject with a note, while attendants stay read-only on verdicts.

## Sub-features

- `payments-queue` lists submissions awaiting review with method, amounts, reference, and payer.
- `payments-verify` records a Verified verdict with verifier and timestamp.
- `payments-reject` records a Rejected verdict with a staff note.
- `payments-roles` blocks attendant verdicts with 403 while managers succeed.

## How to get to it (user POV)

- Choose `Payments` in the side nav.
- Choose a queue row for the receipt detail.
- Filter the queue by status.

## Driving it with drive.mjs

Preconditions:

- Instance healthy at `http://localhost:5174`.
- One submission sits `In review` (create one through the manual form or an Open Play paid flag).
- `doctor.mjs` reports the expected URL and git revision.

- **Open the queue.** Go to the view. Run `--do "goto|?view=Payments"`. Rows show payer, method, and amount.
- **Review.** Choose a row. Run `--do "click|button|<payer>"` using the exact name from a prior `aria` snapshot. The receipt detail shows expected versus submitted, reference, and payer.
- **Verify.** Choose verify with a note as Mia Villanueva. The row leaves the review queue and the history names the verifier.
- **Reject path.** Submit a second payment and reject it with a note asking for a clearer receipt. History records the rejection.
- **Role gate.** Sign in as Paolo Garcia and attempt a verdict. The server answers 403 and the UI shows a generic error. The buttons do not check roles client-side, so an enabled button with a refused request is the correct observable behavior, not a bug.
- **Proof.** Run `--do "shot|payments.png" --do "aria|payments.aria.txt"`. The artifacts show the decided rows and their history.

## Gotchas

- Auto-submitted Open Play payments carry no method or reference. They render as unrecorded, which is correct, not a bug.
- Verified is terminal. A second verdict on the same row must fail.
- Assert the history names the verifier, not just the pill color.
