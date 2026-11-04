// Under each Bybit P2P ad whose condition Xync has parsed, shows the parse as compact tags.
// The ad list comes from hook.js, the tags from the Xync backend (via background.js: the
// page's CORS binds content scripts). The manifest matches all of /p2p/ because Bybit
// switches currency without a page load; which pages show tags is decided here, per listing.
(() => {
  const PAGE = /^\/[^/]+\/p2p\/(buy|sell)\/USDT\/RUB\b/;
  const BOX = 'xync-tags';
  const NO_LIMITS = 'разобрано: без ограничений';

  let ads = []; // current listing in page order: [{id, nick, tags}]
  let listing = 0; // latest listing's number: an older one's late reply must not win
  let timer = 0;

  const norm = (s) => s.replace(/\s+/g, ' ').trim();

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
      for (let el = hit.parentElement; el; el = el.parentElement) counts.set(el, (counts.get(el) || 0) + 1);
    let list = hits[hits.length >> 1].parentElement;
    while (list && (counts.get(list) < 2 || counts.get(list) * 2 <= hits.length)) list = list.parentElement;

    const rowOf = (hit) => {
      if (!list) return hit.parentElement.closest('tr') ?? hit.parentElement; // the only row: nothing to compare with
      let el = hit;
      while (el.parentElement !== list) el = el.parentElement;
      return el;
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
    const el = document.createElement(isTr ? 'tr' : 'div');
    el.className = BOX;
    const wrap = isTr ? el.appendChild(document.createElement('td')) : el;
    if (isTr) wrap.colSpan = row.cells.length;
    for (const tag of tags.length ? tags : [NO_LIMITS]) {
      const span = document.createElement('span');
      span.textContent = tag;
      wrap.appendChild(span);
    }
    return el;
  }

  // The page re-renders rows on its own, reusing them for other ads: the only safe state is
  // "rebuilt from scratch". Rows are reused without a new listing too, hence the observer.
  const observer = new MutationObserver(() => {
    timer ||= setTimeout(render, 100);
  });

  function render() {
    timer = 0;
    observer.disconnect(); // our own writes must not wake it
    for (const el of document.querySelectorAll(`.${BOX}`)) el.remove();
    if (!ads.length) return;
    for (const [row, ad] of placed()) if (ad.tags) row.after(box(row, ad.tags));
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  window.addEventListener('message', async ({ source, data }) => {
    if (source !== window || !data?.xyncAds) return;
    const me = ++listing;
    const wanted = PAGE.test(location.pathname) ? data.xyncAds : [];
    const ids = wanted.map((a) => a.id);
    const { tags = {}, error } = ids.length ? await chrome.runtime.sendMessage({ host: location.host, ids }) : {};
    if (me !== listing) return;
    ads = wanted.map((a) => ({ id: a.id, nick: norm(a.nick), tags: error ? [error] : tags[a.id] }));
    render();
  });
})();
