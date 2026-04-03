### Summary

- **Gear Perfectibility Pipeline Completion**: The `PerfectibilityEngine` now enforces item power minimums and fine-grained static stat min-roll limits against OCR-read gear strings. Items that fail threshold checks are natively flagged or rejected as Junk status.
- **Enhanced Overlay UI Components**: Built out inline build thresholds editing inside `GearTab` and upgraded the dual-panel `AffixEditor` inside the overlay renderer, allowing zero-install modification of acceptable comparison baselines natively in the app.
- **Robustness**: Stripped outdated module artifacts, patched test suite integrations, mapped generic JSON arrays correctly across TS declarations, and completed overall system parity for fully headless "Build-Only" tracking.
