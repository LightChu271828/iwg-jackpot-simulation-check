# IWG Jackpot simulation check

A single-page check for an egames jackpot simulation dump. Open `index.html`. Everything runs in the browser. No build step, no server, no upload.

The checks are the same ones as the Java checker: base-game RTP interval, jackpot hit-count interval, awarded and available totals, contribution, seed balance, average prize, and every win at or above its seed. Rounding and the pass rule are unchanged. `Expected JPx Wins` in the report is the trigger target and is not a scored test.

## What you give it

| Input | Meaning |
| --- | --- |
| Simulation dump | The egames `.txt` report, one block per stake. |
| PPS workbook | Optional. Fills the fields from the Summary and Progressive Jackpots sheets. Read them before running. |
| Main game RTP, Std. Dev. | Base-game target and the standard deviation used for its interval. |
| Seed RTP, Contribution RTP | The two parts of the jackpot RTP. |
| Odds down | Shared jackpot odds denominator. |
| Odds up, Seed, Trigger target | One row per jackpot, small to large, in the order the dump lists them. Trigger target is the expected prize. |

A workbook with a before-multiplier block and an after-multiplier block fills the first block and leaves a switch for the other. Sheet order has to match the dump. A game whose dump splits one pool into two halves still needs those halves typed in.

## What it shows

Pass or fail, the test count, each stake, and the failing rows with the value and the bounds. The full checker text can be downloaded.

The page does not read a small-sample rtp-test workbook. Those sheets are a different file.
