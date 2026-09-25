# IWG Jackpot simulation check

A single-page check for an egames jackpot simulation result. Open `index.html`. Everything runs in the browser. No build step, no server, no upload.

The checks are the same ones as the Java checker: base-game RTP interval, jackpot hit-count interval, awarded and available totals, contribution, seed balance, average prize, and every win at or above its seed. Rounding and the pass rule are unchanged. `Expected JPx Wins` in the report is the trigger target and is not a scored test.

## What you give it

| Input | Meaning |
| --- | --- |
| Simulation result | The egames `.txt` report, one block per stake, or an rtp-test workbook with one sheet per stake. |
| PPS workbook | The settings. Main game RTP, standard deviation, seed RTP, contribution RTP, odds, and trigger targets are read from Summary and Progressive Jackpots. |

The settings fields are filled from the workbook and are not edited on the page. RTP settings show three decimal places. A workbook with a before-multiplier block and an after-multiplier block uses the first block and leaves a switch for the other. Sheet order has to match the simulation result. Reset, at the top right, clears both files and the result. Download report is under the checker text. The file name is the PPS name with the parenthetical and the `_PPS_...` suffix removed, then `_SimCheck.txt`. `260805_OLG_TicketToTerrorTurboJP(MainGame)_PPS_090_003.xlsx` downloads as `260805_OLG_TicketToTerrorTurboJP_SimCheck.txt`.

## What it shows

Pass or fail, the test count, each stake, and the failing rows with the value and the bounds. The full checker text can be downloaded.

An rtp-test workbook is read as a small sample. The page pools every stake and compares base RTP, jackpot RTP and hit counts with the PPS. Expected hits are tickets times stake times odds up, divided by odds down. One stake can sit far from the jackpot target when those expected hits are under 1. The pooled line is the comparison.
