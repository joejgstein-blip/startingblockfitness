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
    // Strip BOM / surrounding quotes (CSV exports), trim, collapse whitespace.
    // Handles "Nala Annes " (trailing space) and "Tommy  Corwin" (double space).
    return (raw || '').replace(/\uFEFF/g, '').trim().replace(/^"+|"+$/g, '').trim().replace(/\s+/g, ' ');
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

  /* ---------- Roster parsing ----------
   * Only given-name, family-name, Category 1 (org) and Group 1 (team) are
   * kept. Date of birth, email, vald-id, weight/height and all other roster
   * columns are deliberately NOT read or stored. Roster data lives only in
   * the browser session (in-memory) — never sent anywhere, never persisted.
   * Blank org/team become "Unassigned". Category 2 / Group 2 are almost
   * entirely blank in the 9/30 export and are not used. */
  var UNASSIGNED = 'Unassigned';

  function rosterExportDate(fileName) {
    var m = String(fileName || '').match(/(\d{4})[-_](\d{2})[-_](\d{2})/);
    return m ? m[1] + '-' + m[2] + '-' + m[3] : null;
  }

  function parseRoster(parsed, fileName) {
    var athletes = {}; // normalized full name -> { first, last, full, org, team }
    var orgCounts = {}, teamCounts = {}, orgTeams = {};
    var duplicates = 0, skipped = 0;
    parsed.rows.forEach(function (row) {
      var first = cleanName(row['given-name']);
      var last = cleanName(row['family-name']);
      if (!first && !last) { skipped++; return; }
      var full = cleanName(first + ' ' + last);
      if (!full) { skipped++; return; }
      if (athletes[full]) { duplicates++; return; }
      var org = (row['Category 1'] || '').trim() || UNASSIGNED;
      var team = (row['Group 1'] || '').trim() || UNASSIGNED;
      athletes[full] = { first: first, last: last, full: full, org: org, team: team };
      orgCounts[org] = (orgCounts[org] || 0) + 1;
      teamCounts[team] = (teamCounts[team] || 0) + 1;
      if (!orgTeams[org]) orgTeams[org] = {};
      orgTeams[org][team] = (orgTeams[org][team] || 0) + 1;
    });
    var list = Object.keys(athletes).sort(function (a, b) {
      var A = athletes[a], B = athletes[b];
      return (A.last + A.first).localeCompare(B.last + B.first);
    });
    return {
      athletes: athletes, list: list, fileName: fileName || 'roster file',
      exportDate: rosterExportDate(fileName),
      total: list.length, orgCounts: orgCounts, teamCounts: teamCounts,
      orgTeams: orgTeams, duplicates: duplicates, skipped: skipped
    };
  }

  /* Names in the test export that have no roster entry (should be 0 for the
   * 9/30 files; surfaced in the UI status area, never silently dropped). */
  function matchRoster(dataset, roster) {
    var unmatched = [], matched = 0;
    Object.keys(dataset.athletes).forEach(function (name) {
      if (roster.athletes[name]) matched++;
      else unmatched.push(name);
    });
    var untested = roster.list.filter(function (name) { return !dataset.athletes[name]; });
    return { matched: matched, unmatched: unmatched.sort(), untestedCount: untested.length };
  }

  /* Mean per date column over athletes with a value that date only (DNT is
   * never counted as zero), plus the mean of personal averages. */
  function computeAvgRow(rows, dates) {
    var values = dates.map(function (d, i) {
      var vals = rows.map(function (r) { return r.values[i]; }).filter(function (v) { return v != null; });
      return mean(vals);
    });
    var overall = mean(rows.map(function (r) { return r.personalAvg; }).filter(function (v) { return v != null; }));
    return { values: values, overall: overall, n: rows.length };
  }

  function computePerTeamRows(rows, dates, roster) {
    var byTeam = {};
    rows.forEach(function (r) {
      var team = (roster.athletes[r.name] || {}).team || UNASSIGNED;
      if (!byTeam[team]) byTeam[team] = [];
      byTeam[team].push(r);
    });
    return Object.keys(byTeam).sort().map(function (team) {
      var avg = computeAvgRow(byTeam[team], dates);
      return { team: team, values: avg.values, overall: avg.overall, n: byTeam[team].length };
    });
  }

  /* ---------- Analytics data (pure — testable in Node) ----------
   * Same filtered report in, chart-ready data out. Trend values are the
   * table's per-date team averages; athlete-vs-team diffs are personal
   * average minus the (filtered) team average; ranking is by personal
   * average, descending. DNT rows are excluded everywhere — averages are
   * over athletes with a value only, never counting DNT as zero. */
  function buildAnalyticsData(report, maxOverlay) {
    var tested = report.rows.filter(function (r) { return !r.isDNT; });
    var trend = {
      dates: report.dates,
      teamValues: report.teamAvgRow ? report.teamAvgRow.values.slice()
        : report.dates.map(function () { return null; }),
      athletes: tested.slice(0, maxOverlay || 5).map(function (r) {
        return { name: r.name, values: r.values.slice() };
      }),
      overlayTotal: tested.length
    };
    var vsTeam = tested.map(function (r) {
      return {
        name: r.name, first: r.first, last: r.last,
        personalAvg: r.personalAvg, teamAvg: report.teamAvg,
        diff: report.teamAvg == null ? null : r.personalAvg - report.teamAvg
      };
    });
    var ranking = tested.slice().sort(function (a, b) { return b.personalAvg - a.personalAvg; })
      .map(function (r) { return { name: r.name, first: r.first, last: r.last, personalAvg: r.personalAvg }; });
    return { trend: trend, vsTeam: vsTeam, ranking: ranking, teamAvg: report.teamAvg };
  }

  /* Pivot one exercise for a date window + athlete selection. */
  function pivotReport(dataset, exerciseId, startISO, endISO, selectedNames, opts) {
    var ex = EXERCISES.filter(function (e) { return e.id === exerciseId; })[0];
    var dates = dataset.dates.filter(function (d) {
      return (!startISO || d >= startISO) && (!endISO || d <= endISO);
    });
    var opts2 = opts || {};
    var roster = opts2.roster || null;
    var org = opts2.org || '';
    var team = opts2.team || '';
    var showDNT = !!opts2.showDNT;
    var perTeam = !!(roster && opts2.perTeam);
    // Candidate names: roster athletes in the selected org/team when a roster
    // is loaded, otherwise the tested athletes from the CSV.
    var names;
    if (roster) {
      names = roster.list.filter(function (n) {
        var r = roster.athletes[n];
        return (!org || r.org === org) && (!team || r.team === team);
      });
    } else {
      names = Object.keys(dataset.athletes).sort(function (a, b) {
        var A = dataset.athletes[a], B = dataset.athletes[b];
        return (A.last + A.first).localeCompare(B.last + B.first);
      });
    }
    if (selectedNames && selectedNames.length) {
      names = names.filter(function (n) { return selectedNames.indexOf(n) !== -1; });
    }
    var rows = [];
    var dntCount = 0;
    names.forEach(function (name) {
      var a = dataset.athletes[name];
      var firstName, lastName, rOrg, rTeam;
      if (a) { firstName = a.first; lastName = a.last; }
      else if (roster && roster.athletes[name]) {
        firstName = roster.athletes[name].first; lastName = roster.athletes[name].last;
      } else { var sp = splitName(name); firstName = sp.first; lastName = sp.last; }
      if (roster && roster.athletes[name]) { rOrg = roster.athletes[name].org; rTeam = roster.athletes[name].team; }
      var valuesByDate = dates.map(function (d) {
        if (!a) return null;
        var vals = (a.byDate[d] || {})[exerciseId];
        return vals && vals.length ? mean(vals) : null;
      });
      var present = valuesByDate.filter(function (v) { return v != null; });
      if (!present.length) {
        // No tests in this window. With a roster + DNT on, show the athlete
        // as DNT instead of dropping them. Without a roster, keep the old
        // behaviour (tested athletes only).
        if (roster && showDNT) {
          dntCount++;
          rows.push({
            name: name, first: firstName, last: lastName, org: rOrg, team: rTeam,
            values: valuesByDate, personalAvg: null,
            mostRecent: null, delta: null, deltaPoints: null, isDNT: true
          });
        }
        return;
      }
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
        name: name, first: firstName, last: lastName, org: rOrg, team: rTeam,
        values: valuesByDate, personalAvg: personalAvg,
        mostRecent: mostRecent, delta: delta, deltaPoints: deltaPoints, isDNT: false
      });
    });
    var testedRows = rows.filter(function (r) { return !r.isDNT; });
    // Header Team Avg: mean of personal averages over the currently filtered
    // set only (DNT rows excluded — they have no average).
    var teamAvg = mean(testedRows.map(function (r) { return r.personalAvg; }));
    var teamAvgRow = testedRows.length ? computeAvgRow(testedRows, dates) : null;
    var perTeamRows = perTeam ? computePerTeamRows(testedRows, dates, roster) : [];
    return {
      exercise: ex, dates: dates, rows: rows, teamAvg: teamAvg,
      teamAvgRow: teamAvgRow, perTeamRows: perTeamRows,
      dntCount: dntCount, testedCount: testedRows.length
    };
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
    var state = {
      dataset: null, selected: null, sample: false,
      roster: null, rosterFileName: null, rosterRefreshedAt: null,
      org: '', team: '', showDNT: false,
      showTeamAvgRow: true, perTeamAvg: false,
      view: 'table' // 'table' | 'analytics'
    };

    /* Candidate athlete names for the current org/team filter. Roster names
     * when a roster is loaded, otherwise the tested athletes from the CSV. */
    function filteredBaseNames() {
      if (!state.dataset) return [];
      if (!state.roster) {
        return Object.keys(state.dataset.athletes).sort(function (a, b) {
          var A = state.dataset.athletes[a], B = state.dataset.athletes[b];
          return (A.last + A.first).localeCompare(B.last + B.first);
        });
      }
      return state.roster.list.filter(function (n) {
        var r = state.roster.athletes[n];
        return (!state.org || r.org === state.org) && (!state.team || r.team === state.team);
      });
    }

    function refreshOrgTeamOptions() {
      var orgSel = $('org-select'), teamSel = $('team-select');
      var prevOrg = state.org, prevTeam = state.team;
      orgSel.innerHTML = '';
      teamSel.innerHTML = '';
      function addOpt(sel, value, label) {
        var opt = document.createElement('option');
        opt.value = value; opt.textContent = label;
        sel.appendChild(opt);
      }
      addOpt(orgSel, '', 'All orgs');
      addOpt(teamSel, '', 'All teams');
      if (state.roster) {
        Object.keys(state.roster.orgCounts).sort().forEach(function (org) {
          addOpt(orgSel, org, org + ' (' + state.roster.orgCounts[org] + ')');
        });
        var teams = state.roster.orgTeams[prevOrg] || state.roster.teamCounts;
        Object.keys(teams).sort().forEach(function (team) {
          addOpt(teamSel, team, team + ' (' + teams[team] + ')');
        });
      }
      orgSel.value = state.roster && state.roster.orgCounts[prevOrg] ? prevOrg : '';
      state.org = orgSel.value;
      var teamsNow = state.roster ? (state.roster.orgTeams[state.org] || state.roster.teamCounts) : {};
      teamSel.value = state.roster && teamsNow[prevTeam] ? prevTeam : '';
      state.team = teamSel.value;
      var dnt = $('show-dnt-toggle');
      dnt.disabled = !state.roster;
      dnt.checked = !!state.roster && state.showDNT;
      var perTeam = $('per-team-avg');
      perTeam.disabled = !state.roster;
      perTeam.checked = !!state.roster && state.perTeamAvg;
      $('roster-filter-note').textContent = state.roster
        ? 'Roster: ' + state.roster.total + ' athletes. Team options narrow to the selected org.'
        : 'Load an athlete roster to filter by org and team.';
    }

    function updateRosterStatus() {
      var el = $('roster-status');
      if (!state.roster) {
        el.textContent = 'No roster loaded. Reports show tested athletes only.';
        return;
      }
      var r = state.roster;
      var orgBits = Object.keys(r.orgCounts).sort().map(function (o) { return o + ' ' + r.orgCounts[o]; }).join(', ');
      el.textContent = 'Loaded: ' + r.fileName +
        (r.exportDate ? ' (export ' + r.exportDate + ')' : '') +
        ' — ' + r.total + ' athletes. Orgs: ' + orgBits + '.' +
        ' Last refreshed: ' + (state.rosterRefreshedAt || '—') + '.';
      if (state.dataset) {
        var m = matchRoster(state.dataset, r);
        if (m.unmatched.length) {
          el.textContent += ' Warning: ' + m.unmatched.length + ' tested name(s) not in the roster.';
        }
      }
    }

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
      var names = filteredBaseNames();
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
        var text = ' ' + name;
        // Mark roster athletes with no tests in the loaded export.
        if (state.roster && !state.dataset.athletes[name]) text += ' (no tests)';
        label.appendChild(document.createTextNode(text));
        list.appendChild(label);
      });
      if (!shown) list.innerHTML = '<p class="note">No athletes match that search.</p>';
      updateAthleteCount();
    }

    function updateAthleteCount() {
      var total = filteredBaseNames().length;
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
        $('analytics-area').hidden = true;
        document.body.classList.remove('show-analytics');
        $('empty-state').hidden = false;
        $('empty-state').textContent = ex.label + ' is not available from this export. ' + ex.unavailableReason;
        return;
      }
      var report = pivotReport(state.dataset, f.exerciseId, f.start, f.end, state.selected, {
        roster: state.roster, org: state.org, team: state.team,
        showDNT: state.showDNT, perTeam: state.perTeamAvg
      });
      var printArea = $('print-area');
      var emptyState = $('empty-state');
      if (!report.rows.length || !report.dates.length) {
        printArea.hidden = true;
        $('analytics-area').hidden = true;
        document.body.classList.remove('show-analytics');
        emptyState.hidden = false;
        emptyState.textContent = 'No athletes have ' + ex.label + ' results in the selected dates. Widen the date window or select more athletes.';
        return;
      }
      emptyState.hidden = true;

      // What the filtered set covers — the header Team Avg reflects this set
      // only (date window + exercise + org/team + selected athletes), never
      // the whole roster or the whole export.
      var scopeBits = [];
      if (state.roster) {
        scopeBits.push(state.org || 'All orgs');
        scopeBits.push(state.team || 'All teams');
      }
      var scopeLabel = scopeBits.length ? scopeBits.join(' — ') : 'All tested athletes';
      $('report-title').textContent = ex.label;
      $('report-subtitle').textContent = ex.subtitle + '  •  Unit: ' + ex.unit;
      var startLabel = report.dates[0], endLabel = report.dates[report.dates.length - 1];
      $('report-meta').textContent =
        'Testing dates: ' + formatDateShort(startLabel) + ' – ' + formatDateShort(endLabel) + '  •  ' +
        scopeLabel + '  •  ' +
        report.rows.length + ' athlete' + (report.rows.length === 1 ? '' : 's') +
        (report.dntCount ? ' (' + report.dntCount + ' DNT)' : '') + '  •  ' +
        report.dates.length + ' test date' + (report.dates.length === 1 ? '' : 's');
      $('report-teamavg').textContent = 'Team Avg: ' + formatNum(report.teamAvg, ex.decimals) + ' ' + ex.unit +
        '  (average of personal averages — ' + scopeLabel + ', ' +
        report.testedCount + ' athlete' + (report.testedCount === 1 ? '' : 's') + ' with results)';

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

      // Team-average rows (footer). Per-date means count only athletes with
      // a value that date — DNT is never counted as zero. Included in print.
      var tfoot = $('report-tfoot');
      tfoot.innerHTML = '';
      function avgRowCells(label, avg) {
        var tr = document.createElement('tr');
        tr.className = 'avg-row';
        var tdLabel = document.createElement('td');
        tdLabel.colSpan = 2; tdLabel.textContent = label;
        tr.appendChild(tdLabel);
        avg.values.forEach(function (v) {
          var td = document.createElement('td');
          td.className = 'num'; td.textContent = v == null ? '—' : formatNum(v, ex.decimals);
          tr.appendChild(td);
        });
        var tdOverall = document.createElement('td');
        tdOverall.className = 'num'; tdOverall.textContent = avg.overall == null ? '—' : formatNum(avg.overall, ex.decimals);
        tr.appendChild(tdOverall);
        var tdDelta = document.createElement('td');
        tdDelta.className = 'num'; tdDelta.textContent = '—';
        tr.appendChild(tdDelta);
        return tr;
      }
      if (state.showTeamAvgRow && report.teamAvgRow) {
        tfoot.appendChild(avgRowCells('Team Avg (' + report.testedCount + ' athletes)', report.teamAvgRow));
      }
      if (state.perTeamAvg && state.roster) {
        report.perTeamRows.forEach(function (pr) {
          tfoot.appendChild(avgRowCells('Avg — ' + pr.team + ' (' + pr.n + ')', pr));
        });
      }

      $('report-notes').textContent = (ex.asymmetry
        ? 'Asymmetry is shown as a signed %: “L” values are read as negative and “R” as positive — this sign convention is unconfirmed, confirm with the trainer before sharing. '
        : '') +
        (state.roster && report.dntCount
          ? 'DNT = athlete is on the roster for the selected org/team but did not test in the selected dates. '
          : '');
      $('report-source').textContent = 'Source: ' + state.dataset.fileName +
        (state.sample ? ' (de-identified sample data)' : '') +
        (state.roster ? '  •  Roster: ' + state.roster.fileName + ' (' + state.roster.total + ' athletes' +
          (state.roster.exportDate ? ', export ' + state.roster.exportDate : '') + ')' : '') +
        '  •  Generated in your browser on ' + new Date().toLocaleDateString() +
        '  •  ' + state.dataset.rowCount + ' CSV rows; ' + state.dataset.excluded.nonCmj + ' non-CMJ row(s) excluded.';

      // Show whichever view is active (table or analytics). Print follows
      // the visible view — see the print stylesheet and body.show-analytics.
      if (state.view === 'analytics') {
        printArea.hidden = true;
        $('analytics-area').hidden = false;
        document.body.classList.add('show-analytics');
        renderAnalytics(report, ex, scopeLabel, startLabel, endLabel);
      } else {
        printArea.hidden = false;
        $('analytics-area').hidden = true;
        document.body.classList.remove('show-analytics');
      }
    }

    /* ---------- Analytics view (inline SVG, no chart library) ---------- */
    var SVGNS = 'http://www.w3.org/2000/svg';
    var ATHLETE_COLORS = ['#0e7a6b', '#b7791f', '#6b46c1', '#2b6cb0', '#718096'];

    function svgEl(tag, attrs, parent) {
      var el = document.createElementNS(SVGNS, tag);
      Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
      if (parent) parent.appendChild(el);
      return el;
    }
    function svgText(parent, x, y, text, attrs) {
      var t = svgEl('text', Object.assign({ x: x, y: y }, attrs || {}), parent);
      t.textContent = text;
      return t;
    }
    function linePath(pts) {
      // pts: [{x, y} | null] — break the line across nulls (DNT / no test).
      var d = '', pen = false;
      pts.forEach(function (p) {
        if (!p) { pen = false; return; }
        d += (pen ? ' L' : ' M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1);
        pen = true;
      });
      return d;
    }
    function axisTicks(min, max, count) {
      var ticks = [], i;
      for (i = 0; i <= count; i++) ticks.push(min + (max - min) * i / count);
      return ticks;
    }

    function renderTrendChart(container, data, ex) {
      container.innerHTML = '';
      var dates = data.trend.dates;
      var allVals = data.trend.teamValues.concat(
        data.trend.athletes.reduce(function (acc, a) { return acc.concat(a.values); }, [])
      ).filter(function (v) { return v != null; });
      if (!allVals.length || !dates.length) {
        container.innerHTML = '<p class="note">No values to chart in this window.</p>';
        return;
      }
      var min = Math.min.apply(null, allVals), max = Math.max.apply(null, allVals);
      var pad = (max - min) * 0.15 || 1;
      min -= pad; max += pad;
      var W = 760, H = 300, L = 58, R = 18, T = 18, B = 36;
      var svg = svgEl('svg', {
        viewBox: '0 0 ' + W + ' ' + H, class: 'chart-svg', role: 'img',
        'aria-label': 'Line chart of team average per test date'
      }, container);
      var x = function (i) { return dates.length === 1 ? W / 2 : L + i * (W - L - R) / (dates.length - 1); };
      var y = function (v) { return T + (1 - (v - min) / (max - min)) * (H - T - B); };
      axisTicks(min, max, 4).forEach(function (t) {
        svgEl('line', { x1: L, x2: W - R, y1: y(t), y2: y(t), stroke: '#e3e8ef', 'stroke-width': 1 }, svg);
        svgText(svg, L - 8, y(t) + 4, t.toFixed(ex.decimals), { 'text-anchor': 'end', 'font-size': 11, fill: '#5a6a7d' });
      });
      dates.forEach(function (d, i) {
        svgText(svg, x(i), H - 10, formatDateShort(d), { 'text-anchor': 'middle', 'font-size': 11, fill: '#5a6a7d' });
      });
      // Athlete overlays first (underneath), team line on top.
      data.trend.athletes.forEach(function (a, ai) {
        var pts = a.values.map(function (v, i) { return v == null ? null : { x: x(i), y: y(v) }; });
        svgEl('path', { d: linePath(pts), fill: 'none', stroke: ATHLETE_COLORS[ai % ATHLETE_COLORS.length], 'stroke-width': 1.5 }, svg);
        pts.forEach(function (p) {
          if (p) svgEl('circle', { cx: p.x, cy: p.y, r: 3, fill: ATHLETE_COLORS[ai % ATHLETE_COLORS.length] }, svg);
        });
      });
      var teamPts = data.trend.teamValues.map(function (v, i) { return v == null ? null : { x: x(i), y: y(v) }; });
      svgEl('path', { d: linePath(teamPts), fill: 'none', stroke: '#0f2040', 'stroke-width': 2.5 }, svg);
      teamPts.forEach(function (p) {
        if (p) svgEl('circle', { cx: p.x, cy: p.y, r: 4, fill: '#0f2040' }, svg);
      });
      // Legend
      var legend = $('trend-legend');
      legend.innerHTML = '';
      function legendItem(color, label) {
        var s = document.createElement('span');
        s.className = 'legend-item';
        var sw = document.createElement('span');
        sw.className = 'legend-swatch';
        sw.style.background = color;
        s.appendChild(sw);
        s.appendChild(document.createTextNode(' ' + label));
        legend.appendChild(s);
      }
      legendItem('#0f2040', 'Team average');
      data.trend.athletes.forEach(function (a, ai) {
        legendItem(ATHLETE_COLORS[ai % ATHLETE_COLORS.length], a.name);
      });
      if (data.trend.overlayTotal > data.trend.athletes.length) {
        var note = document.createElement('span');
        note.className = 'note';
        note.textContent = 'Showing ' + data.trend.athletes.length + ' of ' + data.trend.overlayTotal +
          ' athletes — narrow the athlete selection to compare specific athletes.';
        legend.appendChild(note);
      }
    }

    function renderVsTeamChart(container, data, ex) {
      container.innerHTML = '';
      var rows = data.vsTeam.slice().sort(function (a, b) { return (a.last + a.first).localeCompare(b.last + b.first); });
      if (!rows.length || data.teamAvg == null) {
        container.innerHTML = '<p class="note">No athletes to compare in this window.</p>';
        return;
      }
      var vals = rows.map(function (r) { return r.personalAvg; }).concat([data.teamAvg]);
      var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
      var pad = (max - min) * 0.15 || 1;
      min -= pad; max += pad;
      var rowH = 26, W = 760, L = 150, R = 90, T = 10, B = 30;
      var H = T + rows.length * rowH + B;
      var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'chart-svg', role: 'img', 'aria-label': 'Dot chart of personal averages vs team average' }, container);
      var x = function (v) { return L + (v - min) / (max - min) * (W - L - R); };
      axisTicks(min, max, 4).forEach(function (t) {
        svgEl('line', { x1: x(t), x2: x(t), y1: T, y2: T + rows.length * rowH, stroke: '#e3e8ef', 'stroke-width': 1 }, svg);
        svgText(svg, x(t), T + rows.length * rowH + 18, t.toFixed(ex.decimals), { 'text-anchor': 'middle', 'font-size': 11, fill: '#5a6a7d' });
      });
      // Team-average reference line.
      svgEl('line', { x1: x(data.teamAvg), x2: x(data.teamAvg), y1: T, y2: T + rows.length * rowH, stroke: '#0f2040', 'stroke-width': 2, 'stroke-dasharray': '6 4' }, svg);
      rows.forEach(function (r, i) {
        var cy = T + i * rowH + rowH / 2;
        svgText(svg, L - 8, cy + 4, r.first + ' ' + r.last, { 'text-anchor': 'end', 'font-size': 12, fill: '#1a2332' });
        svgEl('circle', { cx: x(r.personalAvg), cy: cy, r: 5, fill: '#0e7a6b' }, svg);
        var diff = r.diff == null ? '—' : (r.diff > 0 ? '+' : '') + r.diff.toFixed(ex.decimals);
        svgText(svg, W - R + 8, cy + 4, diff + ' ' + ex.unit, { 'font-size': 12, fill: r.diff != null && r.diff >= 0 ? '#137333' : '#7a271a', 'font-weight': 700 });
      });
      var cap = document.createElement('p');
      cap.className = 'note';
      cap.textContent = 'Dashed line = team average ' + data.teamAvg.toFixed(ex.decimals) + ' ' + ex.unit +
        '. Difference = personal average minus team average.';
      container.appendChild(cap);
    }

    function renderRankingChart(container, data, ex) {
      container.innerHTML = '';
      var rows = data.ranking;
      if (!rows.length || data.teamAvg == null) {
        container.innerHTML = '<p class="note">No athletes to rank in this window.</p>';
        return;
      }
      var max = Math.max.apply(null, rows.map(function (r) { return r.personalAvg; }).concat([data.teamAvg]));
      var rowH = 24, W = 760, L = 150, R = 60, T = 10, B = 30;
      var H = T + rows.length * rowH + B;
      var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'chart-svg', role: 'img', 'aria-label': 'Ranked bar chart of personal averages' }, container);
      var x = function (v) { return L + v / (max * 1.05) * (W - L - R); };
      axisTicks(0, max * 1.05, 4).forEach(function (t) {
        svgEl('line', { x1: x(t), x2: x(t), y1: T, y2: T + rows.length * rowH, stroke: '#e3e8ef', 'stroke-width': 1 }, svg);
        svgText(svg, x(t), T + rows.length * rowH + 18, t.toFixed(0), { 'text-anchor': 'middle', 'font-size': 11, fill: '#5a6a7d' });
      });
      svgEl('line', { x1: x(data.teamAvg), x2: x(data.teamAvg), y1: T, y2: T + rows.length * rowH, stroke: '#0f2040', 'stroke-width': 2, 'stroke-dasharray': '6 4' }, svg);
      rows.forEach(function (r, i) {
        var y0 = T + i * rowH + 4;
        svgText(svg, L - 8, y0 + 11, r.first + ' ' + r.last, { 'text-anchor': 'end', 'font-size': 12, fill: '#1a2332' });
        svgEl('rect', { x: L, y: y0, width: Math.max(1, x(r.personalAvg) - L), height: 14, fill: '#0e7a6b', rx: 2 }, svg);
        svgText(svg, x(r.personalAvg) + 6, y0 + 11, r.personalAvg.toFixed(ex.decimals), { 'font-size': 12, fill: '#1a2332' });
      });
      var cap = document.createElement('p');
      cap.className = 'note';
      cap.textContent = 'Ranked by personal average, highest first. Dashed line = team average ' +
        data.teamAvg.toFixed(ex.decimals) + ' ' + ex.unit + '.';
      container.appendChild(cap);
    }

    function renderAnalytics(report, ex, scopeLabel, startISO, endISO) {
      var data = buildAnalyticsData(report, 5);
      $('analytics-title').textContent = 'Analytics — ' + ex.label;
      $('analytics-meta').textContent =
        ex.subtitle + '  •  Unit: ' + ex.unit + '  •  ' +
        'Testing dates: ' + formatDateShort(startISO) + ' – ' + formatDateShort(endISO) + '  •  ' +
        scopeLabel + '  •  ' + data.vsTeam.length + ' athlete' + (data.vsTeam.length === 1 ? '' : 's') + ' with results' +
        (report.dntCount ? ' (' + report.dntCount + ' DNT, not counted in averages)' : '') +
        '  •  Team Avg: ' + (data.teamAvg == null ? '—' : data.teamAvg.toFixed(ex.decimals) + ' ' + ex.unit);
      $('analytics-source').textContent = 'Source: ' + state.dataset.fileName +
        (state.sample ? ' (de-identified sample data)' : '') +
        (state.roster ? '  •  Roster: ' + state.roster.fileName + ' (' + state.roster.total + ' athletes)' : '') +
        '  •  Generated in your browser on ' + new Date().toLocaleDateString() + '.';
      $('trend-sub').textContent = 'Team average per test date' +
        (data.trend.athletes.length ? ', with each selected athlete’s own values overlaid (up to 5).' : '.');
      $('vsteam-sub').textContent = 'Each athlete’s personal average against the team average for this window.';
      $('ranking-sub').textContent = 'Athletes ranked by personal average for this window.';
      renderTrendChart($('trend-chart'), data, ex);
      renderVsTeamChart($('vsteam-chart'), data, ex);
      renderRankingChart($('ranking-chart'), data, ex);
    }

    function setView(view) {
      state.view = view;
      $('view-table-btn').classList.toggle('active', view === 'table');
      $('view-analytics-btn').classList.toggle('active', view === 'analytics');
      $('view-table-btn').setAttribute('aria-pressed', view === 'table' ? 'true' : 'false');
      $('view-analytics-btn').setAttribute('aria-pressed', view === 'analytics' ? 'true' : 'false');
      if (state.dataset) renderReport();
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
      refreshOrgTeamOptions();
      updateRosterStatus();
      renderAthleteList();
      renderReport();
    }

    /* ---------- Roster upload / refresh ----------
     * Replaces the in-memory roster and repopulates every filter. Roster
     * data is never sent anywhere and never persisted — refresh simply
     * loads a newer CSV file into the same in-memory slot. */
    function loadRoster(parsed, fileName) {
      var r = parseRoster(parsed, fileName);
      if (!r.total) {
        var err = $('roster-error');
        err.textContent = 'Could not find any athletes in that roster file. Check it is a Vald athlete export with given-name / family-name columns.';
        err.hidden = false;
        return;
      }
      $('roster-error').hidden = true;
      state.roster = r;
      state.rosterFileName = fileName;
      state.rosterRefreshedAt = new Date().toLocaleString();
      state.org = ''; state.team = '';
      state.selected = null;
      // DNT rows default ON once a roster is loaded.
      state.showDNT = true;
      $('show-dnt-toggle').checked = true;
      $('show-dnt-toggle').disabled = false;
      $('per-team-avg').disabled = false;
      $('clear-roster-btn').disabled = false;
      updateRosterStatus();
      refreshOrgTeamOptions();
      if (state.dataset) {
        renderAthleteList();
        renderReport();
      }
    }

    function loadRosterFile(file) {
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () { loadRoster(parseCSV(String(reader.result)), file.name); };
      reader.onerror = function () {
        var err = $('roster-error');
        err.textContent = 'Could not read that roster file. Try choosing it again.';
        err.hidden = false;
      };
      reader.readAsText(file);
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

    // Roster wiring — refresh re-opens the file picker for a newer export.
    $('roster-file-input').addEventListener('change', function (e) { loadRosterFile(e.target.files[0]); e.target.value = ''; });
    var rdz = $('roster-dropzone');
    ['dragenter', 'dragover'].forEach(function (ev) {
      rdz.addEventListener(ev, function (e) { e.preventDefault(); rdz.classList.add('drag-over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      rdz.addEventListener(ev, function (e) { e.preventDefault(); rdz.classList.remove('drag-over'); });
    });
    rdz.addEventListener('drop', function (e) {
      if (e.dataTransfer.files && e.dataTransfer.files[0]) loadRosterFile(e.dataTransfer.files[0]);
    });
    rdz.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('roster-file-input').click(); }
    });
    $('roster-refresh-btn').addEventListener('click', function () { $('roster-file-input').click(); });
    $('clear-roster-btn').addEventListener('click', function () {
      state.roster = null; state.rosterFileName = null; state.rosterRefreshedAt = null;
      state.org = ''; state.team = ''; state.selected = null; state.showDNT = false; state.perTeamAvg = false;
      $('roster-file-input').value = '';
      $('clear-roster-btn').disabled = true;
      $('per-team-avg').checked = false;
      $('per-team-avg').disabled = true;
      updateRosterStatus();
      refreshOrgTeamOptions();
      if (state.dataset) { renderAthleteList(); renderReport(); }
    });

    // Filter wiring
    ['start-date', 'end-date'].forEach(function (id) {
      $(id).addEventListener('change', renderReport);
    });
    $('org-select').addEventListener('change', function () {
      state.org = $('org-select').value;
      state.team = '';
      state.selected = null; // new filter set => start from "all in filter"
      refreshOrgTeamOptions();
      renderAthleteList(); renderReport();
    });
    $('team-select').addEventListener('change', function () {
      state.team = $('team-select').value;
      state.selected = null;
      renderAthleteList(); renderReport();
    });
    $('show-dnt-toggle').addEventListener('change', function () {
      state.showDNT = $('show-dnt-toggle').checked;
      renderReport();
    });
    $('show-teamavg-row').addEventListener('change', function () {
      state.showTeamAvgRow = $('show-teamavg-row').checked;
      renderReport();
    });
    $('per-team-avg').addEventListener('change', function () {
      state.perTeamAvg = $('per-team-avg').checked;
      renderReport();
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
      state.selected = filteredBaseNames();
      renderAthleteList(); renderReport();
    });
    $('clear-athletes-btn').addEventListener('click', function () {
      state.selected = [];
      renderAthleteList(); renderReport();
    });
    $('print-btn').addEventListener('click', function () { window.print(); });
    $('view-table-btn').addEventListener('click', function () { setView('table'); });
    $('view-analytics-btn').addEventListener('click', function () { setView('analytics'); });
  }

  // Testable surface (used by the local Node test harness; harmless in browser).
  var api = {
    ADMIN_PASSCODE: ADMIN_PASSCODE, EXERCISES: EXERCISES, SAMPLE_CSV: SAMPLE_CSV,
    parseCSV: parseCSV, cleanName: cleanName, splitName: splitName,
    parseAsymmetry: parseAsymmetry, parseDateISO: parseDateISO,
    buildDataset: buildDataset, pivotReport: pivotReport, deltaClass: deltaClass,
    parseRoster: parseRoster, matchRoster: matchRoster,
    computeAvgRow: computeAvgRow, computePerTeamRows: computePerTeamRows,
    buildAnalyticsData: buildAnalyticsData
  };
  if (typeof window !== 'undefined') { window.AdminReport = api; }
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
})();
