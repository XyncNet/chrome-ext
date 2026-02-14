document.getElementById('send').addEventListener('click', async () => {
  const status = document.getElementById('status');
  const btn = document.getElementById('send');

  try {
    btn.disabled = true;
    status.textContent = 'Working...';

    // Get active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Get secure-token cookie for that tab's URL
    const secTok = await chrome.cookies.get({ url: tab.url, name: 'secure-token' });
    const deviceId = await chrome.cookies.get({ url: tab.url, name: 'deviceId' });

    if (!secTok) {
      status.textContent = '⚠ Cookie "secure-token" not found';
      btn.disabled = false;
      return;
    }

    const host = new URL(tab.url).hostname
    let payload = {}
    if (host === 'www.bybit.com') {
      const profile = (await (await fetch("https://www.bybit.com/x-api/fiat/otc/user/personal/info", {
        "method": "POST"
      })).json())['result']
      payload = {
        host: host,
        uid: Number(profile['userId']),
        auth: {cookies: {"secure-token": secTok.value, deviceId: deviceId.value}},
        profile: {rname: profile['realName'], nick: profile['nickName'], email: profile['email'], cc: profile['kycCountryCode']},
      }
    }

    // POST to API
    const res = await fetch('https://api.xync.net/public/set-agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error(`Server responded ${res.status}`);

    const ts = await res.json();
    const date = new Date(ts * 1000).toLocaleString('ru-RU');

    status.textContent = `Your ${host} agent on Xync available until: ${date}`;
  } catch (err) {
    status.textContent = `✗ ${err.message}`;
  } finally {
    btn.disabled = false;
  }
});
