# Global working notes

Background preferences for how work gets done. Hard boundaries live in
`RULES.md`.

## Verification

- Validate web UI and running app behavior in the browser (`browser` prelude).
  Never substitute HTTP APIs, curl, source reading, or unit tests for a browser
  check when the user asked for one.
- If the browser path is blocked, raise it as a blocker. Do not silently switch
  to another method.
- Browser tabs attach to the persistent Chromium at `http://127.0.0.1:9222`
  (profile `~/.omp/chromium-profile`, service `omp-chromium`). If the endpoint
  is down, run `systemctl --user start omp-chromium` and retry.

## Working style

- Prefer Bun over npm when both are practical.
- Use the harness's native capabilities first. Do not rebuild tooling that this
  agent already provides unless it demonstrably fails a concrete need.
- Fix the shared root cause rather than patching one call site.
- Keep changes inside the requested scope; name anything you deliberately skip.
