/* Starting Block Fitness — Admin force-plate report viewer.
 *
 * Client-side only: the CSV is parsed in the browser and never leaves
 * this page. No Google Sheet is produced.
 *
 * SECURITY — READ THIS:
 * ADMIN_PASSCODE below is a placeholder. The site owner must set it to a
 * real passcode before using this page. Even then, this is a client-side
 * gate on a static site: anyone who can read admin.js can read the
 * passcode, so it is OBSCURED, NOT SECURED. It keeps the page out of
 * casual view only. Real per-admin authentication needs a server —
 * see README.md (Option A: Vercel serverless + Google OAuth allowlist).
 * Do not put real athlete data in this file and do not commit a full
 * athlete CSV to the repo.
 */
var ADMIN_PASSCODE = 'kevinisablock';

(function () {
  'use strict';

  /* ---------- Exercise definitions ----------
   * Mapping from the investigation (admin-upload-feature-plan.md).
   * Squat to Jump Transition and Peak Force are BLOCKED: the ForceDecks
   * export used here has no matching columns, so no values are invented.
   * Asymmetry sign convention is UNCONFIRMED: "5.6 L" is read as -5.6
   * and "1.4 R" as +1.4. Confirm with the trainer before sharing. */
  var EXERCISES = [
    { id: 'relative-power', label: 'Relative Power', subtitle: 'Force Plate Testing: Relative power (W/KG)', unit: 'W/kg', column: 'Peak Power / BM [W/kg]', decimals: 1, available: true },
    { id: 'explosiveness', label: 'Explosiveness', subtitle: 'Force Plate Testing: RSI-M Value', unit: 'm/s', column: 'RSI-modified [m/s]', decimals: 2, available: true },
    { id: 'jump-height', label: 'Jump Height (in)', subtitle: 'Force Plate Testing: Jump Height in Inches', unit: 'in', column: 'Jump Height (Flight Time) in Inches [in]', decimals: 1, available: true, note: 'Uses Flight Time inches. Imp-Mom inches is the alternative column — confirm with the trainer.' },
    { id: 'asymmetry', label: 'Asymmetry', subtitle: 'Force Plate Testing: Concentric Impulse', unit: '%', column: 'Concentric Impulse % (Asym) (%)', decimals: 1, available: true, asymmetry: true, note: 'Sign convention unconfirmed: “L” is read as negative, “R” as positive.' },
    { id: 'squat-transition', label: 'Squat to Jump Transition', subtitle: 'Force Plate Testing: Eccentric Braking Impulse (n/s)', unit: 'n/s', column: null, decimals: 1, available: false, unavailableReason: 'Not available from this export — no Eccentric Braking Impulse column in the ForceDecks CSV.' },
    { id: 'peak-force', label: 'Peak Force', subtitle: 'Force Plate Testing: Concentric Peak Force (n)', unit: 'N', column: null, decimals: 0, available: false, unavailableReason: 'Not available from this export — no peak-force-in-Newtons column in the ForceDecks CSV.' }
  ];

  /* De-identified demo data. Values are taken from the September 2026
   * export with names removed (Demo Athlete A–E); it is for trying the
   * filters only. The full athlete CSV is never bundled with this site. */
  var SAMPLE_CSV =
    'Name,Test Type,Date,Peak Power / BM [W/kg] ,RSI-modified [m/s] ,Jump Height (Flight Time) in Inches [in] ,Concentric Impulse % (Asym) (%)\n' +
    'Demo Athlete A,CMJ,09/10/2026,46.2,0.34,12.1,24 R\n' +
    'Demo Athlete A,CMJ,09/24/2026,51.1,0.44,13.4,13 R\n' +
    'Demo Athlete B,CMJ,09/10/2026,53.7,0.47,15.7,8.5 R\n' +
    'Demo Athlete B,CMJ,09/22/2026,52.0,0.41,15.2,11 R\n' +
    'Demo Athlete C,CMJ,09/10/2026,50.8,0.33,11.8,1.4 L\n' +
    'Demo Athlete C,CMJ,09/24/2026,53.1,0.39,13.6,3.6 L\n' +
    'Demo Athlete D,CMJ,09/01/2026,42.9,0.26,9.3,17 R\n' +
    'Demo Athlete D,CMJ,09/11/2026,47.8,0.37,11.8,12 R\n' +
    'Demo Athlete D,CMJ,09/29/2026,46.4,0.36,12.0,12 R\n' +
    'Demo Athlete E,CMJ,09/11/2026,38.8,0.26,9.0,6.4 R\n' +
    'Demo Athlete E,CMJ,09/29/2026,39.2,0.24,8.4,2.9 R\n';

  /* ---------- CSV parsing ---------- */
  function parseCSVLine(line) {
    var out = [], cur = '', inQuotes = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; } else { inQuotes = false; }
        } else { cur += ch; }
      } else if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { out.push(cur); cur = ''; }
      else { cur += ch; }
    }
    out.push(cur);
    return out;
  }

  function parseCSV(text) {
    var lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(function (l) { return l.trim() !== ''; });
    if (lines.length < 2) return { headers: [], rows: [] };
    var headers = parseCSVLine(lines[0]).map(function (h) { return h.trim(); });
    var rows = [];
    for (var i = 1; i < lines.length; i++) {
      var vals = parseCSVLine(lines[i]);
      var row = {};
      headers.forEach(function (h, idx) { row[h] = (vals[idx] || '').trim(); });
      rows.push(row);
    }
    return { headers: headers, rows: rows };
  }

  function cleanName(raw) {
    return (raw || '').trim().replace(/\s+/g, ' ');
  }

  function splitName(full) {
    var parts = cleanName(full).split(' ');
    if (parts.length === 1) return { first: parts[0], last: '' };
    return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] };
  }

  /* "5.6 L" -> -5.6, "1.4 R" -> +1.4. Convention UNCONFIRMED — see header. */
  function parseAsymmetry(raw) {
    if (raw == null || raw === '') return null;
    var m = String(raw).trim().match(/^([\d.]+)\s*([LR])$/i);
    if (!m) { var n = parseFloat(raw); return isNaN(n) ? null : n; }
    var v = parseFloat(m[1]);
    return m[2].toUpperCase() === 'L' ? -v : v;
  }

  function parseDateISO(raw) {
    // ForceDecks dates are MM/DD/YYYY.
    var m = String(raw || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    var iso = m[3] + '-' + ('0' + m[1]).slice(-2) + '-' + ('0' + m[2]).slice(-2);
    var d = new Date(iso + 'T00:00:00');
    return isNaN(d.getTime()) ? null : iso;
  }

  function formatDateShort(iso) {
    var parts = iso.split('-');
    return parseInt(parts[1], 10) + '/' + parseInt(parts[2], 10);
  }

  function mean(nums) {
    if (!nums.length) return null;
    return nums.reduce(function (a, b) { return a + b; }, 0) / nums.length;
  }

  /* Build the dataset: CMJ rows only; duplicate trials on the same date
   * for the same athlete are averaged (noted in the UI). */
  function buildDataset(parsed, fileName) {
    var athletes = {}; // full name -> { first, last, byDate: { iso: [values per exercise id] } }
    var datesSet = {};
    var excluded = { nonCmj: 0, noDate: 0, noName: 0 };
    parsed.rows.forEach(function (row) {
      var name = cleanName(row['Name']);
      if (!name) { excluded.noName++; return; }
      if ((row['Test Type'] || '').trim().toUpperCase() !== 'CMJ') { excluded.nonCmj++; return; }
      var iso = parseDateISO(row['Date']);
      if (!iso) { excluded.noDate++; return; }
      datesSet[iso] = true;
      if (!athletes[name]) {
        var sp = splitName(name);
        athletes[name] = { first: sp.first, last: sp.last, byDate: {} };
      }
      if (!athletes[name].byDate[iso]) athletes[name].byDate[iso] = {};
      EXERCISES.forEach(function (ex) {
        if (!ex.available) return;
        var raw = row[ex.column];
        var val = ex.asymmetry ? parseAsymmetry(raw) : parseFloat(raw);
        if (val != null && !isNaN(val)) {
          if (!athletes[name].byDate[iso][ex.id]) athletes[name].byDate[iso][ex.id] = [];
          athletes[name].byDate[iso][ex.id].push(val);
        }
      });
    });
    var dates = Object.keys(datesSet).sort();
    return {
      athletes: athletes,
      dates: dates,
      fileName: fileName || 'uploaded file',
      rowCount: parsed.rows.length,
      excluded: excluded
    };
  }

  /* Pivot one exercise for a date window + athlete selection. */
  function pivotReport(dataset, exerciseId, startISO, endISO, selectedNames) {
    var ex = EXERCISES.filter(function (e) { return e.id === exerciseId; })[0];
    var dates = dataset.dates.filter(function (d) {
      return (!startISO || d >= startISO) && (!endISO || d <= endISO);
    });
    var names = Object.keys(dataset.athletes).sort(function (a, b) {
      var A = dataset.athletes[a], B = dataset.athletes[b];
      return (A.last + A.first).localeCompare(B.last + B.first);
    });
    if (selectedNames && selectedNames.length) {
      names = names.filter(function (n) { return selectedNames.indexOf(n) !== -1; });
    }
    var rows = [];
    names.forEach(function (name) {
      var a = dataset.athletes[name];
      var valuesByDate = dates.map(function (d) {
        var vals = (a.byDate[d] || {})[exerciseId];
        return vals && vals.length ? mean(vals) : null;
      });
      var present = valuesByDate.filter(function (v) { return v != null; });
      if (!present.length) return; // tested athletes only, in this window
      var personalAvg = mean(present);
      var first = present[0];
      var mostRecent = present[present.length - 1];
      var delta = null, deltaPoints = null;
      if (present.length > 1 && first !== 0) {
        if (ex.asymmetry) {
          deltaPoints = mostRecent - first;
        } else {
          delta = (mostRecent - first) / first * 100;
        }
      }
      rows.push({
        name: name, first: a.first, last: a.last,
        values: valuesByDate, personalAvg: personalAvg,
        mostRecent: mostRecent, delta: delta, deltaPoints: deltaPoints
      });
    });
    var teamAvg = mean(rows.map(function (r) { return r.personalAvg; }));
    return { exercise: ex, dates: dates, rows: rows, teamAvg: teamAvg };
  }

  function deltaClass(report, row) {
    var v = report.exercise.asymmetry ? row.deltaPoints : row.delta;
    if (v == null) return 'delta-na';
    var mag = Math.abs(v);
    if (report.exercise.asymmetry) {
      // For asymmetry, flag large point swings; same banding, in points.
      if (mag >= 10) return 'delta-big';
      if (mag >= 8) return 'delta-bad';
      if (mag >= 1) return v < 0 ? 'delta-warn' : 'delta-good';
      return 'delta-na';
    }
    if (v <= -8 || v >= 10) return v >= 10 ? 'delta-big' : 'delta-bad';
    if (v < -1) return 'delta-warn';
    if (v >= 1) return 'delta-good';
    return 'delta-na';
  }

  function formatNum(v, decimals) {
    if (v == null || isNaN(v)) return '—';
    return v.toFixed(decimals);
  }

  /* ---------- Browser UI (skipped under Node test harness) ---------- */
  var isBrowser = typeof document !== 'undefined' && typeof window !== 'undefined';

  if (isBrowser) {
    var state = { dataset: null, selected: null, sample: false };

    var $ = function (id) { return document.getElementById(id); };

    // Gate
    var gateForm = $('gate-form');
    var gateWarning = $('gate-setup-warning');
    if (ADMIN_PASSCODE === 'SET-YOUR-PASSCODE-HERE') {
      gateWarning.hidden = false;
    }
    gateForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (ADMIN_PASSCODE === 'SET-YOUR-PASSCODE-HERE') {
        $('gate-error').textContent = 'Passcode not set yet — set ADMIN_PASSCODE in admin.js first.';
        $('gate-error').hidden = false;
        return;
      }
      if ($('gate-passcode').value === ADMIN_PASSCODE) {
        $('gate').hidden = true;
        $('app').hidden = false;
        try { sessionStorage.setItem('sbf-admin-unlocked', '1'); } catch (err) {}
        $('file-input').focus();
      } else {
        $('gate-error').textContent = 'That passcode didn’t match. Try again.';
        $('gate-error').hidden = false;
      }
    });
    try {
      if (sessionStorage.getItem('sbf-admin-unlocked') === '1' && ADMIN_PASSCODE !== 'SET-YOUR-PASSCODE-HERE') {
        $('gate').hidden = true;
        $('app').hidden = false;
      }
    } catch (err) {}

    // Exercise picker
    var exerciseSelect = $('exercise-select');
    EXERCISES.forEach(function (ex) {
      var opt = document.createElement('option');
      opt.value = ex.id;
      opt.textContent = ex.available ? ex.label + ' (' + ex.unit + ')' : ex.label + ' — not available from this export';
      if (!ex.available) opt.disabled = true;
      exerciseSelect.appendChild(opt);
    });

    function currentFilters() {
      return {
        exerciseId: exerciseSelect.value,
        start: $('start-date').value || null,
        end: $('end-date').value || null,
        selected: state.selected // null = all
      };
    }

    function renderAthleteList() {
      var list = $('athlete-list');
      list.innerHTML = '';
      var q = ($('athlete-search').value || '').toLowerCase();
      var names = Object.keys(state.dataset.athletes).sort(function (a, b) {
        var A = state.dataset.athletes[a], B = state.dataset.athletes[b];
        return (A.last + A.first).localeCompare(B.last + B.first);
      });
      var shown = 0;
      names.forEach(function (name) {
        if (q && name.toLowerCase().indexOf(q) === -1) return;
        shown++;
        var label = document.createElement('label');
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = !state.selected || state.selected.indexOf(name) !== -1;
        cb.addEventListener('change', function () {
          if (!state.selected) state.selected = names.slice();
          if (cb.checked) { if (state.selected.indexOf(name) === -1) state.selected.push(name); }
          else { state.selected = state.selected.filter(function (n) { return n !== name; }); }
          updateAthleteCount();
          renderReport();
        });
        label.appendChild(cb);
        label.appendChild(document.createTextNode(' ' + name));
        list.appendChild(label);
      });
      if (!shown) list.innerHTML = '<p class="note">No athletes match that search.</p>';
      updateAthleteCount();
    }

    function updateAthleteCount() {
      var total = Object.keys(state.dataset.athletes).length;
      var sel = state.selected ? state.selected.length : total;
      $('athlete-count').textContent = sel + ' of ' + total + ' selected';
    }

    function renderReport() {
      if (!state.dataset) return;
      var f = currentFilters();
      var ex = EXERCISES.filter(function (e) { return e.id === f.exerciseId; })[0];
      $('exercise-note').textContent = ex.note || (ex.available ? '' : ex.unavailableReason);
      if (!ex.available) {
        $('print-area').hidden = true;
        $('empty-state').hidden = false;
        $('empty-state').textContent = ex.label + ' is not available from this export. ' + ex.unavailableReason;
        return;
      }
      var report = pivotReport(state.dataset, f.exerciseId, f.start, f.end, state.selected);
      var printArea = $('print-area');
      var emptyState = $('empty-state');
      if (!report.rows.length || !report.dates.length) {
        printArea.hidden = true;
        emptyState.hidden = false;
        emptyState.textContent = 'No athletes have ' + ex.label + ' results in the selected dates. Widen the date window or select more athletes.';
        return;
      }
      emptyState.hidden = true;
      printArea.hidden = false;

      $('report-title').textContent = ex.label;
      $('report-subtitle').textContent = ex.subtitle + '  •  Unit: ' + ex.unit;
      var startLabel = report.dates[0], endLabel = report.dates[report.dates.length - 1];
      $('report-meta').textContent =
        'Testing dates: ' + formatDateShort(startLabel) + ' – ' + formatDateShort(endLabel) + '  •  ' +
        report.rows.length + ' athlete' + (report.rows.length === 1 ? '' : 's') + '  •  ' +
        report.dates.length + ' test date' + (report.dates.length === 1 ? '' : 's');
      $('report-teamavg').textContent = 'Team Avg: ' + formatNum(report.teamAvg, ex.decimals) + ' ' + ex.unit +
        '  (average of personal averages)';

      var thead = $('report-thead');
      var trh = document.createElement('tr');
      ['First', 'Last'].concat(report.dates.map(formatDateShort))
        .concat(['Personal Avg.', ex.asymmetry ? 'Most Recent − First (pts)' : 'Most Recent vs Average'])
        .forEach(function (h) {
          var th = document.createElement('th');
          th.textContent = h;
          th.setAttribute('scope', 'col');
          trh.appendChild(th);
        });
      thead.innerHTML = '';
      thead.appendChild(trh);

      var tbody = $('report-tbody');
      tbody.innerHTML = '';
      report.rows.forEach(function (r) {
        var tr = document.createElement('tr');
        var tdFirst = document.createElement('td'); tdFirst.textContent = r.first; tr.appendChild(tdFirst);
        var tdLast = document.createElement('td'); tdLast.textContent = r.last; tr.appendChild(tdLast);
        r.values.forEach(function (v) {
          var td = document.createElement('td');
          td.className = 'num';
          td.textContent = v == null ? 'DNT' : formatNum(v, ex.decimals);
          tr.appendChild(td);
        });
        var tdAvg = document.createElement('td');
        tdAvg.className = 'num'; tdAvg.textContent = formatNum(r.personalAvg, ex.decimals);
        tr.appendChild(tdAvg);
        var tdDelta = document.createElement('td');
        tdDelta.className = 'num delta ' + deltaClass(report, r);
        if (ex.asymmetry) {
          tdDelta.textContent = r.deltaPoints == null ? '—' : (r.deltaPoints > 0 ? '+' : '') + r.deltaPoints.toFixed(1) + ' pts';
        } else {
          tdDelta.textContent = r.delta == null ? '—' : (r.delta > 0 ? '+' : '') + r.delta.toFixed(1) + '%';
        }
        tr.appendChild(tdDelta);
        tbody.appendChild(tr);
      });

      $('report-notes').textContent = ex.asymmetry
        ? 'Asymmetry is shown as a signed %: “L” values are read as negative and “R” as positive — this sign convention is unconfirmed, confirm with the trainer before sharing.'
        : '';
      $('report-source').textContent = 'Source: ' + state.dataset.fileName +
        (state.sample ? ' (de-identified sample data)' : '') +
        '  •  Generated in your browser on ' + new Date().toLocaleDateString() +
        '  •  ' + state.dataset.rowCount + ' CSV rows; ' + state.dataset.excluded.nonCmj + ' non-CMJ row(s) excluded.';
    }

    function loadDataset(parsed, fileName, isSample) {
      var ds = buildDataset(parsed, fileName);
      if (!ds.dates.length) {
        var err = $('upload-error');
        err.textContent = 'Could not find any CMJ results with a valid date in that file. Check it is a Vald ForceDecks export.';
        err.hidden = false;
        return;
      }
      $('upload-error').hidden = true;
      state.dataset = ds;
      state.sample = !!isSample;
      state.selected = null;
      $('start-date').value = ds.dates[0];
      $('end-date').value = ds.dates[ds.dates.length - 1];
      $('start-date').min = ds.dates[0];
      $('start-date').max = ds.dates[ds.dates.length - 1];
      $('end-date').min = ds.dates[0];
      $('end-date').max = ds.dates[ds.dates.length - 1];
      $('file-status').textContent = 'Loaded: ' + ds.fileName + ' — ' + ds.rowCount + ' rows, ' +
        Object.keys(ds.athletes).length + ' athletes, ' + ds.dates.length + ' test dates (' +
        formatDateShort(ds.dates[0]) + '–' + formatDateShort(ds.dates[ds.dates.length - 1]) + ').';
      $('data-summary').hidden = false;
      $('data-summary').textContent = 'Data loaded. Pick an exercise and adjust the filters — the report updates automatically.';
      $('filters').hidden = false;
      $('clear-btn').disabled = false;
      renderAthleteList();
      renderReport();
    }

    function loadFile(file) {
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () { loadDataset(parseCSV(String(reader.result)), file.name, false); };
      reader.onerror = function () {
        var err = $('upload-error');
        err.textContent = 'Could not read that file. Try choosing it again.';
        err.hidden = false;
      };
      reader.readAsText(file);
    }

    // Upload wiring
    $('file-input').addEventListener('change', function (e) { loadFile(e.target.files[0]); });
    var dz = $('dropzone');
    ['dragenter', 'dragover'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('drag-over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('drag-over'); });
    });
    dz.addEventListener('drop', function (e) {
      if (e.dataTransfer.files && e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
    });
    dz.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('file-input').click(); }
    });
    $('sample-btn').addEventListener('click', function () {
      loadDataset(parseCSV(SAMPLE_CSV), 'sample-September-2026.csv', true);
    });
    $('clear-btn').addEventListener('click', function () {
      state.dataset = null; state.selected = null; state.sample = false;
      $('file-input').value = '';
      $('file-status').textContent = 'No file loaded yet.';
      $('data-summary').hidden = true;
      $('filters').hidden = true;
      $('print-area').hidden = true;
      $('empty-state').hidden = false;
      $('empty-state').textContent = 'Upload a CSV or load the sample data to see a report.';
      $('clear-btn').disabled = true;
    });

    // Filter wiring
    ['start-date', 'end-date'].forEach(function (id) {
      $(id).addEventListener('change', renderReport);
    });
    $('reset-dates-btn').addEventListener('click', function () {
      if (!state.dataset) return;
      $('start-date').value = state.dataset.dates[0];
      $('end-date').value = state.dataset.dates[state.dataset.dates.length - 1];
      renderReport();
    });
    exerciseSelect.addEventListener('change', renderReport);
    $('athlete-search').addEventListener('input', renderAthleteList);
    $('select-all-btn').addEventListener('click', function () {
      if (!state.dataset) return;
      state.selected = Object.keys(state.dataset.athletes);
      renderAthleteList(); renderReport();
    });
    $('clear-athletes-btn').addEventListener('click', function () {
      state.selected = [];
      renderAthleteList(); renderReport();
    });
    $('print-btn').addEventListener('click', function () { window.print(); });
  }

  // Testable surface (used by the local Node test harness; harmless in browser).
  var api = {
    ADMIN_PASSCODE: ADMIN_PASSCODE, EXERCISES: EXERCISES, SAMPLE_CSV: SAMPLE_CSV,
    parseCSV: parseCSV, cleanName: cleanName, splitName: splitName,
    parseAsymmetry: parseAsymmetry, parseDateISO: parseDateISO,
    buildDataset: buildDataset, pivotReport: pivotReport, deltaClass: deltaClass
  };
  if (typeof window !== 'undefined') { window.AdminReport = api; }
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
})();
