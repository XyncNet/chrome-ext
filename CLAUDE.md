# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chrome Extension (Manifest V3) called "Xync Agent Setter". It extracts authentication cookies and user profile data from Bybit (`www.bybit.com`) and sends them to the Xync backend (`api.xync.net/public/set-agent`) to establish an agent relationship.

## Development

No build system, bundler, or package manager. The extension runs from raw source files.

**To develop/test:** Load the extension directory as an unpacked extension in `chrome://extensions/` with Developer mode enabled.

## Architecture

Three files make up the entire extension:

- **`background.js`** — Service worker that gates the extension icon to only be enabled on allowed hosts (`www.bybit.com`). Listens to `chrome.tabs.onUpdated` and `chrome.tabs.onActivated`.
- **`popup.js`** — Core logic triggered by button click: extracts `secure-token` and `deviceId` cookies from the active tab, fetches user profile from the Bybit API, then POSTs the combined payload to the Xync backend.
- **`popup.html`** — Single-button UI with inline CSS. Fixed 260px width popup.

**Data flow:** Button click → get active tab → read cookies → fetch Bybit user profile → POST to `api.xync.net` → display expiration date (ru-RU locale).

## Key Details

- Vanilla JavaScript (no TypeScript, no framework)
- Permissions: `activeTab`, `cookies`; host permissions restricted to `bybit.com` and `api.xync.net`
- No tests, no linter, no formatter configured