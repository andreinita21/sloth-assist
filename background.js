var SCRIPT_ID = 'sloth-sites';
var DEFAULT_SITES = [];

function get(keys) {
  return new Promise(function (resolve) { chrome.storage.local.get(keys, resolve); });
}

function set(obj) {
  return new Promise(function (resolve) { chrome.storage.local.set(obj, resolve); });
}

function hasOrigin(pattern) {
  return new Promise(function (resolve) {
    try {
      chrome.permissions.contains({ origins: [pattern] }, function (ok) {
        resolve(!!ok && !chrome.runtime.lastError);
      });
    } catch (e) {
      resolve(false);
    }
  });
}

async function activePatterns() {
  var data = await get(['sites']);
  var sites = data.sites || DEFAULT_SITES;
  var out = [];
  for (var i = 0; i < sites.length; i++) {
    var s = sites[i];
    if (s.enabled === false) continue;
    if (await hasOrigin(s.pattern)) out.push(s.pattern);
  }
  return out;
}

async function syncScripts() {
  var wanted = await activePatterns();
  try {
    var existing = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
    if (existing && existing.length) {
      await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
    }
  } catch (e) {}
  if (!wanted.length) return { registered: [] };
  try {
    await chrome.scripting.registerContentScripts([{
      id: SCRIPT_ID,
      matches: wanted,
      js: ['templates.js', 'content.js'],
      css: ['panel.css'],
      runAt: 'document_idle',
      persistAcrossSessions: true
    }]);
  } catch (e) {
    return { registered: [], error: String(e) };
  }
  return { registered: wanted };
}

async function seed() {
  var data = await get(['sites']);
  if (!data.sites) await set({ sites: DEFAULT_SITES });
  await syncScripts();
}

chrome.runtime.onInstalled.addListener(seed);
chrome.runtime.onStartup.addListener(syncScripts);

chrome.storage.onChanged.addListener(function (changes, area) {
  if (area === 'local' && changes.sites) syncScripts();
});

chrome.permissions.onAdded.addListener(syncScripts);
chrome.permissions.onRemoved.addListener(syncScripts);

chrome.runtime.onMessage.addListener(function (msg, sender, respond) {
  if (msg && msg.type === 'sync') {
    syncScripts().then(respond);
    return true;
  }
});
