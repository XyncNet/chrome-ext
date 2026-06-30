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
