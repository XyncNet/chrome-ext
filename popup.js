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

    // Get secure-token cookie for that tab's URL
    const secTok = await chrome.cookies.get({ url: tab.url, name: 'secure-token' });
    const deviceId = await chrome.cookies.get({ url: tab.url, name: 'deviceId' });

    if (!secTok) {
      statusEl.textContent = '⚠ Cookie "secure-token" not found';
      btn.disabled = false;
      return;
    }

    const host = new URL(tab.url).hostname
    const extra = collectAuth();  // key/sec/2fa the admin may have entered
    let payload = {}
    if (host === 'www.bybit.com') {
      const profile = (await (await fetch("https://www.bybit.com/x-api/fiat/otc/user/personal/info", {
        "method": "POST"
      })).json())['result']
      payload = {
        host: host,
        uid: Number(profile['userId']),
        auth: {cookies: {"secure-token": secTok.value, deviceId: deviceId.value}, ...extra},
        profile: {rname: profile['realName'], nick: profile['nickName'], email: profile['email'], cc: profile['kycCountryCode']},
      }
    }

    // POST to API
    const res = await fetch('http://localhost:8000/public/set-agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error(`Server responded ${res.status}`);

    const { exp, need } = await res.json();
    const date = new Date(exp * 1000).toLocaleString('ru-RU');

    if (need && need.length) {
      // agent saved, but still missing API auth — prompt for the missing fields
      renderAuthInputs(need);
      btn.textContent = 'Send Data';
      const labels = need.map((f) => AUTH_LABELS[f] || f).join(', ');
      statusEl.textContent = `Агент ${host} активен до ${date}. Добавьте ${labels} и нажмите снова.`;
    } else {
      // fully provisioned — clear any inputs and show the expiry
      authBox.innerHTML = '';
      btn.textContent = 'Send Token';
      statusEl.textContent = `Your ${host} agent on Xync available until: ${date}`;
    }
  } catch (err) {
    statusEl.textContent = `✗ ${err.message}`;
  } finally {
    btn.disabled = false;
  }
});
