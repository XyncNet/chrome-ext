// The panel's part of the Xync filter on Bybit's USDT/RUB P2P pages: content.js of the page keeps
// the filter and the last error, the backend gives the options. Its 401 offers the login. The
// panel outlives pages and tabs, so it follows the active tab: its switches, its loads and the
// page's every change of state, which content.js reports along with the badge.
(() => {
  const BOT = 'XyncPayBot';
  const $ = (id) => document.getElementById(id);
  let tab;
  let draft; // the clicks so far, not applied yet
  let applied; // the page's filter that `draft` started from, as JSON: a new one replaces it
  let options; // the reply with the backend's options, kept once it's a good one
  let logins = 0; // a click on the login replaces the one that's waiting
  let loginNote = ''; // how it's going: over what the page says, it would be lost on the way back

  // Fields that only make sense for some ways of paying: shown under `trans_type`, and only once it's filtered to one
  // of these; hidden, they drop out of the filter.
  const UNDER = { cash_cities: ['cash'], banks: ['sbp', 'card', 'atm_qr'] };

  const stateOf = (field, val) =>
    draft.only[field]?.includes(val) ? 'only' : draft.skip[field]?.includes(val) ? 'skip' : '';

  function cycle(field, val) {
    const was = stateOf(field, val);
    if (was) {
      draft[was][field] = draft[was][field].filter((v) => v !== val);
      if (!draft[was][field].length) delete draft[was][field];
    }
    const next = { '': 'only', only: 'skip', skip: '' }[was];
    if (next) (draft[next][field] ||= []).push(val);
  }

  function draw(data) {
    $('groups').replaceChildren();
    const fields = Object.keys(data).filter((f) => !UNDER[f]);
    fields.splice(fields.indexOf('trans_type') + 1, 0, ...Object.keys(UNDER).filter((f) => f in data));
    for (const field of fields) {
      if (UNDER[field] && !UNDER[field].some((t) => draft.only.trans_type?.includes(t))) {
        delete draft.only[field];
        delete draft.skip[field];
        continue;
      }
      const vals = data[field];
      const group = $('groups').appendChild(document.createElement('div'));
      group.className = 'group';
      group.appendChild(document.createElement('b')).textContent = field;
      for (const val of vals) {
        const chip = group.appendChild(document.createElement('span'));
        chip.textContent = val;
        chip.className = stateOf(field, val);
        chip.onclick = () => {
          cycle(field, val);
          if (field === 'trans_type') draw(data);
          else chip.className = stateOf(field, val);
        };
      }
    }
  }

  async function refresh() {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    // The address is readable only on the hosts the extension has rights to.
    $('off').hidden = !!tab.url;
    $('send').hidden = !tab.url;
    const state = await chrome.tabs.sendMessage(tab.id, {}).catch(() => null); // no content.js here
    $('xync').hidden = !state?.on;
    if (!state?.on) return;

    if (!options) $('note').textContent = state.error || 'Загружаю варианты…';
    const { host } = new URL(tab.url);
    const reply = await (options ||= chrome.runtime.sendMessage({ path: `/ext/cond-filters?host=${host}` }));
    if (reply.error) options = null;
    $('note').textContent = loginNote || state.error || (reply.status === 401 ? '' : reply.error) || '';
    $('login').hidden = reply.status !== 401;
    $('filter').hidden = !!reply.error;
    if (reply.error) return;

    const filter = JSON.stringify(state.filter ?? null);
    if (filter !== applied) {
      applied = filter;
      draft = state.filter ?? { only: {}, skip: {} };
      draw(reply.data);
    }
    $('count').textContent = state.count ? `Подобрано: ${state.count}. ` : '';
  }

  async function login() {
    const me = ++logins;
    const page = tab.id;
    const say = (text) => {
      loginNote = text;
      refresh();
    };
    say('Жду подтверждения в Telegram…');
    const start = await chrome.runtime.sendMessage({ path: '/auth/tg-start', body: {} });
    if (start.error) return say(start.error);
    chrome.tabs.create({ url: `https://t.me/${BOT}?start=login_${start.data.token}` });
    for (;;) {
      await new Promise((r) => setTimeout(r, 2000));
      if (me !== logins) return;
      const { data, error } = await chrome.runtime.sendMessage({ path: `/auth/tg-poll?token=${start.data.token}` });
      if (error) return say(error);
      if (data.ready !== false) {
        loginNote = '';
        return chrome.tabs.reload(page);
      }
    }
  }

  function send(filter) {
    applied = undefined; // the reloaded page's filter replaces the clicks, even if it's the same
    return chrome.tabs.sendMessage(tab.id, { filter });
  }

  $('login').onclick = login;
  $('apply').onclick = () => send(draft);
  $('reset').onclick = () => send({ only: {}, skip: {} });

  chrome.tabs.onActivated.addListener(refresh);
  chrome.tabs.onUpdated.addListener((_id, { status }) => status === 'complete' && refresh());
  chrome.runtime.onMessage.addListener((msg) => {
    if ('badge' in msg) refresh();
  });
  refresh();
})();
