# Chrome Web Store submission kit — Xync Agent Setter

Copy/paste material for the Developer Dashboard. Fill the `<...>` placeholders.

> **Reality check.** The hard part of approval here is not packaging — it is that
> this extension reads exchange session cookies/tokens and profile data and sends
> them to a remote server (`api.xync.net`), and uses `webRequest` to read a signed
> header from HTX traffic. Reviewers scrutinise exactly this. Approval depends on a
> truthful privacy policy, accurate data disclosures, and the justifications below.
> Make sure the listing makes the consensual, first-party "connect your own account"
> purpose obvious, and that the privacy policy URL is live before you submit.

## Listing basics

- **Name:** Xync Agent Setter
- **Summary (≤132 chars):** For Xync partners: grant the Xync bot temporary control over your own Bybit or HTX exchange account.
- **Category:** Productivity (or Workflow & Planning)
- **Language:** English (add Russian translation if desired)
- **Privacy policy URL:** `https://xync.net/PRIVACY.md` (REQUIRED — live)
- **Support email / website:** support@xync.net / https://xync.net

## Detailed description (listing body)

Xync Agent Setter is for Xync partners who want to grant the Xync trading bot
temporary, authorized control of an exchange account they own (Bybit or HTX), so
the bot can operate (trade OTC/P2P) on their behalf for a limited time.

How it works:
1. Sign in to your Bybit or HTX account as usual.
2. Click the extension button.
3. The extension reads the session data needed to authenticate you, fetches your
   profile from the exchange, and sends it once to the Xync backend over HTTPS.
4. If Xync needs API credentials (API key / secret / 2FA), it prompts you to enter
   them and submit again.

The extension only runs when you click it, only works on Bybit and HTX, and sends
data solely to api.xync.net to set up your agent. It collects no browsing history
and does nothing in the background on other sites. See the privacy policy for full
details.

## Single purpose

Single, narrow purpose: let a Xync partner authorize the Xync bot to temporarily
operate the partner's own Bybit or HTX account, by collecting — on explicit click —
that account's session/profile data (and optional API credentials) and submitting it
to the Xync backend to establish a time-limited agent relationship.

## Permission justifications (paste into the dashboard)

- **activeTab** — On click, read the active tab's URL to determine which supported
  exchange the user is on and scope the request accordingly.
- **cookies** — Read the user's own exchange session cookies (`secure-token`,
  `deviceId` on Bybit; `HB_SSO` on HTX) required to authenticate them to Xync.
- **webRequest** — Read-only observation of the user's own HTX requests to capture
  the per-session `Vtoken` signing header that HTX adds to its OTC profile call,
  which the extension cannot reproduce. No requests are blocked or modified.
- **storage** — Hold the captured HTX request (method/headers/body) in
  `chrome.storage.session` (in-memory) between page load and the user's click.
- **Host permissions** (`www.bybit.com`, `www.htx.com`, `api.xync.net`) — Read
  cookies/profile from the two supported exchanges and POST the result to the Xync
  backend. No broad `<all_urls>` access is requested.

## Remote code

No. The extension contains all its own logic; it loads and executes no remotely
hosted code. Network requests carry data only.

## Data use disclosures (Privacy practices tab)

Data collected:
- **Authentication information** — session cookies/tokens and (when entered) API
  credentials. **Yes.**
- **Personally identifiable information** — user ID, real name, nickname, email,
  KYC country code returned by the exchange. **Yes.**
- Location, health, financial/payment, personal communications, web history,
  user activity, website content — **No.**

Certifications (all true for this extension — check all three):
- I do not sell or transfer user data to third parties outside of approved use cases.
- I do not use or transfer user data for purposes unrelated to the item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending.

## Pre-submission checklist

- [x] Privacy policy hosted at https://xync.net/PRIVACY.md — enter it in the dashboard.
- [ ] HTX flow verified end-to-end (the `user/info` replay actually returns profile data).
- [ ] Confirm `support@xync.net` is monitored, or replace it everywhere.
- [ ] 1280×800 (or 640×400) screenshots prepared; 128×128 store icon uploaded.
- [ ] Upload `xync-agent-setter-1.1.0.zip` (built without dev files).
- [ ] Justification text above pasted into each permission field.
