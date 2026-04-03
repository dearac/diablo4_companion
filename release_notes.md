# Diablo IV Companion v1.13.3

## What's Changed

* **Scanner Accuracy Improvements**
  * Fixed OCR failures caused by live stat comparisons (`-21.2%`, `Toughness)`).
  * Safely ignore base gear stats (like implicit `Armor` and `Damage per Second`) to prevent them from displacing actual item affixes.
  * Explicitly mapped aliases for minor OCR text corruption (`Life On Hit` vs `Life per Hit`, `Lifeonki11` -> `Life on Kill`, etc.).
  * Successfully merged correctly formatted "Chest Armor" parsing rules.
  * **(Dev)** Added a Settings feature to toggle Debug Scan Recording, which streams raw OCR logs and live screenshots for analyzing pipeline faults.

* **UI & Stability**
  * Cleaned up React warnings and ESLint hits in `SettingsTab` overlay modules.

**Full Commit Log:**

* `fix(aliases)`: add OCR missing combinations for hit and kill life
* `fix`: ignore stat comparison tooltips and split chest string
* `feat`: add debug scan recording toggle
* `feat(scanner)`: optimize affix matching for implicit stats and passives
* `fix(renderer)`: resolve ESLint issues in SettingsTab
