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

// The icon opens the side panel: unlike a popup it stays when the focus leaves for Telegram or a
// page, so what's being done in it needs no help from this worker.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

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
// method, headers and body — and let the panel replay it verbatim.
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

// What Bybit's P2P listing, cut down by content.css, has no use for: not to load it at all.
// Chrome can't match the page's address, so the rules go by tab, and only on requests of Bybit:
// in the same tab on another site they would break its Google login. The rest of Bybit keeps
// its support and popups. Never here: Akamai (/akam and the long random path), finger_device.js,
// t1.js, turingfraud, compliance and anti-phishing are what login and orders rely on; data-core
// and the A/B results too: the page calls the former directly, the latter picks its variant.
const LISTING = /^https:\/\/www\.bybit\.com\/[^/]+\/p2p\/(buy|sell)\//;
const CUT = [
  // trackers
  '||googletagmanager.com^',
  '||analytics.tiktok.com^',
  '||tiktokw.us^',
  '||appsflyersdk.com^',
  '||onelink.me^',
  '||sc-datasink.',
  '||monitor-frontend-collector.',
  '/x-api/data/trace/report',
  // support
  '/static/by-globals/globals.ada.',
  '/static/fe-lib-user-security/ada.',
  '/common-static/cht-static/custom-service-svc/',
  // popups and the Notice dialog: the activity list is what brings it and the banners
  '/x-api/fiat/otc/configuration/activity/list',
  '/x-api/v3/private/popup/config/list',
  '/static/by-globals/globals.campaign.',
  '/static/fe-lib-user-security/campaign.',
  '/static/by-globals/globals.globalPopup.',
  '/static/fe-lib-ujtools/',
  '||pup-resource.',
  // Google's login prompt and web push
  '||accounts.google.com/gsi/',
  '/static/by-globals/globals.googleOneTap.',
  '/static/fe-lib-login/googleOneTap.',
  '/static/by-globals/globals.webPush.',
  // the blocks content.css hides: footer, "Recommended", FAQ, coupon banner
  '/static/by-globals/globals.navFooter.',
  '/static/fe-lib-footer/',
  '/x-api/fiat/otc/item/recommend/online',
  '/x-api/fiat/public/channel/faq-list',
  '/x-api/fiat/otc/user/unlogin/deduction',
];

async function cut(tabId, on) {
  const rules = await chrome.declarativeNetRequest.getSessionRules();
  const tabs = new Set(rules[0]?.condition.tabIds);
  tabs[on ? 'add' : 'delete'](tabId);
  const condition = { tabIds: [...tabs], initiatorDomains: ['www.bybit.com'] };
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: rules.map((r) => r.id),
    addRules: tabs.size
      ? CUT.map((urlFilter, i) => ({ id: i + 1, action: { type: 'block' }, condition: { ...condition, urlFilter } }))
      : [],
  });
}

// Every full page load of Bybit: moves within the listing's app don't need the rules changed.
chrome.webRequest.onBeforeRequest.addListener(({ tabId, url }) => void cut(tabId, LISTING.test(url)), {
  urls: ['https://www.bybit.com/*'],
  types: ['main_frame'],
});

// Xync API for content.js and the panel: bound by the page's CORS, content.js can't reach
// api.xync.net itself, this worker can (host_permissions). The login's token comes in the
// `Authorization` response header and is kept here for good: the backend renews an expired
// one by itself.
async function api({ path, body }) {
  const { token } = await chrome.storage.local.get('token');
  const headers = { ...(token && { Authorization: token }), ...(body && { 'content-type': 'application/json' }) };
  try {
    const init = { method: body ? 'POST' : 'GET', headers, body: body && JSON.stringify(body) };
    const res = await fetch(`https://api.xync.net${path}`, init);
    const auth = res.headers.get('authorization');
    if (auth) await chrome.storage.local.set({ token: auth });
    const text = await res.text();
    return res.ok ? { data: text && JSON.parse(text) } : { status: res.status, error: `Xync ${res.status}: ${text}` };
  } catch (e) {
    return { error: `Xync: ${e.message}` };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if ('badge' in msg) chrome.action.setBadgeText({ tabId: sender.tab.id, text: msg.badge });
  else {
    api(msg).then(reply);
    return true; // the reply is async
  }
});
