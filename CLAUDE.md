# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chrome Extension (Manifest V3) called "Xync Agent Setter". It extracts authentication cookies/headers and user profile data from supported exchanges (currently Bybit `www.bybit.com`, HTX `www.htx.com` and MEXC `www.mexc.com`) and sends them to the Xync backend (`api.xync.net/public/set-agent`) to establish an agent relationship. The popup branches per host; adding an exchange means adding a host branch in `popup.js` and the host to `ALLOWED_HOSTS` in `background.js` plus `host_permissions` in `manifest.json`.

## Development

No build system, bundler, or package manager. The extension runs from raw source files.

**To develop/test:** Load the extension directory as an unpacked extension in `chrome://extensions/` with Developer mode enabled.

## Architecture

Two independent features: agent setup (`background.js`, `popup.*`) and tags + filters on Bybit's P2P pages (`hook.js`, `content.js`, `content.css`, `filter.js` in the popup, the Xync API proxy and login in `background.js`).

- **`background.js`** — Service worker that (1) gates the extension icon to only be enabled on allowed hosts (`www.bybit.com`, `www.htx.com`, `www.mexc.com`) via `chrome.tabs.onUpdated`/`onActivated`, and (2) uses `chrome.webRequest` to capture HTX's signed `user/info` request (method, headers incl. `Vtoken`, body) into `chrome.storage.session` so the popup can replay it.
- **`popup.js`** — Core logic triggered by button click, branched per host. **Bybit:** reads `secure-token`/`deviceId` cookies and POSTs to the Bybit personal-info API. **HTX:** reads the `HB_SSO` cookie and replays the captured `user/info` request (HTX signs requests with headers we can't rebuild, so the OTC page must have been opened once to capture it). **MEXC:** reads the `u_id` cookie (session token) and `x-mxc-fingerprint` cookie (replayed as the `device-id` header), then hits two endpoints — `api/platform/p2p/api/user` (GET) for `realName` + `nickName`, and `ucenter/api/user_info` (POST) for the numeric `uid` (its `digitalId`; the P2P endpoint only exposes a `memberId` hash). A `chash` value is also needed but its carrier is not yet identified — currently forwarded only if present as a cookie. Each branch builds `{host, uid, auth, profile}` and POSTs it to the Xync backend.
- **`popup.html`** — Inline CSS, fixed 300px width: agent setup's button and, on USDT/RUB P2P pages, the filter.
- **`hook.js`** — Runs in the page's MAIN world at `document_start`, reads the page's own `item/online` responses (XHR and fetch) and posts `[{id, nick}]` to the window; `null` off `/*/p2p/{buy|sell}/USDT/RUB` (checked per listing: the manifest matches all of `/p2p/`, Bybit switches currency without a page load). Ad ids must stay strings. With a filter saved in `localStorage.xyncFilter` it swaps the list in the response: fetches the whole book (up to 600, by the page's own headers, in pages of 200: `size` 300 passes, 400 is refused with `912120002 Invalid request parameter`; the page's request waits for the whole book, so it must be quick), gets the passing ids from `content.js`, gives the page its slice with a new `count`. So Bybit renders the result itself: rows, pagination and "Buy" are its own. An XHR can't wait, so its events are withheld and replayed. The filtered book lives 60 s, for page turns and the page's refreshes. If anything fails the page gets its original response.
- **`content.js`** — Isolated world. Asks `POST /ext/ad-tags` and puts the tags, ready-made by the backend (`cond_tags`), as a sibling after each row. Rows are found by content, not class names: Bybit's are hashed. So a change in Bybit's markup only matters if the nick stops being a separate text node. Rebuilds everything on any DOM change, because the page reuses rows for other ads. Keeps the filter set in the popup: a change reloads the page (its list can't be re-requested from outside). Nothing of the extension's floats on the page: the outcome goes on the extension's badge, the number of ads a filter kept (only about 4 characters fit, `kept/all` is in the popup), `…` while it's running, `!` on any error, whose text the popup shows; an error stays till the page reloads. Which ads pass is decided only by the backend: an ad is in the `ad-tags` reply iff it's parsed and fits, so ads without a parse are hidden under a filter.
- **`filter.js`** — The popup's filter: asks `content.js` for the state (`filter`, `error`, `count`; no reply: not a filter page) and `GET /ext/cond-filters` for the options; a value clicks through only → except → off.
- **Login** — The Xync API needs a JWT. A 401 shows `!` and a login button in the popup: `/auth/tg-start` → the bot → polling `/auth/tg-poll`, then reloading the tab. The popup closes as soon as Telegram takes the focus, so the polling lives in `background.js`: its `chrome.storage` call on each poll is what keeps the worker past the 30 s idle limit. `background.js` keeps the token from the `Authorization` response header in `chrome.storage.local` and sends it as is. The JWT lives 15 minutes: the middleware lets an expired one through and renews it, but only in a cookie, so `POST /ext/ad-tags` also returns the current token in that header. One login is enough.

**Data flow:** Button click → get active tab → per-host: read cookies (HTX also replays the captured `user/info` request) → obtain user profile → POST to `api.xync.net` → display expiration date (ru-RU locale).

## Key Details

- Vanilla JavaScript (no TypeScript, no framework); `minimum_chrome_version` 117 (`world: MAIN`, `Object.groupBy`)
- Live `bybit.com` doesn't open from a headless browser, but does from a visible one (`headless=False`), and its listing needs no login: check `hook.js`/`content.js` there with `api.xync.net` mocked. Failure paths are checked on a fixture of the page: in full Chromium with `--load-extension`, `ctx.route` for `bybit.com` and, with `PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1`, for `api.xync.net` called from the worker. The popup is `popup.html` in a tab with `chrome.tabs.query` overridden to return the Bybit tab. A debugger keeps a worker alive, so its lifetime is only seen after detaching
- Permissions: `activeTab`, `cookies`, `webRequest`, `storage`; host permissions restricted to `bybit.com`, `htx.com`, and `api.xync.net`
- No tests, no linter, no formatter configured