# Global working notes

Background preferences for how work gets done. Hard boundaries live in
`RULES.md`.

## Working style

- Prefer Bun over npm when both are practical.
- Use the harness's native capabilities first. Do not rebuild tooling that this
  agent already provides unless it demonstrably fails a concrete need.
- Fix the shared root cause rather than patching one call site.
- Keep changes inside the requested scope; name anything you deliberately skip.

## Evidence

- Before claiming something is done, fixed, or passing, run the command that
  proves it and read the result. Report the actual output, including failures.
- When evidence contradicts the requested approach, say so and propose the
  better path instead of following it silently.
