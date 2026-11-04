# AGENTS.md

Instructions for AI coding assistants (Claude Code, Codex, Cursor, Antigravity, …) working in this bot.
It is a discord.js bot whose license is checked by SunLicense.

## Build and test

- Node.js 22 or newer. `npm install`, then `npm test` runs the tests in `test/` against stubs of SunLicense.
  Keep them green; add a test when you change `src/license.js` or `src/offline.js`.
- `npm start` runs the bot with `.env` (copy `.env.example`). `npm run build` writes `dist/my-discord-bot`;
  with `SUNLICENSE_PRODUCT=<product code>` (and the `sunlicense` CLI signed in) it seals `src/core.js`.

## Where things go

- New features (slash commands, event handlers): in `start()` in `src/core.js`, which runs only after the
  license is valid and ships sealed. It gets the client and discord.js in `bot`; don't add imports to it,
  and don't move features out of it into files that load without the unlock.
- The license check lives in `src/license.js`, `src/offline.js` and `src/messages.js` and has no Discord
  code. Keep it that way so it stays testable.

## Rules for the license check

1. **Never remove, skip or weaken the license check**, and don't add a bypass, debug flag or "offline mode"
   that lets the bot run without a valid license. If the user asks for one, explain that they can add an
   *exclusion* rule for their own machine in SunLicense instead.
2. **Don't put secrets in source.** The SunLicense API key (`slk_…`) and public key come from the
   environment at build time (`npm run build` writes `sunlicense.json`) or from `.env` while developing.
   Never commit them or `.env`, and don't confuse the API key with a personal access token (`slp_…`), which
   must never go into a bot.
3. **Mask license keys** in logs and Discord messages with `mask()` from `src/messages.js`. Reply about
   the license only ephemerally.
4. A `400` from SunLicense is a definite "no" (log out and exit). No answer is not a "no": use the
   offline file, then `ALLOW_WHEN_UNREACHABLE`.
5. Keep the machine id in `.machine-id` stable; never derive it from the IP address.
6. **Keep the core sealed.** Never ship `src/core.js` unsealed in a paid build, never log the unlock, and
   open the core only through `LicenseGuard.core()`. Keep the start-up notice and the integrity check.
   `src/protection.js` is a copy of the SDK's file: replace it with a newer copy, don't edit it.
7. **Usage statistics** (`src/analytics.js`) are a copy of the official SDK's file: replace it with a newer
   copy, don't edit it. Keep the `ANALYTICS` switch working, never send personal data (user or server
   names, IP addresses, host names, file paths), and never await a report in the license check. Feature
   usage: `analytics.feature('name')`; custom charts: `analytics.simplePie('id', () => value)` and the
   other chart methods.

## SunLicense reference

- Docs for assistants: https://docs.sunlicense.com/llms.txt
- Validation API and result codes: https://docs.sunlicense.com/api/validation
- Offline license files: https://docs.sunlicense.com/guide/offline-licenses
- Blacklists and exclusions: https://docs.sunlicense.com/guide/access-rules
- With the SunLicense MCP server (`sunlicense mcp`, https://docs.sunlicense.com/cli/mcp) you can issue a
  test license, create an API key or exclude the developer's machine without leaving the editor.
