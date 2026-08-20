var AQH = (function () {
  'use strict';

  var MOODLE_GRADES = [
    100, 90, 83.33333, 80, 75, 70, 66.66667, 60, 50, 40, 33.33333, 30, 25, 20,
    16.66667, 14.28571, 12.5, 11.11111, 10, 5, 0,
    -5, -10, -11.11111, -12.5, -14.28571, -16.66667, -20, -25, -30, -33.33333,
    -40, -50, -60, -66.66667, -70, -75, -80, -83.33333, -90, -100
  ];

  var DEFAULTS = [
    {
      id: 'b_1of6',
      name: '1 correct / 6',
      slots: 6,
      single: true,
      grades: [100, 0, 0, 0, 0, 0]
    },
    {
      id: 'b_3of6',
      name: '3 correct / 6',
      slots: 6,
      single: false,
      grades: [33.33333, 33.33333, 33.33333, -33.33333, -33.33333, -33.33333]
    }
  ];

  var DEFAULT_SETTINGS = { autoExpand: false, autoExpandTo: 6, theme: 'dark' };

  var DEFAULT_SITES = [{ pattern: 'https://concurs.acadnet.eu/*', enabled: true }];

  function normalisePattern(raw) {
    var t = String(raw || '').trim();
    if (!t) return null;
    if (/^(\*|https?):\/\/[^\/\s]+\/\*$/.test(t)) return t;
    if (t.indexOf('://') === -1) t = 'https://' + t;
    var url;
    try { url = new URL(t); } catch (e) { return null; }
    if (!url.hostname) return null;
    if (url.hostname.indexOf('.') === -1 && url.hostname !== 'localhost') return null;
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.protocol + '//' + url.hostname + '/*';
  }

  function patternLabel(pattern) {
    return String(pattern).replace(/^\w+:\/\//, '').replace(/\/\*$/, '');
  }

  function loadSites() {
    return new Promise(function (resolve) {
      chrome.storage.local.get(['sites'], function (data) {
        resolve(data.sites || DEFAULT_SITES.slice());
      });
    });
  }

  function saveSites(list) {
    return new Promise(function (resolve) {
      chrome.storage.local.set({ sites: list }, resolve);
    });
  }

  function nearestMoodleGrade(v) {
    var best = MOODLE_GRADES[0], diff = Infinity;
    for (var i = 0; i < MOODLE_GRADES.length; i++) {
      var d = Math.abs(MOODLE_GRADES[i] - v);
      if (d < diff) { diff = d; best = MOODLE_GRADES[i]; }
    }
    return best;
  }

  function isSupported(v) {
    return Math.abs(nearestMoodleGrade(v) - v) < 0.0001;
  }

  function parseGrades(text) {
    var out = [];
    var parts = String(text).split(/[,;\n]+/);
    for (var i = 0; i < parts.length; i++) {
      var raw = parts[i].trim();
      if (!raw) continue;
      var rep = 1;
      var m = raw.match(/^(.+?)\s*[x*]\s*(\d+)$/i);
      var tok = raw;
      if (m) { tok = m[1].trim(); rep = parseInt(m[2], 10) || 1; }
      var v;
      if (/^(none|nothing|n|-)$/i.test(tok)) {
        v = 0;
      } else {
        v = parseFloat(tok.replace('%', '').replace(',', '.'));
      }
      if (isNaN(v)) throw new Error('Cannot read the grade "' + raw + '"');
      for (var k = 0; k < rep; k++) out.push(v);
    }
    return out;
  }

  function formatGrades(arr) {
    return (arr || []).map(function (v) {
      return v === 0 ? 'none' : String(v) + '%';
    }).join(', ');
  }

  function correctValue(correct) {
    return correct > 0 ? nearestMoodleGrade(100 / correct) : 0;
  }

  function cancelValue(total, correct) {
    var wrong = total - correct;
    return wrong > 0 ? nearestMoodleGrade(-(100 / wrong)) : 0;
  }

  function buildGrades(total, correct, bad) {
    total = Math.max(1, total | 0);
    correct = Math.min(total, Math.max(0, correct | 0));
    var good = correctValue(correct);
    var out = [];
    for (var i = 0; i < correct; i++) out.push(good);
    var badSnapped = bad ? nearestMoodleGrade(bad) : 0;
    for (var j = 0; j < total - correct; j++) out.push(badSnapped);
    return out;
  }

  function normalise(t) {
    var grades = Array.isArray(t.grades) ? t.grades.slice() : [];
    var slots = t.slots || grades.length || 1;
    return {
      id: t.id,
      name: t.name || 'Template',
      slots: Math.max(slots, grades.length),
      single: typeof t.single === 'boolean' ? t.single : null,
      shuffle: typeof t.shuffle === 'boolean' ? t.shuffle : null,
      grades: grades
    };
  }

  function load() {
    return new Promise(function (resolve) {
      chrome.storage.local.get(['templates', 'seeded', 'settings'], function (data) {
        var seen = {};
        var list = (data.templates || []).map(normalise).filter(function (t) {
          if (seen[t.id]) return false;
          seen[t.id] = true;
          return true;
        });
        var settings = Object.assign({}, DEFAULT_SETTINGS, data.settings || {});

        if (!data.seeded) {
          var have = {};
          list.forEach(function (t) { have[t.id] = true; });
          DEFAULTS.forEach(function (d) {
            if (!have[d.id]) list.push(normalise(d));
          });
          chrome.storage.local.set({ templates: list, seeded: true });
        }
        resolve({ all: list, settings: settings });
      });
    });
  }

  function save(list) {
    return new Promise(function (resolve) {
      chrome.storage.local.set({ templates: list, seeded: true }, resolve);
    });
  }

  function missingDefaults(list) {
    var have = {};
    (list || []).forEach(function (t) { have[t.id] = true; });
    return DEFAULTS.filter(function (d) { return !have[d.id]; }).map(normalise);
  }

  function saveSettings(s) {
    return new Promise(function (resolve) {
      chrome.storage.local.set({ settings: s }, resolve);
    });
  }

  return {
    MOODLE_GRADES: MOODLE_GRADES,
    DEFAULTS: DEFAULTS,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    DEFAULT_SITES: DEFAULT_SITES,
    normalisePattern: normalisePattern,
    patternLabel: patternLabel,
    loadSites: loadSites,
    saveSites: saveSites,
    nearestMoodleGrade: nearestMoodleGrade,
    isSupported: isSupported,
    parseGrades: parseGrades,
    formatGrades: formatGrades,
    correctValue: correctValue,
    cancelValue: cancelValue,
    buildGrades: buildGrades,
    normalise: normalise,
    load: load,
    save: save,
    missingDefaults: missingDefaults,
    saveSettings: saveSettings
  };
})();
