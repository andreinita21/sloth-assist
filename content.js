(function () {
  'use strict';

  if (window.__slothAssistLoaded) return;
  window.__slothAssistLoaded = true;

  var JOB_KEY = 'aqh_job_v1';
  var COLLAPSE_KEY = 'aqh_collapsed';
  var MAX_TRIES = 8;

  function extensionAlive() {
    try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; }
  }

  function qa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function q(sel, root) { return (root || document).querySelector(sel); }

  function fractionSelects() {
    return qa('select[name^="fraction["]')
      .map(function (el) {
        var m = el.name.match(/\[(\d+)\]/);
        return { el: el, i: m ? parseInt(m[1], 10) : 0 };
      })
      .sort(function (a, b) { return a.i - b.i; })
      .map(function (o) { return o.el; });
  }

  var ADD_RE = /(\d+)\s*(?:more\s*)?(?:choices|answers|options|blanks|variante|raspunsuri|răspunsuri|optiuni|opțiuni)/i;

  function btnLabel(el) {
    return ((el.value || '') + ' ' + (el.textContent || '')).replace(/\s+/g, ' ').trim();
  }

  function findAddButton() {
    var els = qa('input[type="submit"], input[type="button"], button');
    var byName = els.filter(function (e) {
      return /^(noanswers|addanswers|addchoices|nooptions)(\[\])?$/.test(e.name || '');
    })[0];
    if (byName) return byName;
    var byText = els.filter(function (e) { return ADD_RE.test(btnLabel(e)); })[0];
    return byText || null;
  }

  function addStep(btn) {
    var m = btn ? ADD_RE.exec(btnLabel(btn)) : null;
    return m ? (parseInt(m[1], 10) || 3) : 3;
  }

  function isQuestionForm() { return fractionSelects().length > 0; }

  function fire(el) {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function setClosest(sel, target) {
    var best = null, diff = Infinity;
    for (var i = 0; i < sel.options.length; i++) {
      var v = parseFloat(sel.options[i].value);
      if (isNaN(v)) continue;
      var d = Math.abs(v - target);
      if (d < diff) { diff = d; best = sel.options[i]; }
    }
    if (!best) return false;
    if (sel.value !== best.value) { sel.value = best.value; fire(sel); }
    return true;
  }

  function applyTemplate(tpl) {
    var sels = fractionSelects();
    var grades = tpl.grades || [];
    var touched = 0;

    for (var i = 0; i < grades.length && i < sels.length; i++) {
      if (setClosest(sels[i], grades[i] / 100)) touched++;
    }

    for (var j = grades.length; j < sels.length; j++) setClosest(sels[j], 0);

    if (typeof tpl.single === 'boolean') {
      var single = q('select[name="single"]') || q('#id_single');
      if (single) { single.value = tpl.single ? '1' : '0'; fire(single); }
    }
    if (typeof tpl.shuffle === 'boolean') {
      var sh = q('input[type="checkbox"][name="shuffleanswers"]') || q('#id_shuffleanswers');
      if (sh && sh.type === 'checkbox' && sh.checked !== tpl.shuffle) sh.click();
      var shSel = q('select[name="shuffleanswers"]');
      if (shSel) { shSel.value = tpl.shuffle ? '1' : '0'; fire(shSel); }
    }

    var missing = grades.length - Math.min(grades.length, sels.length);
    return { touched: touched, slots: sels.length, missing: missing };
  }

  function readJob() {
    try { return JSON.parse(sessionStorage.getItem(JOB_KEY) || 'null'); }
    catch (e) { return null; }
  }
  function writeJob(job) {
    try { sessionStorage.setItem(JOB_KEY, JSON.stringify(job)); } catch (e) {}
  }
  function clearJob() {
    try { sessionStorage.removeItem(JOB_KEY); } catch (e) {}
  }

  function ensureSlotsThen(slots, tplId, tries) {
    var have = fractionSelects().length;
    if (have >= slots) return false;
    var btn = findAddButton();
    if (!btn) return false;
    writeJob({ id: tplId || null, slots: slots, tries: (tries || 0) + 1 });
    status('Adding blank answers (' + have + '/' + slots + ')...');
    btn.click();

    var deadline = Date.now() + 4000;
    var poll = setInterval(function () {
      if (fractionSelects().length > have) {
        clearInterval(poll);
        if (lastState) resumeJob(lastState.all);
      } else if (Date.now() > deadline) {
        clearInterval(poll);
      }
    }, 250);
    return true;
  }

  function resumeJob(all) {
    var job = readJob();
    if (!job) return false;

    if (job.tries >= MAX_TRIES) {
      clearJob();
      status('Gave up adding blanks after ' + MAX_TRIES + ' tries.', true);
      return false;
    }

    var tpl = null;
    if (job.id) {
      tpl = all.filter(function (t) { return t.id === job.id; })[0] || null;
      if (!tpl) { clearJob(); return false; }
    }

    if (fractionSelects().length < job.slots) {
      return ensureSlotsThen(job.slots, job.id, job.tries);
    }

    clearJob();
    if (tpl) {
      var r = applyTemplate(tpl);
      status('Applied "' + tpl.name + '" to ' + r.touched + ' answers.');
    } else {
      status('Form expanded to ' + fractionSelects().length + ' answer slots.');
    }
    return true;
  }

  function runTemplate(tpl) {
    if (fractionSelects().length < tpl.slots) {
      if (ensureSlotsThen(tpl.slots, tpl.id, 0)) return;
      status('No "more choices" button found - applied to the existing slots.', true);
    }
    var r = applyTemplate(tpl);
    var msg = 'Applied "' + tpl.name + '" to ' + r.touched + ' answers.';
    if (r.missing > 0) msg += ' ' + r.missing + ' grade(s) had no slot.';
    status(msg, r.missing > 0);
  }

  var statusEl = null;
  var lastState = null;

  function status(text, warn) {
    if (statusEl) {
      statusEl.textContent = text;
      statusEl.className = 'aqh-status' + (warn ? ' aqh-warn' : '');
    }
    console.log('[Sloth Assist]', text);
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function describe(tpl) {
    var bits = [tpl.slots + ' answers'];
    if (tpl.single === true) bits.push('one answer only');
    if (tpl.single === false) bits.push('multiple answers');
    return bits.join(' · ');
  }

  function diagnose() {
    var sels = fractionSelects();
    var btn = findAddButton();
    var lines = [
      'URL: ' + location.href,
      'grade dropdowns found: ' + sels.length,
      'add-blanks button: ' + (btn ? '"' + btnLabel(btn) + '" (name=' + (btn.name || '-') + ', step=' + addStep(btn) + ')' : 'NOT FOUND'),
      'single/multiple select: ' + (q('select[name="single"]') ? 'yes' : 'no'),
      'first dropdown options: ' + (sels[0] ? Array.prototype.map.call(sels[0].options, function (o) { return o.value; }).join(' ') : '-')
    ];
    var text = lines.join('\n');
    console.log('[Sloth Assist] diagnose\n' + text);
    status(lines.slice(1, 3).join(' | '));
    try { navigator.clipboard.writeText(text); } catch (e) {}
  }

  var theme = 'dark';

  function applyTheme(panel) {
    panel.classList.toggle('aqh-light', theme === 'light');
    var b = panel.querySelector('.aqh-theme');
    if (b) {
      b.textContent = theme === 'dark' ? '☀' : '☾';
      b.title = theme === 'dark' ? 'Switch to the light theme' : 'Switch to the dark theme';
    }
  }

  function staleNotice() {
    var panel = document.getElementById('aqh-panel');
    if (panel) panel.classList.add('aqh-stale');
    status('Sloth Assist was updated. Reload this page (Cmd+R) to get the new version.', true);
  }

  function watchForReload() {
    var t = setInterval(function () {
      if (!extensionAlive()) { clearInterval(t); staleNotice(); }
    }, 3000);
  }

  function buildPanel(state) {
    var old = document.getElementById('aqh-panel');
    if (old) old.remove();

    var panel = el('div');
    panel.id = 'aqh-panel';

    var head = el('div', 'aqh-head');
    var logo = document.createElement('img');
    logo.className = 'aqh-logo';
    logo.alt = '';
    try { logo.src = chrome.runtime.getURL('icons/icon32.png'); } catch (e) {}
    head.appendChild(logo);
    head.appendChild(el('span', 'aqh-title', 'Sloth Assist'));

    var themeBtn = el('button', 'aqh-theme', '☀');
    themeBtn.addEventListener('click', function () {
      theme = theme === 'dark' ? 'light' : 'dark';
      applyTheme(panel);
      state.settings.theme = theme;
      try { AQH.saveSettings(state.settings); } catch (e) { staleNotice(); }
    });
    head.appendChild(themeBtn);

    var toggle = el('button', 'aqh-toggle', '–');
    toggle.title = 'Collapse / expand';
    head.appendChild(toggle);
    panel.appendChild(head);

    var body = el('div', 'aqh-body');

    var list = el('div', 'aqh-list');
    state.all.forEach(function (tpl, idx) {
      var b = el('button', 'aqh-tpl');
      var top = el('div', 'aqh-tpl-top');
      if (idx < 9) top.appendChild(el('span', 'aqh-key', 'Alt+' + (idx + 1)));
      top.appendChild(el('span', 'aqh-tpl-name', tpl.name));
      b.appendChild(top);
      b.appendChild(el('span', 'aqh-tpl-sub', describe(tpl)));
      b.addEventListener('click', function () { runTemplate(tpl); });
      list.appendChild(b);
    });
    if (!state.all.length) {
      list.appendChild(el('div', 'aqh-empty', 'No templates - open the extension icon to add one.'));
    }
    body.appendChild(list);

    var row = el('div', 'aqh-row');
    var addBtn = findAddButton();
    var step = addStep(addBtn);
    var add = el('button', 'aqh-mini', '+' + step + ' blanks');
    add.title = 'Click the Moodle "more choices" button once';
    add.disabled = !addBtn;
    add.addEventListener('click', function () {
      var b = findAddButton();
      if (b) b.click();
    });
    row.appendChild(add);

    var diag = el('button', 'aqh-mini', 'Diagnose');
    diag.title = 'Report what the extension can see on this page (also copied to clipboard)';
    diag.addEventListener('click', diagnose);
    row.appendChild(diag);
    body.appendChild(row);

    statusEl = el('div', 'aqh-status', fractionSelects().length + ' answer slots on this page.');
    body.appendChild(statusEl);

    panel.appendChild(body);
    document.body.appendChild(panel);
    applyTheme(panel);

    function setCollapsed(c) {
      panel.classList.toggle('aqh-collapsed', c);
      toggle.textContent = c ? '+' : '–';
      try { localStorage.setItem(COLLAPSE_KEY, c ? '1' : '0'); } catch (e) {}
    }
    toggle.addEventListener('click', function () {
      setCollapsed(!panel.classList.contains('aqh-collapsed'));
    });
    var wasCollapsed = false;
    try { wasCollapsed = localStorage.getItem(COLLAPSE_KEY) === '1'; } catch (e) {}
    setCollapsed(wasCollapsed);

    document.addEventListener('keydown', function (ev) {
      if (!ev.altKey || ev.ctrlKey || ev.metaKey) return;
      var n = parseInt(ev.key, 10);
      if (!n || n < 1 || n > state.all.length) return;
      ev.preventDefault();
      runTemplate(state.all[n - 1]);
    });
  }

  if (!isQuestionForm()) return;

  AQH.load().then(function (state) {
    lastState = state;
    theme = state.settings.theme || 'dark';
    buildPanel(state);
    if (resumeJob(state.all)) return;
    var s = state.settings;
    if (s.autoExpand && fractionSelects().length < s.autoExpandTo) {
      ensureSlotsThen(s.autoExpandTo, null, 0);
    }
  });

  watchForReload();

  try {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== 'local') return;
      if (!changes.templates && !changes.settings) return;
      AQH.load().then(function (state) {
        lastState = state;
        theme = state.settings.theme || 'dark';
        buildPanel(state);
      });
    });
  } catch (e) {
    staleNotice();
  }
})();
