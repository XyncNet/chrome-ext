// The popup's part of the Xync filter on Bybit's USDT/RUB P2P pages: content.js of the page
// keeps the filter and the last error, the backend gives the options. Its 401 offers the login.
(async () => {
  const $ = (id) => document.getElementById(id);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const state = await chrome.tabs.sendMessage(tab.id, {}).catch(() => null); // no content.js here
  if (!state?.on) return;

  const draft = state.filter ?? { only: {}, skip: {} };
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

  async function send(filter) {
    await chrome.tabs.sendMessage(tab.id, { filter });
    window.close();
  }

  $('xync').hidden = false;
  $('note').textContent = state.error || 'Загружаю варианты…';
  const { data, error, status } = await chrome.runtime.sendMessage({
    path: `/ext/cond-filters?host=${new URL(tab.url).host}`,
  });
  $('note').textContent = state.error || (status === 401 ? '' : error) || '';
  if (status === 401) {
    $('login').hidden = false;
    $('login').onclick = async () => {
      await chrome.runtime.sendMessage({ login: tab.id });
      window.close();
    };
  }
  if (error) return;

  for (const [field, vals] of Object.entries(data)) {
    const group = $('groups').appendChild(document.createElement('div'));
    group.className = 'group';
    group.appendChild(document.createElement('b')).textContent = field;
    for (const val of vals) {
      const chip = group.appendChild(document.createElement('span'));
      chip.textContent = val;
      chip.className = stateOf(field, val);
      chip.onclick = () => {
        cycle(field, val);
        chip.className = stateOf(field, val);
      };
    }
  }
  if (state.count) $('hint').prepend(`Подобрано: ${state.count}. `);
  $('panel').hidden = false;
  $('apply').onclick = () => send(draft);
  $('reset').onclick = () => send({ only: {}, skip: {} });
})();
