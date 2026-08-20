(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  window.addEventListener('error', function (ev) {
    var m = document.getElementById('msg');
    if (m) {
      m.textContent = 'Something broke: ' + ev.message + ' (' + ev.lineno + ')';
      m.className = 'msg err';
    }
  });
  var state = { all: [], settings: null, sites: [] };
  var editingId = null;
  var confirmingId = null;
  var wrongMode = 'mirror';
  var customVal = -25;
  var autoName = '';

  function msg(text, kind) {
    var m = $('msg');
    m.textContent = text || '';
    m.className = 'msg' + (kind ? ' ' + kind : '');
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    $('theme').textContent = theme === 'dark' ? '☀' : '☾';
    $('theme').title = theme === 'dark' ? 'Switch to the light theme' : 'Switch to the dark theme';
  }

  $('theme').addEventListener('click', function () {
    state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
    applyTheme(state.settings.theme);
    AQH.saveSettings(state.settings);
  });

  function describe(t) {
    var bits = [t.slots + ' answers'];
    if (t.single === true) bits.push('pick one');
    if (t.single === false) bits.push('pick several');
    if (t.shuffle === true) bits.push('shuffle on');
    if (t.shuffle === false) bits.push('shuffle off');
    return bits.join(' · ') + ' — ' + AQH.formatGrades(t.grades);
  }

  function commit(note, kind) {
    return AQH.save(state.all).then(function () {
      render();
      if (note) msg(note, kind || 'ok');
    });
  }

  function iconBtn(glyph, title, cls) {
    var b = document.createElement('button');
    b.className = 'icon' + (cls ? ' ' + cls : '');
    b.textContent = glyph;
    b.title = title;
    return b;
  }

  function move(id, delta) {
    var i = state.all.findIndex(function (t) { return t.id === id; });
    var j = i + delta;
    if (i < 0 || j < 0 || j >= state.all.length) return;
    var tmp = state.all[i];
    state.all[i] = state.all[j];
    state.all[j] = tmp;
    commit('Reordered — the buttons and the Alt+number shortcuts follow this order.');
  }

  function duplicate(t) {
    var copy = JSON.parse(JSON.stringify(t));
    copy.id = 'c_' + Date.now().toString(36);
    copy.name = t.name + ' (copy)';
    var i = state.all.findIndex(function (x) { return x.id === t.id; });
    state.all.splice(i + 1, 0, copy);
    commit('Duplicated "' + t.name + '".');
  }

  function remove(t) {
    state.all = state.all.filter(function (x) { return x.id !== t.id; });
    if (editingId === t.id) resetForm();
    confirmingId = null;
    commit('Deleted "' + t.name + '".');
  }

  function card(t, idx) {
    var wrap = document.createElement('div');
    wrap.className = 'card glass' + (editingId === t.id ? ' editing' : '');

    var grow = document.createElement('div');
    grow.className = 'grow';
    var n = document.createElement('div');
    n.className = 'name';
    if (idx < 9) {
      var k = document.createElement('span');
      k.className = 'shortcut';
      k.textContent = 'Alt+' + (idx + 1) + '  ';
      n.appendChild(k);
    }
    n.appendChild(document.createTextNode(t.name));
    var s = document.createElement('div');
    s.className = 'sub';
    s.textContent = describe(t);
    grow.appendChild(n);
    grow.appendChild(s);
    wrap.appendChild(grow);

    var acts = document.createElement('div');
    acts.className = 'acts';

    var up = iconBtn('↑', 'Move up');
    up.disabled = idx === 0;
    up.addEventListener('click', function () { move(t.id, -1); });
    acts.appendChild(up);

    var down = iconBtn('↓', 'Move down');
    down.disabled = idx === state.all.length - 1;
    down.addEventListener('click', function () { move(t.id, 1); });
    acts.appendChild(down);

    var edit = iconBtn('✎', 'Edit this template');
    edit.addEventListener('click', function () { fillForm(t, t.id); });
    acts.appendChild(edit);

    var dup = iconBtn('⧉', 'Duplicate');
    dup.addEventListener('click', function () { duplicate(t); });
    acts.appendChild(dup);

    if (confirmingId === t.id) {
      var yes = document.createElement('button');
      yes.className = 'danger';
      yes.textContent = 'Delete?';
      yes.title = 'Click again to delete for good';
      yes.addEventListener('click', function () { remove(t); });
      acts.appendChild(yes);
      var no = iconBtn('✕', 'Keep it');
      no.addEventListener('click', function () { confirmingId = null; render(); });
      acts.appendChild(no);
    } else {
      var del = iconBtn('🗑', 'Delete', 'danger');
      del.addEventListener('click', function () { confirmingId = t.id; render(); });
      acts.appendChild(del);
    }

    wrap.appendChild(acts);
    return wrap;
  }

  function render() {
    var list = $('list');
    list.textContent = '';
    if (!state.all.length) {
      var e = document.createElement('div');
      e.className = 'sub';
      e.style.margin = '0 0 8px';
      e.textContent = 'No templates yet — build one below.';
      list.appendChild(e);
    }
    state.all.forEach(function (t, i) { list.appendChild(card(t, i)); });

    var missing = AQH.missingDefaults(state.all);
    var restore = $('restore');
    restore.style.display = missing.length ? '' : 'none';
    restore.textContent = 'Restore ' + missing.length + ' built-in template' +
      (missing.length === 1 ? '' : 's');
  }

  function nums() {
    var total = Math.max(1, parseInt($('f-total').value, 10) || 1);
    var correct = parseInt($('f-correct').value, 10);
    if (isNaN(correct) || correct < 0) correct = 0;
    correct = Math.min(correct, total);
    return { total: total, correct: correct, wrong: total - correct };
  }

  function pct(v) {
    return (v > 0 ? '' : '') + v + '%';
  }

  function chip(index, value) {
    var c = document.createElement('span');
    c.className = 'chip' + (value > 0 ? ' pos' : (value < 0 ? ' neg' : ''));
    var i = document.createElement('i');
    i.textContent = index;
    c.appendChild(i);
    c.appendChild(document.createTextNode(value === 0 ? 'None' : pct(value)));
    return c;
  }

  function refresh(keepGrades) {
    var n = nums();
    var good = AQH.correctValue(n.correct);
    var mirror = n.correct > 0 ? -good : 0;
    var cancel = AQH.cancelValue(n.total, n.correct);

    $('worth-val').textContent = n.correct === 0 ? '—' : pct(good);
    $('worth-text').textContent = n.correct === 0
      ? 'no correct answer yet'
      : 'for each of the ' + n.correct + ' correct answer' + (n.correct === 1 ? '' : 's') +
        ', ' + n.total + ' answers in total';

    var btns = $('wrong-modes').querySelectorAll('button');
    btns[1].querySelector('[data-val]').textContent = mirror ? pct(mirror) : '—';
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('sel', btns[i].dataset.mode === wrongMode);
      btns[i].disabled = n.wrong === 0 && btns[i].dataset.mode !== 'none';
    }
    $('custom-wrap').classList.toggle('on', wrongMode === 'custom' && n.wrong > 0);

    var bad = 0;
    if (n.wrong > 0) {
      if (wrongMode === 'mirror') bad = mirror;
      else if (wrongMode === 'custom') bad = AQH.nearestMoodleGrade(customVal);
    }

    var tip;
    if (n.wrong === 0) {
      tip = 'Every answer is correct, so there is nothing to penalise.';
    } else if (wrongMode === 'none') {
      tip = 'A wrong tick is worth nothing. Normal when a single answer is correct.';
    } else if (wrongMode === 'mirror') {
      tip = 'A wrong tick costs what a right one earns: ' + n.correct + ' right and ' +
        n.correct + ' wrong ends at 0.' +
        (cancel !== mirror ? ' Use ' + pct(cancel) + ' instead if you want ticking all ' +
          n.total + ' boxes to score 0.' : ' Ticking all ' + n.total + ' boxes also scores 0.');
    } else {
      var snapped = AQH.nearestMoodleGrade(customVal);
      tip = 'Each wrong answer: ' + pct(snapped) + '.' +
        (Math.abs(snapped - customVal) > 0.0001 ? ' (' + customVal + '% is not on Moodle\'s list, so the closest value is used.)' : '') +
        ' ' + pct(cancel) + ' would make ticking all ' + n.total + ' boxes score 0.';
    }
    $('tip').textContent = tip;

    if (!keepGrades) {
      $('f-grades').value = AQH.formatGrades(AQH.buildGrades(n.total, n.correct, bad));
      if (!editingId) $('f-single').value = n.correct === 1 ? '1' : '0';
    }

    var shown;
    try {
      shown = AQH.parseGrades($('f-grades').value);
    } catch (e) {
      $('preview').textContent = e.message;
      return;
    }
    var box = $('preview');
    box.textContent = '';
    for (var k = 0; k < Math.max(shown.length, n.total); k++) {
      box.appendChild(chip(k + 1, k < shown.length ? shown[k] : 0));
    }

    if (!editingId) {
      var suggested = n.correct + ' correct / ' + n.total;
      if (!$('f-name').value || $('f-name').value === autoName) {
        $('f-name').value = suggested;
        autoName = suggested;
      }
    }
  }

  $('wrong-modes').addEventListener('click', function (ev) {
    var b = ev.target.closest('button[data-mode]');
    if (!b || b.disabled) return;
    if (b.dataset.mode === 'custom' && wrongMode !== 'custom') {

      var n = nums();
      customVal = AQH.cancelValue(n.total, n.correct) || -25;
      $('f-custom').value = customVal;
    }
    wrongMode = b.dataset.mode;
    refresh(false);
  });
  $('f-custom').addEventListener('input', function () {
    var v = parseFloat($('f-custom').value.replace(',', '.'));
    customVal = isNaN(v) ? 0 : v;
    refresh(false);
  });
  $('f-total').addEventListener('input', function () { refresh(false); });
  $('f-correct').addEventListener('input', function () { refresh(false); });
  $('f-grades').addEventListener('input', function () { refresh(true); });

  function deriveMode(grades) {
    var good = grades.filter(function (g) { return g > 0; });
    var bad = grades.filter(function (g) { return g < 0; });
    if (!bad.length) return { mode: 'none', custom: -25 };
    if (good.length && Math.abs(Math.abs(bad[0]) - good[0]) < 0.001) return { mode: 'mirror', custom: bad[0] };
    return { mode: 'custom', custom: bad[0] };
  }

  function fillForm(t, id) {
    editingId = id;
    confirmingId = null;
    $('form-title').textContent = id ? 'Editing “' + t.name + '”' : 'New template';
    $('f-name').value = id ? t.name : t.name + ' (copy)';
    $('f-total').value = t.slots;
    $('f-correct').value = t.grades.filter(function (g) { return g > 0; }).length;
    var d = deriveMode(t.grades);
    wrongMode = d.mode;
    customVal = d.custom;
    $('f-custom').value = customVal;
    $('f-grades').value = AQH.formatGrades(t.grades);
    $('f-single').value = t.single === true ? '1' : (t.single === false ? '0' : '');
    $('f-shuffle-on').checked = typeof t.shuffle === 'boolean';
    $('f-shuffle').value = t.shuffle ? '1' : '0';
    $('cancel').style.display = '';
    $('save').textContent = id ? 'Save changes' : 'Save template';
    msg('');
    render();
    refresh(true);
    $('form-title').scrollIntoView({ block: 'start' });
  }

  function resetForm() {
    editingId = null;
    autoName = '';
    $('form-title').textContent = 'New template';
    $('f-name').value = '';
    $('f-total').value = 6;
    $('f-correct').value = 3;
    wrongMode = 'mirror';
    customVal = -25;
    $('f-custom').value = customVal;
    $('f-single').value = '0';
    $('f-shuffle-on').checked = false;
    $('cancel').style.display = 'none';
    $('save').textContent = 'Save template';
    render();
    refresh(false);
  }

  $('restore').addEventListener('click', function () {
    var missing = AQH.missingDefaults(state.all);
    state.all = state.all.concat(missing);
    commit('Restored: ' + missing.map(function (t) { return t.name; }).join(', ') + '.');
  });

  $('save').addEventListener('click', function () {
    var name = $('f-name').value.trim();
    if (!name) { msg('Give the template a name.', 'err'); return; }
    var grades;
    try {
      grades = AQH.parseGrades($('f-grades').value);
    } catch (e) {
      msg(e.message, 'err');
      return;
    }
    if (!grades.length) { msg('Add at least one grade.', 'err'); return; }

    var unsupported = grades.filter(function (g) { return !AQH.isSupported(g); });
    var slots = Math.max(nums().total, grades.length);
    var singleRaw = $('f-single').value;

    var tpl = {
      id: editingId || ('c_' + Date.now().toString(36)),
      name: name,
      slots: slots,
      single: singleRaw === '' ? null : singleRaw === '1',
      shuffle: $('f-shuffle-on').checked ? $('f-shuffle').value === '1' : null,
      grades: grades
    };

    var wasEditing = !!editingId;
    if (wasEditing) {
      state.all = state.all.map(function (t) { return t.id === editingId ? tpl : t; });
    } else {
      state.all.push(tpl);
    }

    AQH.save(state.all).then(function () {
      resetForm();
      var note = wasEditing ? 'Changes saved.' : 'Template saved.';
      if (unsupported.length) {
        note += ' Note: ' + unsupported.map(function (g) {
          return g + '% → ' + AQH.nearestMoodleGrade(g) + '%';
        }).join(', ') + ' (Moodle has no exact option, the closest one is used).';
      }
      msg(note, unsupported.length ? 'err' : 'ok');
    });
  });

  $('cancel').addEventListener('click', function () { resetForm(); msg(''); });

  function siteMsg(text, kind) {
    var m = $('site-msg');
    m.textContent = text || '';
    m.className = 'msg' + (kind ? ' ' + kind : '');
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

  function nudgeBackground() {
    try { chrome.runtime.sendMessage({ type: 'sync' }, function () { void chrome.runtime.lastError; }); } catch (e) {}
  }

  function saveSites(note, kind) {
    return AQH.saveSites(state.sites).then(function () {
      nudgeBackground();
      renderSites();
      if (note) siteMsg(note, kind || 'ok');
    });
  }

  function siteRow(site, granted) {
    var row = document.createElement('div');
    row.className = 'site';

    var host = document.createElement('div');
    host.className = 'host';
    host.appendChild(document.createTextNode(AQH.patternLabel(site.pattern)));
    var small = document.createElement('small');
    small.textContent = site.pattern;
    host.appendChild(small);
    row.appendChild(host);

    var tag = document.createElement('span');
    if (!granted) {
      tag.className = 'tag need';
      tag.textContent = 'no access';
      tag.title = 'Chrome has not granted access to this site yet';
    } else if (site.enabled === false) {
      tag.className = 'tag off';
      tag.textContent = 'off';
    } else {
      tag.className = 'tag on';
      tag.textContent = 'active';
    }
    row.appendChild(tag);

    if (!granted) {
      var grant = document.createElement('button');
      grant.textContent = 'Grant';
      grant.title = 'Ask Chrome for access to this site';
      grant.addEventListener('click', function () {
        chrome.permissions.request({ origins: [site.pattern] }, function (ok) {
          if (ok) saveSites('Access granted for ' + AQH.patternLabel(site.pattern) + '.');
          else siteMsg('Chrome did not grant access to ' + AQH.patternLabel(site.pattern) + '.', 'err');
        });
      });
      row.appendChild(grant);
    } else {
      var toggle = document.createElement('button');
      toggle.className = 'icon';
      toggle.textContent = site.enabled === false ? '\u25cb' : '\u25cf';
      toggle.title = site.enabled === false ? 'Turn it back on' : 'Turn it off without removing it';
      toggle.addEventListener('click', function () {
        site.enabled = site.enabled === false;
        saveSites(AQH.patternLabel(site.pattern) + (site.enabled ? ' is on again.' : ' is off.'));
      });
      row.appendChild(toggle);
    }

    var del = document.createElement('button');
    del.className = 'icon danger';
    del.textContent = '\u2715';
    del.title = 'Remove this site';
    del.addEventListener('click', function () {
      var pattern = site.pattern;
      state.sites = state.sites.filter(function (x) { return x.pattern !== pattern; });
      try {
        chrome.permissions.remove({ origins: [pattern] }, function () { void chrome.runtime.lastError; });
      } catch (e) {}
      saveSites('Removed ' + AQH.patternLabel(pattern) + '.');
    });
    row.appendChild(del);

    return row;
  }

  function renderSites() {
    var box = $('sites');
    Promise.all(state.sites.map(function (s) { return hasOrigin(s.pattern); })).then(function (flags) {
      box.textContent = '';
      if (!state.sites.length) {
        var e = document.createElement('div');
        e.className = 'hint';
        e.style.marginBottom = '9px';
        e.textContent = 'No sites yet, so the panel will not appear anywhere. Add one below.';
        box.appendChild(e);
        return;
      }
      state.sites.forEach(function (s, i) { box.appendChild(siteRow(s, flags[i])); });
    });
  }

  function addSite() {
    var raw = $('site-input').value;
    var pattern = AQH.normalisePattern(raw);
    if (!pattern) {
      siteMsg('That does not look like a website address. Try moodle.my-school.org, or paste a full page address.', 'err');
      return;
    }
    var already = state.sites.filter(function (s) { return s.pattern === pattern; })[0];
    if (already) {
      siteMsg(AQH.patternLabel(pattern) + ' is already on the list.', 'err');
      return;
    }
    chrome.permissions.request({ origins: [pattern] }, function (ok) {
      if (!ok) {
        siteMsg('Chrome did not grant access to ' + AQH.patternLabel(pattern) + ', so it was not added.', 'err');
        return;
      }
      state.sites.push({ pattern: pattern, enabled: true });
      $('site-input').value = '';
      saveSites('Added ' + AQH.patternLabel(pattern) + '. Reload any tab already open on it.');
    });
  }

  $('site-add').addEventListener('click', addSite);
  $('site-input').addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter') { ev.preventDefault(); addSite(); }
  });

  function saveSettings() {
    state.settings.autoExpand = $('s-auto').checked;
    state.settings.autoExpandTo = parseInt($('s-auto-to').value, 10) || 6;
    AQH.saveSettings(state.settings);
  }
  $('s-auto').addEventListener('change', saveSettings);
  $('s-auto-to').addEventListener('change', saveSettings);

  AQH.loadSites().then(function (sites) {
    state.sites = sites;
    renderSites();
    nudgeBackground();
  });

  AQH.load().then(function (data) {
    state.all = data.all;
    state.settings = data.settings;
    applyTheme(state.settings.theme || 'dark');
    $('s-auto').checked = !!state.settings.autoExpand;
    $('s-auto-to').value = state.settings.autoExpandTo;
    render();
    refresh(false);
  }).catch(function (e) {
    msg('Could not load templates: ' + e.message, 'err');
    console.error(e);
  });
})();
