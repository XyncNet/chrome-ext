// On Bybit's USDT/RUB P2P pages: under each ad whose condition Xync has parsed, shows the
// parse as compact tags, and in a floating widget filters the listing by that parse.
// Ads come from hook.js, which also applies the filter to the page; the backend is reached
// through background.js (the page's CORS binds content scripts) and needs a Xync login.
(() => {
  const BOX = 'xync-tags';
  const NO_LIMITS = 'разобрано: без ограничений';
  const FILTER = 'xyncFilter'; // localStorage, hook.js reads it at request time
  const BOT = 'XyncPayBot';

  let ads = []; // current listing in page order: [{id, nick, tags}]
  let listing = 0; // latest listing's number: an older one's late reply must not win
  let timer = 0;

  const api = (path, body) => chrome.runtime.sendMessage({ path, body });
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  const el = (tag, className = '', textContent = '') =>
    Object.assign(document.createElement(tag), { className, textContent });

  // Bybit's class names are hashed and change, so rows are found by content: a listing's
  // nicks sit in the DOM in text nodes, and the row is what holds them inside the list.
  // → [[row, ad]]. A maker with several ads: same order in the listing and on the page.
  function placed() {
    const nicks = new Set(ads.map((a) => a.nick));
    const hits = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) if (nicks.has(norm(walker.currentNode.nodeValue))) hits.push(walker.currentNode);
    if (!hits.length) return [];

    // The list is the deepest ancestor of most hits: a nick elsewhere on the page can't shift it.
    const counts = new Map();
    for (const hit of hits)
      for (let n = hit.parentElement; n; n = n.parentElement) counts.set(n, (counts.get(n) || 0) + 1);
    let list = hits[hits.length >> 1].parentElement;
    while (list && (counts.get(list) < 2 || counts.get(list) * 2 <= hits.length)) list = list.parentElement;

    const rowOf = (hit) => {
      if (!list) return hit.parentElement.closest('tr') ?? hit.parentElement; // the only row: nothing to compare with
      let node = hit;
      while (node.parentElement !== list) node = node.parentElement;
      return node;
    };

    const queue = Object.groupBy(ads, (a) => a.nick);
    const rows = new Set();
    const res = [];
    for (const hit of hits) {
      if (list && !list.contains(hit)) continue;
      const row = rowOf(hit);
      if (rows.has(row)) continue; // a nick shown twice in one row
      rows.add(row);
      const ad = queue[norm(hit.nodeValue)]?.shift();
      if (ad) res.push([row, ad]);
    }
    return res;
  }

  // A sibling of the row, not its child: full width whatever the row's own layout is.
  function box(row, tags) {
    const isTr = row.tagName === 'TR';
    const res = el(isTr ? 'tr' : 'div', BOX);
    const wrap = isTr ? res.appendChild(el('td')) : res;
    if (isTr) wrap.colSpan = row.cells.length;
    for (const tag of tags.length ? tags : [NO_LIMITS]) wrap.appendChild(el('span', '', tag));
    return res;
  }

  // The page re-renders rows on its own, reusing them for other ads: the only safe state is
  // "rebuilt from scratch". Rows are reused without a new listing too, hence the observer.
  const observer = new MutationObserver(() => {
    timer ||= setTimeout(render, 100);
  });

  function render() {
    timer = 0;
    observer.disconnect(); // our own writes must not wake it
    for (const old of document.querySelectorAll(`.${BOX}`)) old.remove();
    if (!ads.length) return;
    for (const [row, ad] of placed()) if (ad.tags) row.after(box(row, ad.tags));
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  // The filter widget. A filter change reloads the page: its list can't be re-requested from
  // outside, and hook.js applies the saved filter to whatever the page requests next.
  const saved = (() => {
    try {
      return JSON.parse(localStorage.getItem(FILTER));
    } catch {
      return null;
    }
  })();
  const draft = saved ?? { only: {}, skip: {} };
  const picked = saved ? [...Object.values(saved.only), ...Object.values(saved.skip)].flat().length : 0;

  const root = el('div', 'xync-filter');
  const panel = root.appendChild(el('div', 'xync-panel'));
  panel.hidden = true;
  const hint = 'Клик: только → кроме → выкл. С фильтром видны лишь разобранные объявы.';
  panel.appendChild(el('div', 'xync-hint', hint));
  const groups = panel.appendChild(el('div'));
  const note = panel.appendChild(el('div', 'xync-note'));
  const actions = panel.appendChild(el('div', 'xync-actions'));
  const apply = actions.appendChild(el('button', '', 'Применить'));
  const reset = actions.appendChild(el('button', '', 'Сбросить'));
  const toggle = root.appendChild(el('button', '', picked ? `Xync-фильтр: ${picked}` : 'Xync-фильтр'));

  let options = null;
  let loggedOut = false;

  const stateOf = (field, val) =>
    draft.only[field]?.includes(val) ? 'only' : draft.skip[field]?.includes(val) ? 'skip' : '';

  function cycle(field, val) {
    const state = stateOf(field, val);
    if (state) {
      draft[state][field] = draft[state][field].filter((v) => v !== val);
      if (!draft[state][field].length) delete draft[state][field];
    }
    const next = { '': 'only', only: 'skip', skip: '' }[state];
    if (next) (draft[next][field] ||= []).push(val);
  }

  async function openPanel() {
    panel.hidden = false;
    if (options) return;
    note.textContent = 'Загружаю варианты…';
    const { data, error, status } = await api(`/ext/cond-filters?host=${location.host}`);
    if (status === 401) return toLogin();
    note.textContent = error ?? '';
    if (error) return;
    options = data;
    for (const [field, vals] of Object.entries(options)) {
      const group = groups.appendChild(el('div', 'xync-group'));
      group.appendChild(el('b', '', field));
      for (const val of vals) {
        const chip = group.appendChild(el('span', stateOf(field, val), val));
        chip.onclick = () => {
          cycle(field, val);
          chip.className = stateOf(field, val);
        };
      }
    }
  }

  function toLogin() {
    loggedOut = true;
    panel.hidden = true;
    toggle.textContent = 'Xync: войти через Telegram';
  }

  async function login() {
    toggle.disabled = true;
    toggle.textContent = 'Подтвердите вход в Telegram…';
    const start = await api('/auth/tg-start', {});
    if (start.error) return failLogin(start.error);
    window.open(`https://t.me/${BOT}?start=login_${start.data.token}`, '_blank');
    for (;;) {
      await new Promise((r) => setTimeout(r, 2000));
      const { data, error } = await api(`/auth/tg-poll?token=${start.data.token}`);
      if (error) return failLogin(error);
      if (data.ready !== false) return location.reload(); // background.js has kept the token
    }
  }

  function failLogin(error) {
    toggle.disabled = false;
    toggle.textContent = `Вход не удался, ещё раз. ${error}`;
  }

  async function report(error) {
    toggle.disabled = false;
    toggle.textContent = 'Xync-фильтр: не применён';
    await openPanel();
    note.textContent = error;
  }

  toggle.onclick = () => {
    if (loggedOut) return login();
    if (panel.hidden) openPanel();
    else panel.hidden = true;
  };
  apply.onclick = () => {
    const empty = !Object.keys(draft.only).length && !Object.keys(draft.skip).length;
    if (empty) localStorage.removeItem(FILTER);
    else localStorage.setItem(FILTER, JSON.stringify(draft));
    location.reload();
  };
  reset.onclick = () => {
    localStorage.removeItem(FILTER);
    location.reload();
  };

  async function listed(list) {
    const me = ++listing;
    root.hidden = !list;
    if (list && !root.isConnected) document.body.appendChild(root);
    const ids = list?.map((a) => a.id) ?? [];
    const { data = {}, error, status } = ids.length ? await api('/ext/ad-tags', { host: location.host, ids }) : {};
    if (me !== listing) return;
    if (status === 401) toLogin();
    const tags = (a) => (status === 401 ? undefined : error ? [error] : data[a.id]);
    ads = (list ?? []).map((a) => ({ id: a.id, nick: norm(a.nick), tags: tags(a) }));
    render();
  }

  async function filter({ xyncBook, ids }) {
    if (!root.isConnected) document.body.appendChild(root);
    toggle.disabled = true;
    toggle.textContent = 'Xync-фильтр: подбираю…';
    const { data, error, status } = await api('/ext/ad-tags', { host: location.host, ids, ...saved });
    window.postMessage({ xyncKept: xyncBook, ids: data ? Object.keys(data) : null }, location.origin);
    toggle.disabled = false;
    if (status === 401) return toLogin();
    if (error) return report(error);
    toggle.textContent = `Xync-фильтр: ${Object.keys(data).length} из ${ids.length}`;
  }

  window.addEventListener('message', ({ source, data }) => {
    if (source !== window || !data) return;
    if (data.xyncAds !== undefined) listed(data.xyncAds);
    if (data.xyncBook) filter(data);
    if (data.xyncFail && !loggedOut) report(data.xyncFail);
  });
})();
