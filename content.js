// On Bybit's USDT/RUB P2P pages: under each ad shows what Xync knows of its condition, each
// parsed field in a place of its own, with a button to get what's missing, and keeps the filter
// set in the panel (filter.js).
// Ads come from hook.js, which also applies the filter to the page; the backend is reached
// through background.js (the page's CORS binds content scripts) and needs a Xync login.
// The outcome goes on the extension's badge: how many the filter kept, "!" on an error, whose
// text the panel shows. An error stays till the page reloads.
(() => {
  const BOX = 'xync-tags';
  const FILTER = 'xyncFilter'; // localStorage, hook.js reads it at request time
  const NO_LOGIN = 'Нужен вход в Xync';
  const FRESH = 300; // s: a parse this young isn't offered again
  const STATUS = 'status';
  // The ad's parse under the ad, in Bybit's columns, by the question each answers: who's the
  // maker | is the price what it seems | what sum | how to pay | what's asked of the buyer. A
  // field's place is its slot here, taken even with nothing in it, so it's the same in every ad.
  const COLUMNS = [
    ['is_intermediary', 'intermed_forbid', 'contact', 'mtl_like'],
    ['abuser', STATUS],
    ['scale', 'ppo', 'fix_amounts'],
    ['banks', 'cash_cities', 'from_party', 'to_party', 'trans_type'],
    ['slip', 'lk', 'cred', 'slavic'],
  ];
  const saved = JSON.parse(localStorage.getItem(FILTER));

  let ads = []; // current listing in page order: [{id, nick, known, tags, at, busy, err}]
  let latest = null; // the same as hook.js gave it
  let listing = 0; // latest listing's number: an older one's late reply must not win
  let timer = 0;
  let on = false; // a USDT/RUB P2P page: Bybit changes the currency without a page load
  let count = ''; // what the filter kept
  let error = '';

  // Only about 4 characters fit on the badge: "14/500" would read "4/50", the panel has it all.
  const badge = () => chrome.runtime.sendMessage({ badge: !on ? '' : error ? '!' : count.split('/')[0] });
  function report(text) {
    error = text;
    badge();
  }
  async function api(path, body) {
    // Chrome ends a worker that's been waiting for 5 minutes: then there's no reply at all.
    const res = await chrome.runtime.sendMessage({ path, body }).catch((e) => ({ error: `Xync: ${e.message}` }));
    if (res.error) report(res.status === 401 ? NO_LOGIN : res.error);
    return res;
  }
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
    while (walker.nextNode()) {
      const hit = walker.currentNode;
      // A nick in a block content.css hides isn't a row: its ad would take the row's tags.
      if (nicks.has(norm(hit.nodeValue)) && hit.parentElement.checkVisibility()) hits.push(hit);
    }
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

  function ago(sec) {
    const min = Math.floor(sec / 60);
    if (min < 60) return min ? `${min} мин назад` : 'только что';
    return min < 1440 ? `${Math.floor(min / 60)} ч назад` : `${Math.floor(min / 1440)} дн назад`;
  }

  // Asks for the ad's parse or for the ad itself, then asks about the whole listing again: a
  // parse is its condition's, other ads of the page may share it. What it's doing lives in the
  // ad, not in the button: the page may rebuild the rows any moment.
  async function act(ad, path) {
    ad.busy = true;
    ad.err = '';
    render();
    const { error } = await api(path, { host: location.host, id: ad.id });
    ad.busy = false;
    ad.err = error;
    if (error) return render();
    report('');
    listed(latest);
  }

  // Where the ad's parse stands, and the way forward: unknown ad → load, not parsed → parse,
  // parsed long ago → parse again. No condition at all: nothing to do.
  function status(ad) {
    const res = el('div', STATUS);
    const age = Date.now() / 1000 - ad.at;
    if (ad.at) res.appendChild(el('time', '', ago(age))).title = `Разобрано ${new Date(ad.at * 1000).toLocaleString()}`;
    else if (ad.known && ad.tags) res.append('нет условия');
    const action = !ad.known
      ? ['🔄', '/ext/ad-load']
      : ad.tags === null
        ? ['Parse', '/ext/ad-parse']
        : ad.at && age > FRESH && ['ReParse', '/ext/ad-parse'];
    if (action) {
      const button = res.appendChild(el('button', '', ad.busy ? '…' : action[0]));
      button.disabled = ad.busy;
      button.onclick = () => act(ad, action[1]);
    }
    if (ad.err) res.appendChild(el('b', '', ad.err)).title = ad.err;
    return res;
  }

  // A sibling of the row, not its child: the page owns the row and re-renders it at will.
  function box(row, ad) {
    const isTr = row.tagName === 'TR';
    const res = el(isTr ? 'tr' : 'div', BOX);
    for (const fields of COLUMNS) {
      const slots = res.appendChild(el(isTr ? 'td' : 'div')).appendChild(el('div'));
      for (const field of fields) {
        if (field === STATUS) slots.append(status(ad));
        else {
          const slot = slots.appendChild(el('span', '', ad.tags?.[field]));
          slot.dataset.field = field;
          slot.title = slot.textContent;
        }
      }
    }
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
    for (const [row, ad] of placed()) row.after(box(row, ad));
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  async function listed(list) {
    const me = ++listing;
    latest = list;
    on = !!list;
    badge();
    const ids = list?.map((a) => a.id) ?? [];
    const fast = list?.filter((a) => a.fast).map((a) => a.id);
    const { data } = ids.length ? await api('/ext/ad-tags', { host: location.host, ids, fast }) : {};
    if (me !== listing) return;
    // No reply is no news of these ads, not that the backend doesn't know them.
    ads = data ? list.map((a) => ({ id: a.id, nick: norm(a.nick), known: a.id in data, ...data[a.id] })) : [];
    render();
  }

  async function filter({ xyncBook, ids, fast }) {
    on = true;
    count = '…';
    badge();
    const { data } = await api('/ext/ad-tags', { host: location.host, ids, fast, ...saved });
    window.postMessage({ xyncKept: xyncBook, ids: data ? Object.keys(data) : null }, location.origin);
    count = data ? `${Object.keys(data).length}/${ids.length}` : '';
    badge();
  }

  window.addEventListener('message', ({ source, data }) => {
    if (source !== window || !data) return;
    if (data.xyncAds !== undefined) listed(data.xyncAds);
    if (data.xyncBook) filter(data);
    if (data.xyncFail) report(data.xyncFail);
  });

  // Ages grow with no change on the page.
  setInterval(render, 60000);

  // The panel asks for the state or sets a new filter: a change reloads the page, as its list
  // can't be re-requested from outside, and hook.js applies the filter to what it requests next.
  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if ('badge' in msg) return; // for the panel, the listener is any page's
    if (!msg.filter) reply({ on, filter: saved, error, count });
    else {
      const { only, skip } = msg.filter;
      if (Object.keys({ ...only, ...skip }).length) localStorage.setItem(FILTER, JSON.stringify(msg.filter));
      else localStorage.removeItem(FILTER);
      reply();
      location.reload();
    }
  });
})();
