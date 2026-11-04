// Runs in the page's MAIN world: only here are the page's own fetch/XHR visible.
// Hands the ad list Bybit's P2P page loads over to content.js (isolated world) and
// changes nothing else. Ad ids stay strings: they don't fit a JS number.
(() => {
  const ADS_URL = '/otc/item/online';

  function forward(body) {
    try {
      const items = (typeof body === 'string' ? JSON.parse(body) : body)?.result?.items;
      if (items) window.postMessage({ xyncAds: items.map((a) => ({ id: a.id, nick: a.nickName })) }, location.origin);
    } catch {} // not json (WAF page etc): nothing to show
  }

  const { open } = XMLHttpRequest.prototype;
  XMLHttpRequest.prototype.open = function (method, url) {
    if (String(url).includes(ADS_URL)) this.addEventListener('load', () => forward(this.response));
    return open.apply(this, arguments);
  };

  const { fetch } = window;
  window.fetch = function (input) {
    const res = fetch.apply(this, arguments);
    if (String(input?.url ?? input).includes(ADS_URL)) res.then((r) => r.clone().text()).then(forward, () => {});
    return res;
  };
})();
