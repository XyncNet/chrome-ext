# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chrome Extension (Manifest V3) called "Xync Agent Setter". It extracts authentication cookies/headers and user profile data from supported exchanges (currently Bybit `www.bybit.com`, HTX `www.htx.com` and MEXC `www.mexc.com`) and sends them to the Xync backend (`api.xync.net/public/set-agent`) to establish an agent relationship. The popup branches per host; adding an exchange means adding a host branch in `popup.js` and the host to `ALLOWED_HOSTS` in `background.js` plus `host_permissions` in `manifest.json`.

## Development

No build system, bundler, or package manager. The extension runs from raw source files.

**To develop/test:** Load the extension directory as an unpacked extension in `chrome://extensions/` with Developer mode enabled.

## Architecture

Three files make up the entire extension:

- **`background.js`** — Service worker that (1) gates the extension icon to only be enabled on allowed hosts (`www.bybit.com`, `www.htx.com`, `www.mexc.com`) via `chrome.tabs.onUpdated`/`onActivated`, and (2) uses `chrome.webRequest` to capture HTX's signed `user/info` request (method, headers incl. `Vtoken`, body) into `chrome.storage.session` so the popup can replay it.
- **`popup.js`** — Core logic triggered by button click, branched per host. **Bybit:** reads `secure-token`/`deviceId` cookies and POSTs to the Bybit personal-info API. **HTX:** reads the `HB_SSO` cookie and replays the captured `user/info` request (HTX signs requests with headers we can't rebuild, so the OTC page must have been opened once to capture it). **MEXC:** reads the `u_id` cookie (session token) and `x-mxc-fingerprint` cookie (replayed as the `device-id` header), then POSTs to `ucenter/api/user_info` for the profile (`digitalId` = uid, `authRealName` = real name). A `chash` value is also needed but its carrier is not yet identified — currently forwarded only if present as a cookie. Each branch builds `{host, uid, auth, profile}` and POSTs it to the Xync backend.
- **`popup.html`** — Single-button UI with inline CSS. Fixed 260px width popup.

**Data flow:** Button click → get active tab → per-host: read cookies (HTX also replays the captured `user/info` request) → obtain user profile → POST to `api.xync.net` → display expiration date (ru-RU locale).

## Key Details

- Vanilla JavaScript (no TypeScript, no framework)
- Permissions: `activeTab`, `cookies`, `webRequest`, `storage`; host permissions restricted to `bybit.com`, `htx.com`, and `api.xync.net`
- No tests, no linter, no formatter configured