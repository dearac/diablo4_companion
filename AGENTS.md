# Agent Rules for diablo4_companion

## Shell / Terminal Rules

This project runs on **Windows with PowerShell**. Bash-style syntax will fail.

### ❌ DO NOT use
- `&&` to chain commands — this is bash syntax and breaks in PowerShell
- Unix commands: `ls`, `rm`, `cp`, `cat`, `grep`, `export`, etc.
- Backtick escaping or `$()` subshells in the bash sense

### ✅ DO use
- `cmd /c <command>` for all shell executions to ensure the process terminates and sends EOF
  - Example: `cmd /c npm list` instead of just `npm list`
- Separate `run_command` calls instead of chaining with `&&`
- PowerShell equivalents: `Get-ChildItem`, `Remove-Item`, `Copy-Item`, etc.
- `npm run <script>` for all project scripts

### ⚠️ Avoid interactive shells
Do not start shells that wait for user input. If a persistent session is needed, use `cmd /k` but ensure the command is self-terminating.

---

## Project Architecture

This is an **Electron + Vite + React** desktop application. The Vite dev server (`localhost:5173`) is consumed internally by the Electron process — it is **not** a standalone web app.

---

## Testing Rules

### ❌ DO NOT use the browser agent to test against `localhost:5173`

Opening `localhost:5173` in a real browser will:
- Render HTML/CSS/React superficially
- **Silently break** any feature that calls `window.electronAPI`
- Produce false positives — UI looks fine but IPC-dependent functionality is untested

Any test results from a plain browser session against this URL are **not trustworthy**.

### ✅ Correct Testing Strategy

| What to test | Command / Tool |
|---|---|
| Unit tests (parsers, services, logic) | `npm run test` (Vitest) |
| Electron UI + IPC (end-to-end) | Playwright launched via `npm run test:e2e` in Electron mode |
| Visual-only layout check (last resort) | Browser agent against `localhost:5173`, with explicit disclaimer that IPC won't work |

### ✅ Never claim "verified" without running actual test commands

Before asserting that something is fixed or working, run `npm run test` and confirm the output. Do not rely on visual inspection of the browser alone as proof of correctness.
