# World Cup 2026 Probability Tracker (GitHub Pages)

This is a static website (no server) that runs Monte Carlo scoreline simulations in your browser.

## Why you saw only a few possible champions
If the model makes strong teams *too dominant*, many teams will show 0% champion chance in a finite number of simulations.

### Fix in this version
- Default `Scale K` is set higher (6.0) so rating differences are less extreme.
- Expected goals are clamped to a plausible range (0.2 to 4.0).

If you still want more parity, increase `Scale K` (try 7–9) and re-run.

## Deploy
Settings → Pages → Deploy from branch → main → /(root)
