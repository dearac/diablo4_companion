# Affix Normalization Overhaul (v1.10.0)

This release completely overhauls the gear perfectibility pipeline, migrating from brittle string matching to a canonical normalization and comparison engine. It also adds new live scan recording capabilities.

## Features & Refactors
* `feat(scan): add ScanReplayRunner for offline regression testing`
* `feat(perfectibility): enrich pipeline with match details and confidence scoring`
* `feat(scan): add recording hook to ScanService with IPC toggle`
* `feat(scan): add ScanRecordingStore for live capture and replay testing`
* `refactor(affix): rewire AffixMatcher to use canonical normalization pipeline`
* `feat(affix): add layered comparison engine with confidence scoring`
* `feat(types): add NormalizedAffix, AffixMatchResult, ScanRecording types`
* `feat(affix): add canonical affix registry with alias resolution`
* `feat(affix): add canonical affix alias map (~80 entries)`
