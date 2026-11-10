# Global working notes

Background preferences for how work gets done. Hard boundaries live in
`RULES.md`.

## Working style

- Prefer Bun over npm when both are practical.
- Use the harness's native capabilities first. Do not rebuild tooling that this
  agent already provides unless it demonstrably fails a concrete need.
- Fix the shared root cause rather than patching one call site.
- Keep changes inside the requested scope; name anything you deliberately skip.
