# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chrome Extension (Manifest V3) called "Xync Agent Setter". It extracts authentication cookies/headers and user profile data from supported exchanges (currently Bybit `www.bybit.com`, HTX `www.htx.com` and MEXC `www.mexc.com`) and sends them to the Xync backend (`api.xync.net/public/set-agent`) to establish an agent relationship. The popup branches per host; adding an exchange means adding a host branch in `popup.js` and the host to `ALLOWED_HOSTS` in `background.js` plus `host_permissions` in `manifest.json`.

## Development

No build system, bundler, or package manager. The extension runs from raw source files.

**To develop/test:** Load the extension directory as an unpacked extension in `chrome://extensions/` with Developer mode enabled.

## Architecture

Two independent features: agent setup (`background.js`, `popup.*`) and tags on Bybit's P2P pages (`hook.js`, `content.js`, `content.css`, one listener in `background.js`).

- **`background.js`** — Service worker that (1) gates the extension icon to only be enabled on allowed hosts (`www.bybit.com`, `www.htx.com`, `www.mexc.com`) via `chrome.tabs.onUpdated`/`onActivated`, and (2) uses `chrome.webRequest` to capture HTX's signed `user/info` request (method, headers incl. `Vtoken`, body) into `chrome.storage.session` so the popup can replay it.
- **`popup.js`** — Core logic triggered by button click, branched per host. **Bybit:** reads `secure-token`/`deviceId` cookies and POSTs to the Bybit personal-info API. **HTX:** reads the `HB_SSO` cookie and replays the captured `user/info` request (HTX signs requests with headers we can't rebuild, so the OTC page must have been opened once to capture it). **MEXC:** reads the `u_id` cookie (session token) and `x-mxc-fingerprint` cookie (replayed as the `device-id` header), then hits two endpoints — `api/platform/p2p/api/user` (GET) for `realName` + `nickName`, and `ucenter/api/user_info` (POST) for the numeric `uid` (its `digitalId`; the P2P endpoint only exposes a `memberId` hash). A `chash` value is also needed but its carrier is not yet identified — currently forwarded only if present as a cookie. Each branch builds `{host, uid, auth, profile}` and POSTs it to the Xync backend.
- **`popup.html`** — Single-button UI with inline CSS. Fixed 260px width popup.
- **`hook.js`** — Runs in the page's MAIN world at `document_start`, reads the page's own `item/online` responses (XHR and fetch) and posts `[{id, nick}]` to the window. Ad ids must stay strings.
- **`content.js`** — Isolated world. On `/*/p2p/{buy|sell}/USDT/RUB` (checked per listing: the manifest matches all of `/p2p/`, Bybit switches currency without a page load) asks `background.js` for `GET /public/ad-tags` and puts the tags, ready-made by the backend (`cond_tags`), as a sibling after each row. Rows are found by content, not class names: Bybit's are hashed. So a change in Bybit's markup only matters if the nick stops being a separate text node. Rebuilds everything on any DOM change, because the page reuses rows for other ads.

**Data flow:** Button click → get active tab → per-host: read cookies (HTX also replays the captured `user/info` request) → obtain user profile → POST to `api.xync.net` → display expiration date (ru-RU locale).

## Key Details

- Vanilla JavaScript (no TypeScript, no framework); `minimum_chrome_version` 117 (`world: MAIN`, `Object.groupBy`)
- Permissions: `activeTab`, `cookies`, `webRequest`, `storage`; host permissions restricted to `bybit.com`, `htx.com`, and `api.xync.net`
- No tests, no linter, no formatter configured