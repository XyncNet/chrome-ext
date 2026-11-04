# Privacy Policy — Xync Agent Setter

_Last updated: 2026-11-04_

Xync Agent Setter ("the Extension") is for Xync partners who want to grant the
Xync bot temporary, authorized control of their own cryptocurrency exchange account
(currently Bybit and HTX), so the bot can operate it on their behalf for a limited
time. This policy explains what data the Extension handles and why.

## What the Extension does

The Extension sets up your agent only when you click its toolbar button while
signed in to a supported exchange. On that click it reads the data needed to
authenticate you to Xync and submits it to the Xync backend. Beyond that click it
detects which exchange tab is active, on HTX captures the signed profile request
that your own browser makes (see Permissions below), and on Bybit's USDT/RUB P2P
pages shows Xync's parsed ad conditions under the ads and filters the ads by them,
for users signed in to Xync (see below).

## Data we process

When you click the button, for the exchange you are signed in to, the Extension
reads and transmits:

- **Session authentication data** — Bybit: the `secure-token` and `deviceId`
  cookies. HTX: the `HB_SSO` cookie and the per-session `Vtoken` request header
  that HTX uses to sign its OTC API calls.
- **Profile data returned by the exchange** — your user ID and, depending on the
  exchange, your real name, nickname, email address and KYC country code.
- **API credentials you choose to enter** — if Xync reports it still needs them,
  the Extension shows fields for your API key, API secret and 2FA secret. These
  are included only when you type them in.

On Bybit's USDT/RUB P2P pages, without any click, the Extension reads the ad list
the page itself loads and sends the IDs of the listed ads — public data of other
users' ads, nothing about your exchange account — to `https://api.xync.net/ext/ad-tags`,
and displays the reply on the page. With a filter on, it loads the full ad list with
your Bybit session the way the page does, sends those IDs and the filter you chose to
the same address, and shows the matching ads in the page's own list.

This needs you to sign in to Xync via Telegram from the Extension's popup. The Extension then keeps
your Xync login token on your device and sends it with these requests. The filter you
chose is kept on your device too.

## How the data is used

The authentication and profile data above is sent in a single HTTPS request to
`https://api.xync.net/public/set-agent` for the sole purpose of establishing and
maintaining your agent relationship on Xync. Ad IDs and the filter are sent only to
get the parsed conditions of those ads. The Extension uses the data for no other
purpose.

## What we do NOT do

- We do not sell or rent your data to anyone.
- We do not use or transfer your data for advertising, profiling, creditworthiness
  or lending.
- We do not transfer your data to any third party other than the Xync backend you
  are connecting to.
- We do not collect browsing history. The Extension is inert on every site other
  than the supported exchanges.

## Storage and retention

The Extension keeps the captured HTX request data only in `chrome.storage.session`,
which lives in memory and is cleared when the browser closes. It keeps your Xync login
token in `chrome.storage.local` and your filter in the Bybit page's local storage,
until you remove the Extension or clear them. The Extension stores nothing else on
your device and keeps no logs of its own. Data received by the Xync
backend is handled under the Xync platform's own terms and privacy policy.

## Permissions and why we need them

- **Host access to the exchanges / `activeTab`** — to read the active tab and the
  cookies needed to authenticate you, and on Bybit's P2P pages to read the listed
  ads and show their parsed conditions.
- **`cookies`** — to read the session cookies listed above.
- **`webRequest`** — read-only, to capture the `Vtoken` signing header from HTX's
  own request to its profile API. The Extension never blocks or modifies any request.
- **`storage`** — to hold the captured HTX request in memory between page load and
  your click, and your Xync login token.

## Contact

Questions about this policy: **support@xync.net**

## Changes

We may update this policy; material changes are reflected by the "Last updated"
date above.
