// Runs in the page's MAIN world: only here are the page's own fetch/XHR visible.
// Hands the ad list Bybit's P2P page loads over to content.js (isolated world). With a Xync
// filter on, also swaps that list in the response, so Bybit renders the result itself: rows,
// pagination and "Buy" stay its own. Ad ids stay strings: they don't fit a JS number.
(() => {
  const ADS_URL = '/otc/item/online';
  const PAGE = /^\/[^/]+\/p2p\/(buy|sell)\/USDT\/RUB\b/;
  const FILTER = 'xyncFilter'; // localStorage: set by content.js, readable here synchronously
  const BOOK_MAX = 600; // 2 requests; the backend loads the first 500, further ads have no parse anyway
  const BOOK_SIZE = '300'; // Bybit's maximum, 301 is refused (912120002). The page waits for the whole book
  const BOOK_TTL = 60000; // page turns and the page's refreshes reuse the filtered book

  const pageFetch = window.fetch;
  const onPage = () => PAGE.test(location.pathname);
  const filtering = () => onPage() && !!localStorage.getItem(FILTER);
  const post = (msg) => window.postMessage(msg, location.origin);
  // "Fast release" of an ad that sells, "Fast payment" of one that buys: the page reads just that flag.
  const fast = (a) => (a.side ? a.latestReleaseTimeHighlight : a.latestPayTimeHighlight);

  function forward(body) {
    try {
      const items = (typeof body === 'string' ? JSON.parse(body) : body)?.result?.items;
      if (items) post({ xyncAds: onPage() ? items.map((a) => ({ id: a.id, nick: a.nickName, fast: fast(a) })) : null });
    } catch {} // not json (WAF page etc): nothing to show
  }

  // The whole listing under the page's own request, by its session and headers.
  async function book(url, headers, req) {
    const items = [];
    for (let page = 1; ; page++) {
      const body = JSON.stringify({ ...req, page: String(page), size: BOOK_SIZE });
      const res = await pageFetch(url, { method: 'POST', headers, body, credentials: 'include' });
      if (!res.ok) throw new Error(`Bybit ${res.status}`);
      const { result, ret_msg } = await res.json();
      if (!result?.items) throw new Error(`Bybit: ${ret_msg}`);
      items.push(...result.items);
      if (!result.items.length || items.length >= Math.min(result.count, BOOK_MAX)) return items;
    }
  }

  // → the ads that pass the filter, decided by the backend through content.js; null: it
  // failed, and content.js has said why.
  let asks = 0;
  const kept = (items) =>
    new Promise((done) => {
      const id = ++asks;
      const onReply = ({ source, data }) => {
        if (source !== window || data?.xyncKept !== id) return;
        window.removeEventListener('message', onReply);
        done(data.ids && items.filter((a) => data.ids.includes(a.id)));
      };
      window.addEventListener('message', onReply);
      post({ xyncBook: id, ids: items.map((a) => a.id), fast: items.filter(fast).map((a) => a.id) });
    });

  let memo = {};
  function matching(url, headers, req) {
    const key = JSON.stringify([localStorage.getItem(FILTER), { ...req, page: 0, size: 0 }]);
    if (memo.key !== key || Date.now() - memo.at > BOOK_TTL)
      memo = { key, at: Date.now(), ads: book(url, headers, req).then(kept) };
    return memo.ads;
  }

  // → the response body the page gets: the filtered book's page, or `text` if that failed.
  async function rewrite(url, headers, reqBody, text) {
    try {
      const req = JSON.parse(reqBody);
      const ads = await matching(url, headers, req);
      if (!ads) {
        memo = {};
        return text;
      }
      const data = JSON.parse(text);
      const items = ads.slice((req.page - 1) * req.size, req.page * req.size);
      return JSON.stringify({ ...data, result: { ...data.result, count: ads.length, items } });
    } catch (e) {
      memo = {};
      post({ xyncFail: e.message });
      return text;
    }
  }

  const { open, send, setRequestHeader } = XMLHttpRequest.prototype;
  const calls = new WeakMap(); // ads XHR → {url, headers, body, held, done}

  XMLHttpRequest.prototype.open = function (method, url) {
    if (String(url).includes(ADS_URL)) {
      const call = { url: String(url), headers: {} };
      calls.set(this, call);
      // All added before the page's own handlers, so these can withhold events from them;
      // this one goes first: the withholding stops all that come after it.
      this.addEventListener('loadend', () => settle(this, call));
      for (const type of ['readystatechange', 'load', 'loadend'])
        this.addEventListener(type, (e) => {
          if (!call.held) return;
          e.stopImmediatePropagation();
          call.held.add(type);
        });
    }
    return open.apply(this, arguments);
  };

  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    const call = calls.get(this);
    if (call) call.headers[name] = value;
    return setRequestHeader.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function (body) {
    const call = calls.get(this);
    if (call) {
      call.body = body;
      if (filtering()) call.held = new Set();
    }
    return send.apply(this, arguments);
  };

  // The filter's answer is async and a finished XHR can't wait, so its events are held till
  // it's in, then replayed with the swapped body.
  async function settle(xhr, call) {
    if (call.done) return; // our own replay
    call.done = true;
    if (!call.held) return forward(xhr.response);
    const raw = xhr.response;
    const text = await rewrite(call.url, call.headers, call.body, typeof raw === 'string' ? raw : JSON.stringify(raw));
    Object.defineProperty(xhr, 'responseText', { get: () => text });
    Object.defineProperty(xhr, 'response', { get: () => (xhr.responseType === 'json' ? JSON.parse(text) : text) });
    const events = [...call.held];
    call.held = null;
    for (const type of events) xhr.dispatchEvent(new Event(type));
    forward(text);
  }

  window.fetch = function (input, init) {
    const url = String(input?.url ?? input);
    const req = url.includes(ADS_URL) && input instanceof Request ? input.clone() : null;
    const res = pageFetch.apply(this, arguments);
    if (!url.includes(ADS_URL)) return res;
    return res.then(async (r) => {
      const text = await r.clone().text();
      const headers = Object.fromEntries(new Headers(init?.headers ?? input.headers));
      const body = filtering() ? await rewrite(url, headers, init?.body ?? (await req?.text()), text) : text;
      forward(body);
      return body === text ? r : new Response(body, r);
    });
  };
})();
