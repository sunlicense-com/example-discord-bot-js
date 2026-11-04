# Discord bot (JavaScript) with SunLicense

A working, copyable [discord.js](https://discord.js.org) bot with [SunLicense](https://sunlicense.com)
built in: everyone who runs your bot needs a valid license key, leaked keys can be revoked or blocked,
and your customers' bots keep running if SunLicense is ever unreachable.

- discord.js 14 and the official [JavaScript SDK](https://github.com/sunlicense-com/sunlicense-js), Node.js 22+
- License key from **.env**; your API key baked into the build buyers get, never into git
- Clear console messages for every result (expired, revoked, too many machines, blacklisted, …), keys masked
- Re-checked every few hours, so a revoke reaches running bots (the bot logs out)
- **Offline fallback** with a signed license file (Ed25519, verified without network)
- **Core unlock**: your features (`src/core.js`) ship sealed and only run after a valid check; a copy with the check cut out can't open them. Modified copies are reported to Sentinel, and the log shows who owns the bot
- Tests against a stub server (`node --test`), CI on GitHub Actions, and [AGENTS.md](AGENTS.md) for AI coding assistants

## 1. Set up SunLicense

In the [dashboard](https://app.sunlicense.com):

1. **Products → New product** (your bot), then a **policy**, e.g. "Standard", *1 machine*: a machine is
   wherever the bot runs.
2. **API keys → Create API key**. It can only validate licenses, so it's safe to ship with the bot.
3. Optional, for the offline fallback: open any license and copy **Public key**.

## 2. Make it yours

1. Use this template (or copy the folder): `npm install`, then rename `my-discord-bot` in `package.json`
   and `scripts/build.js`.
2. Create a bot at [discord.com/developers](https://discord.com/developers/applications), copy
   `.env.example` to `.env` and fill in `DISCORD_TOKEN` and a test `LICENSE_KEY`. While developing, also
   put `SUNLICENSE_API_KEY=slk_...` (and `SUNLICENSE_PUBLIC_KEY`, or `SUNLICENSE_URL=http://localhost` for a
   local stack) in `.env`. `.env` is git-ignored.
3. Run it: `npm start`. Invite the bot to a test server and try `/license`.

Your features go in `start()` in `src/core.js`, which runs only once the license is valid (it gets the
discord.js client and module in `bot`, and can't import packages itself: it ships sealed). Put your
product name and your name in `OWNERSHIP` in `src/settings.js`: the start-up notice shows them.

## 3. Sell it

```bash
SUNLICENSE_API_KEY=slk_... SUNLICENSE_PUBLIC_KEY=MCowBQYDK2VwAyEA... SUNLICENSE_PRODUCT=my-bot npm run build
```

`dist/my-discord-bot/` is what buyers get: the code, `package-lock.json` and `sunlicense.json` with your
settings. With `SUNLICENSE_PRODUCT` (your product's code) and the [CLI](https://docs.sunlicense.com/cli/)
signed in (or `SUNLICENSE_TOKEN` in CI), `src/core.js` is sealed into `src/core.sealed` by `sunlicense seal`
and left out: the key that opens it comes only with a valid license check (or the offline file). The
digests of the other files in `src/` and of `package.json` go inside it, so a patched copy is reported. Zip it and upload it to your store. Buyers run `npm ci --omit=dev`, fill in `.env` and `npm start`.

Sell on [BuiltByBit](https://docs.sunlicense.com/integrations/builtbybit), [Tebex](https://docs.sunlicense.com/integrations/tebex),
[Gumroad](https://docs.sunlicense.com/integrations/gumroad), [Stripe](https://docs.sunlicense.com/integrations/stripe)
or [your Discord server](https://docs.sunlicense.com/guide/discord): the buyer gets a key by email, on the
redeem page or from the SunLicense Discord bot, and puts it in `.env`.

## What happens when the bot starts

| SunLicense answers | The bot |
|---|---|
| Valid | Opens the sealed core, logs in to Discord; logs the masked key |
| Expired, revoked, suspended, unknown key, too many machines, blacklisted | Logs why (see `src/messages.js`), logs out and exits with code 1 |
| Nothing (outage, network, rate limit) | Uses `license.lic` next to the bot if it's a valid offline license for this key; otherwise keeps running and retries every 10 minutes (`ALLOW_WHEN_UNREACHABLE = false` to wait instead). The sealed core opens with the unlock from a valid check in the last 7 days (kept next to the bot, bound to this machine); on a machine that never had one, it starts once SunLicense answers |

**Protection and its limit.** At start-up the log shows `My Discord Bot is licensed software by You.
License AX8P-XXXX-XXXX-XXXX.` (never the full key or the buyer's name). A copy whose files differ from
the ones you sealed sends `integrity: MODIFIED` with its next check; Sentinel suggests suspending that
license (never revokes on its own). Someone with a valid license can still extract the unlock and patch
their copy: protection raises the cost and makes leaks visible, it doesn't make code uncrackable
([protection](https://docs.sunlicense.com/guide/protection)).

Each machine keeps a random id in `.machine-id`, which is what counts against the policy's machine limit.

Developing against your own license? Add an **exclusion** for your machine or IP in SunLicense
([blacklists and exclusions](https://docs.sunlicense.com/guide/access-rules)) so test runs don't use up slots.

**Usage statistics.** Every 30 minutes, in the background, the bot tells SunLicense its version, the
Node.js and discord.js version, OS, architecture and CPU cores, so you see who runs what on the product's
**Analytics** tab (with the license and machine, like bStats). No user names, IP addresses or server
names. Buyers switch it off with `ANALYTICS=false` in `.env` or `SUNLICENSE_ANALYTICS=off`; it never
affects the license check. Count your own features with `analytics.feature('name')` and add charts with
`analytics.simplePie(…)` and friends. What is sent:
[docs](https://docs.sunlicense.com/guide/sdks#built-in-analytics).

## Files

```
src/index.js       start-up, notice, re-checks, Discord login
src/core.js        your features (sealed into src/core.sealed in the build you sell)
src/license.js     online check → offline file → status; opens the sealed core (no Discord code, tested)
src/offline.js     Ed25519 offline license file check
src/messages.js    what the bot's owner reads; masking
src/settings.js    SunLicense settings (sunlicense.json or env), the machine id, the analytics switch
src/analytics.js   anonymous usage statistics (a copy of the SDK's; replace, don't edit)
src/protection.js  core unlock, integrity, notice (a copy of the SDK's; replace, don't edit)
scripts/build.js   the folder you sell, with your settings baked in
test/              every result against a stub SunLicense
.github/workflows/build.yml   CI
```

## Licence

[MIT No Attribution](LICENSE): copy any of it into your bot, commercial or not, without credit.
