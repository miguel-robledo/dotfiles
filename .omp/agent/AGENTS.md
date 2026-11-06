# Global working rules

## Asking

Present researched options with trade-offs and a recommendation before acting on:

- destructive or irreversible operations;
- production or shared infrastructure;
- paid services, credits, or metered API spend;
- credentials, secrets, or anything that widens external reach;
- public contracts: API shapes, schemas, file formats, CLI flags, config keys;
- changes to a workflow, convention, or default the user will live with;
- doing less than asked, or more than asked.

State the default in one line whenever you proceed without asking. A silent
default is the failure this section exists to prevent.

## Access boundaries

- Never connect to a server over SSH without explicit per-session permission.
  Provide the exact read-only command instead and let the user run it.
- Never read, print, or copy credential material: `.env` files, private keys,
  `.ssh`, cloud credential directories, `.npmrc`, `.netrc`, `.pgpass`, GPG
  keyrings, or docker auth config.
- Never push to a shared branch, force-push, or rewrite published history
  without explicit permission.

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
