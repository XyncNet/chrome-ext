const ALLOWED_HOSTS = ['www.bybit.com',];

function updateIcon(tabId, url) {
  try {
    const host = new URL(url).hostname;
    if (ALLOWED_HOSTS.includes(host)) {
      chrome.action.enable(tabId);
    } else {
      chrome.action.disable(tabId);
    }
  } catch {
    chrome.action.disable(tabId);
  }
}

// Disable by default for all tabs
chrome.action.disable();

// When a tab is updated (navigated)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === 'complete') {
    updateIcon(tabId, tab.url || '');
  }
});

// When the user switches tabs
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId);
  updateIcon(tab.id, tab.url || '');
});
