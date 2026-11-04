// On Bybit's USDT/RUB P2P pages: under each ad whose condition Xync has parsed, shows the
// parse as compact tags, and keeps the filter set in the popup (filter.js).
// Ads come from hook.js, which also applies the filter to the page; the backend is reached
// through background.js (the page's CORS binds content scripts) and needs a Xync login.
// The outcome goes on the extension's badge: how many the filter kept, "!" on an error, whose
// text the popup shows. An error stays till the page reloads.
(() => {
  const BOX = 'xync-tags';
  const NO_LIMITS = 'разобрано: без ограничений';
  const FILTER = 'xyncFilter'; // localStorage, hook.js reads it at request time
  const NO_LOGIN = 'Нужен вход в Xync';
  const saved = JSON.parse(localStorage.getItem(FILTER));

  let ads = []; // current listing in page order: [{id, nick, tags}]
  let listing = 0; // latest listing's number: an older one's late reply must not win
  let timer = 0;
  let on = false; // a USDT/RUB P2P page: Bybit changes the currency without a page load
  let count = ''; // what the filter kept
  let error = '';

  // Only about 4 characters fit on the badge: "14/500" would read "4/50", the popup has it all.
  const badge = () => chrome.runtime.sendMessage({ badge: !on ? '' : error ? '!' : count.split('/')[0] });
  function report(text) {
    error = text;
    badge();
  }
  async function api(path, body) {
    const res = await chrome.runtime.sendMessage({ path, body });
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

  // A sibling of the row, not its child: full width whatever the row's own layout is.
  function box(row, tags) {
    const isTr = row.tagName === 'TR';
    const res = el(isTr ? 'tr' : 'div', BOX);
    const wrap = isTr ? res.appendChild(el('td')) : res;
    if (isTr) wrap.colSpan = row.cells.length;
    for (const tag of tags.length ? tags : [NO_LIMITS])
      wrap.appendChild(el('span', '', tag)).dataset.field = tag.split(':')[0]; // "field: value", colored by field
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

  async function listed(list) {
    const me = ++listing;
    on = !!list;
    badge();
    const ids = list?.map((a) => a.id) ?? [];
    const { data = {} } = ids.length ? await api('/ext/ad-tags', { host: location.host, ids }) : {};
    if (me !== listing) return;
    ads = (list ?? []).map((a) => ({ id: a.id, nick: norm(a.nick), tags: data[a.id] }));
    render();
  }

  async function filter({ xyncBook, ids }) {
    on = true;
    count = '…';
    badge();
    const { data } = await api('/ext/ad-tags', { host: location.host, ids, ...saved });
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

  // The popup asks for the state or sets a new filter: a change reloads the page, as its list
  // can't be re-requested from outside, and hook.js applies the filter to what it requests next.
  // background.js sends the login's error here.
  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg.error) report(msg.error);
    else if (!msg.filter) reply({ on, filter: saved, error, count });
    else {
      const { only, skip } = msg.filter;
      if (Object.keys({ ...only, ...skip }).length) localStorage.setItem(FILTER, JSON.stringify(msg.filter));
      else localStorage.removeItem(FILTER);
      reply();
      location.reload();
    }
  });
})();
