const ALLOWED_HOSTS = ['www.bybit.com', 'www.htx.com', 'www.mexc.com'];

function updateIcon(tabId, url) {
  try {
    const host = new URL(url).hostname;
    if (ALLOWED_HOSTS.includes(host)) {
      chrome.action.enable(tabId);
    } else {
      chrome.action.disable(tabId);
    }
  } catch {
    chrome.action.disable(tabId);
  }
}

// Disable by default for all tabs
chrome.action.disable();

// When a tab is updated (navigated)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === 'complete') {
    updateIcon(tabId, tab.url || '');
  }
});

// When the user switches tabs
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId);
  updateIcon(tab.id, tab.url || '');
});

// HTX signs its OTC API calls with several per-session headers (Vtoken, AppId,
// sign, nonce, ...) that the page's own JS generates and we can't reproduce. So
// instead of rebuilding the request we capture the page's real user/info call —
// method, headers and body — and let the popup replay it verbatim.
const HTX_USERINFO = 'https://www.htx.com/-/x/otc/v1/user/info';

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    const raw = details.requestBody?.raw?.[0]?.bytes;
    const body = raw ? new TextDecoder().decode(new Uint8Array(raw)) : null;
    chrome.storage.session.set({ htxBody: body });
  },
  { urls: [HTX_USERINFO + '*'] },
  ['requestBody']
);

chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    const headers = {};
    for (const h of details.requestHeaders || []) headers[h.name] = h.value;
    chrome.storage.session.set({ htxMethod: details.method, htxHeaders: headers });
  },
  { urls: [HTX_USERINFO + '*'] },
  ['requestHeaders', 'extraHeaders']
);

// Parsed conditions of the ads on an exchange page, for content.js: bound by the page's
// CORS, it can't reach api.xync.net itself, this worker can (host_permissions).
chrome.runtime.onMessage.addListener(({ host, ids }, _sender, reply) => {
  const query = new URLSearchParams({ host });
  for (const id of ids) query.append('ids', id);
  fetch(`https://api.xync.net/public/ad-tags?${query}`)
    .then(async (r) => (r.ok ? { tags: await r.json() } : { error: `Xync ${r.status}: ${await r.text()}` }))
    .catch((e) => ({ error: `Xync: ${e.message}` }))
    .then(reply);
  return true; // the reply is async
});
