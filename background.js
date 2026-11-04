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

// Xync API for content.js and the popup: bound by the page's CORS, content.js can't reach
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
    return res.ok ? { data: JSON.parse(text) } : { status: res.status, error: `Xync ${res.status}: ${text}` };
  } catch (e) {
    return { error: `Xync: ${e.message}` };
  }
}

// The popup closes as soon as Telegram takes the focus, so the login waits here, and a click
// on the login again replaces the one that's waiting. `tabId`: the page to reload once in.
const BOT = 'XyncPayBot';
let logins = 0;

async function login(tabId) {
  const me = ++logins;
  const fail = (error) => chrome.tabs.sendMessage(tabId, { error }).catch(() => {}); // tab's gone: nowhere to show
  const start = await api({ path: '/auth/tg-start', body: {} });
  if (start.error) return fail(start.error);
  chrome.tabs.create({ url: `https://t.me/${BOT}?start=login_${start.data.token}` });
  for (;;) {
    await new Promise((r) => setTimeout(r, 2000));
    if (me !== logins) return;
    const { data, error } = await api({ path: `/auth/tg-poll?token=${start.data.token}` });
    if (error) return fail(error);
    if (data.ready !== false) return chrome.tabs.reload(tabId);
  }
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if ('badge' in msg) chrome.action.setBadgeText({ tabId: sender.tab.id, text: msg.badge });
  else if (msg.login) login(msg.login);
  else {
    api(msg).then(reply);
    return true; // the reply is async
  }
});
