// API-auth fields an agent needs on top of the web-session cookies. The backend
// (POST /public/set-agent) reports which are still missing in its `need` reply;
// we render an input per missing field and merge what the admin types into the
// `auth` of the next request.
const AUTH_FIELDS = ['key', 'sec', '2fa'];
const AUTH_LABELS = { key: 'API key', sec: 'API secret', '2fa': '2FA secret' };

const statusEl = document.getElementById('status');
const authBox = document.getElementById('auth');
const btn = document.getElementById('send');

// values the admin typed into the rendered auth inputs (non-empty only)
function collectAuth() {
  const extra = {};
  for (const f of AUTH_FIELDS) {
    const inp = document.getElementById('auth-' + f);
    if (inp && inp.value.trim()) extra[f] = inp.value.trim();
  }
  return extra;
}

// render an input for each missing field, preserving anything already typed
function renderAuthInputs(need) {
  const typed = collectAuth();
  authBox.innerHTML = '';
  for (const f of need) {
    const inp = document.createElement('input');
    inp.id = 'auth-' + f;
    inp.type = f === 'key' ? 'text' : 'password';
    inp.placeholder = AUTH_LABELS[f] || f;
    if (typed[f]) inp.value = typed[f];
    authBox.appendChild(inp);
  }
}

btn.addEventListener('click', async () => {
  try {
    btn.disabled = true;
    statusEl.textContent = 'Working...';

    // Get active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    const host = new URL(tab.url).hostname
    const extra = collectAuth();  // key/sec/2fa the admin may have entered
    let payload = {}
    if (host === 'www.bybit.com') {
      // Bybit: web session lives in the secure-token + deviceId cookies
      const secTok = await chrome.cookies.get({ url: tab.url, name: 'secure-token' });
      const deviceId = await chrome.cookies.get({ url: tab.url, name: 'deviceId' });
      if (!secTok) {
        statusEl.textContent = '⚠ Cookie "secure-token" not found';
        btn.disabled = false;
        return;
      }
      const profile = (await (await fetch("https://www.bybit.com/x-api/fiat/otc/user/personal/info", {
        "method": "POST"
      })).json())['result']
      payload = {
        host: host,
        uid: Number(profile['userId']),
        auth: {cookies: {"secure-token": secTok.value, deviceId: deviceId.value}, ...extra},
        profile: {rname: profile['realName'], nick: profile['nickName'], email: profile['email'], cc: profile['kycCountryCode']},
      }
    } else if (host === 'www.htx.com') {
      // HTX: session lives in the HB_SSO cookie, and OTC calls carry several
      // signed headers the page generates. Rather than rebuild them we replay the
      // page's own user/info request, captured by background.js — so the OTC page
      // must have been opened at least once this session.
      const hbSso = await chrome.cookies.get({ url: tab.url, name: 'HB_SSO' });
      const { htxMethod, htxHeaders, htxBody } =
        await chrome.storage.session.get(['htxMethod', 'htxHeaders', 'htxBody']);
      if (!hbSso) {
        statusEl.textContent = '⚠ Cookie "HB_SSO" not found';
        btn.disabled = false;
        return;
      }
      if (!htxHeaders) {
        statusEl.textContent = '⚠ Запрос не перехвачен — откройте страницу OTC на HTX и нажмите снова';
        btn.disabled = false;
        return;
      }
      // headers the browser controls itself can't be forwarded via fetch — drop them
      const FORBIDDEN = /^(accept-encoding|accept-charset|access-control|connection|content-length|cookie|date|dnt|expect|host|keep-alive|origin|permissions-policy|proxy-|sec-|referer|te|trailer|transfer-encoding|upgrade|via|user-agent)/i;
      const headers = {};
      for (const [k, v] of Object.entries(htxHeaders)) {
        if (!k.startsWith(':') && !FORBIDDEN.test(k)) headers[k] = v;
      }
      const method = htxMethod || 'GET';
      const res = await fetch("https://www.htx.com/-/x/otc/v1/user/info", {
        method,
        credentials: "include",
        headers,
        body: method === 'GET' || method === 'HEAD' ? undefined : htxBody,
      });
      const json = await res.json();
      console.log('HTX user/info response:', json);
      const data = json['data'];
      if (!data) throw new Error(`HTX user/info: ${json['message'] || json['msg'] || 'code ' + json['code']}`);
      const vtoken = Object.entries(htxHeaders).find(([k]) => k.toLowerCase() === 'vtoken')?.[1];
      payload = {
        host: host,
        uid: Number(data['uid']),
        auth: {cookies: {"HB_SSO": hbSso.value}, headers: {"Vtoken": vtoken}, ...extra},
        profile: {rname: data['realName'], nick: data['userName']},
      }
    } else {
      statusEl.textContent = `⚠ Unsupported host: ${host}`;
      btn.disabled = false;
      return;
    }

    // POST to API
    const res = await fetch('https://api.xync.net/public/set-agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error(`Server responded ${res.status}`);

    const { exp, need } = await res.json();
    const date = exp ? new Date(exp * 1000).toLocaleString('ru-RU') : null;

    if (need && need.length) {
      // agent saved, but still missing API auth — prompt for the missing fields
      renderAuthInputs(need);
      btn.textContent = 'Send Data';
      const labels = need.map((f) => AUTH_LABELS[f] || f).join(', ');
      const head = date ? `Агент ${host} активен до ${date}.` : `Агент ${host} сохранён.`;
      statusEl.textContent = `${head} Добавьте ${labels} и нажмите снова.`;
    } else {
      // fully provisioned — clear any inputs and show the expiry
      authBox.innerHTML = '';
      btn.textContent = 'Send Token';
      statusEl.textContent = date
        ? `Your ${host} agent on Xync available until: ${date}`
        : `Your ${host} agent on Xync is set.`;
    }
  } catch (err) {
    statusEl.textContent = `✗ ${err.message}`;
  } finally {
    btn.disabled = false;
  }
});
