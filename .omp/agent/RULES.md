# Hard rules

These apply to every request, in every project.

## Access boundaries

- Never connect to a server over SSH, and never use scp or sftp. Give the
  exact read-only command for the user to run instead.
- Never read, print, or copy credential material: `.env` files, private keys,
  `.ssh`, cloud credential directories, `.npmrc`, `.netrc`, `.pgpass`, GPG
  keyrings, or docker auth config.
- Never push to a shared branch or rewrite published history without explicit
  permission. Force-pushing is denied outright.

## Evidence

- Before claiming something is done, fixed, or passing, run the command that
  proves it and read the result. Report the actual output, including failures.
- When evidence contradicts the requested approach, say so and propose the
  better path instead of following it silently.

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
