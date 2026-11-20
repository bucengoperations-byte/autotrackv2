/* AutoTrack v2 — front end. Plain JavaScript, no build step.
   Every value from the API is written with textContent, never as HTML. */
(function () {
  'use strict';
  var CFG = window.AUTOTRACK_CONFIG || {};
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var byId = function (id) { return document.getElementById(id); };
  var text = function (id, v) { var el = byId(id); if (el) el.textContent = v; return el; };
  var clone = function (id) { return byId(id).content.firstElementChild.cloneNode(true); };
  var has = function (v) { return v !== null && v !== undefined && v !== '' && !isNaN(v); };
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var ICON = {
    check: 'M5 12.5l4.5 4.5L19 7.5',
    bang: 'M12 6v8 M12 18v0.5',
    ask: 'M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.5V14 M12 18v0.5',
    clock: 'M12 7v5l3 2 M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18',
    up: 'M12 19V5 M6 11l6-6 6 6'
  };
  var DEPT_CODE = { Chemical: 'CHE', Civil: 'CE', Electrical: 'EE', Geodetic: 'GE', Mechanical: 'ME', Mining: 'EM' };
  var FOLDER_COLORS = ['f-lime', 'f-cobalt', 'f-cream', 'f-pink'];

  function peso(n, whole) {
    if (!has(n)) return '—';
    var cents = Math.round(Number(n) * 100) % 100 !== 0;
    var w = whole === true || (whole === 'auto' && !cents);
    return '₱' + Number(n).toLocaleString('en-US', { minimumFractionDigits: w ? 0 : 2, maximumFractionDigits: w ? 0 : 2 });
  }
  function count(n) { return Number(n || 0).toLocaleString('en-US'); }
  function fmtDate(iso) {
    var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? MONTHS[Number(m[2]) - 1].slice(0, 3) + ' ' + Number(m[3]) + ', ' + m[1] : '';
  }
  function monthLabel(key) {
    var m = String(key).match(/^(\d{4})-(\d{2})/);
    if (!m) return { name: String(key), short: String(key), year: '' };
    var name = MONTHS[Number(m[2]) - 1];
    return { name: name, short: name.slice(0, 3).toUpperCase(), year: m[1] };
  }
  function statusInfo(s) {
    var k = String(s || '').toLowerCase();
    if (k === 'approved') return { key: 'approved', label: 'Approved', icon: ICON.check, level: 3 };
    if (k === 'pending' || k === 'under review') return { key: 'pending', label: 'Under review', icon: ICON.clock, level: 2 };
    if (k === 'submitted') return { key: 'submitted', label: 'Submitted', icon: ICON.up, level: 1 };
    return { key: k || 'filed', label: s || 'Filed', icon: ICON.up, level: 0 };
  }
  function blurWord(event) {
    var words = String(event || '').toUpperCase().replace(/[^A-Z0-9' -]/g, ' ').split(/\s+/).filter(function (w) { return w.length > 2 && w !== 'THE'; });
    return words.sort(function (a, b) { return b.length - a.length; })[0] || 'REPORT';
  }
  function shortName(event) {
    return String(event || '').split(/[:—–|]/)[0].replace(/^the\s+/i, '').trim() || String(event || '');
  }
  function mailto(subject) {
    return CFG.contactEmail ? 'mailto:' + CFG.contactEmail + '?subject=' + encodeURIComponent(subject) : '#/fee';
  }

  /* ------------------------------------------------------------ API */
  function api(action, body) {
    if (!CFG.apiUrl || /PASTE_/.test(CFG.apiUrl)) return Promise.reject(new Error('not_configured'));
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 20000);
    var req = body
      ? fetch(CFG.apiUrl, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ action: action }, body)), signal: ctrl && ctrl.signal, credentials: 'omit', cache: 'no-store' })
      : fetch(CFG.apiUrl + (CFG.apiUrl.indexOf('?') < 0 ? '?' : '&') + 'action=' + encodeURIComponent(action), { method: 'GET', redirect: 'follow', signal: ctrl && ctrl.signal, credentials: 'omit' });
    return req.then(function (r) { clearTimeout(timer); if (!r.ok) throw new Error('http_' + r.status); return r.json(); })
      .catch(function (e) { clearTimeout(timer); throw e; });
  }

  var fundP = null, fundData = null;
  function getFund(force) {
    if (!fundP || force) {
      fundP = api('fund').then(function (d) { if (!d || !d.ok) throw new Error((d && d.error) || 'bad'); fundData = d; freshness(d); return d; });
      fundP.catch(function (e) { freshness(null, e); fundP = null; });
    }
    return fundP;
  }
  var updatesP = null;
  function getUpdates() {
    if (!updatesP) updatesP = api('updates').then(function (d) { return (d && d.ok && d.posts) || []; }).catch(function () { updatesP = null; return []; });
    return updatesP;
  }

  function freshness(d, err) {
    var el = byId('fresh');
    el.classList.remove('is-live', 'is-off');
    if (d) { el.textContent = 'Updated ' + fmtDate(d.updated); el.classList.add('is-live'); }
    else { el.textContent = err && err.message === 'not_configured' ? 'Not connected' : 'Offline'; el.classList.add('is-off'); }
  }

  /* ------------------------------------------------------------ shared bits */
  $$('[data-ay]').forEach(function (el) { el.textContent = String(CFG.ay || '').replace(/^(\d{4})(\D+)\d{2}(\d{2})$/, '$1$2$3'); });
  function wireContacts() {
    $$('.js-contact').forEach(function (a) { if (!a.hasAttribute('data-subject')) a.setAttribute('href', mailto('AutoTrack question')); });
  }
  wireContacts();

  function viewState(view, state) {
    var v = $('[data-view="' + view + '"]');
    $$('[data-loading]', v).forEach(function (e) { e.hidden = state !== 'loading'; });
    $$('[data-error]', v).forEach(function (e) { e.hidden = state !== 'error'; });
    $$('[data-body]', v).forEach(function (e) { e.hidden = state !== 'body'; });
  }
  function withFund(view, render) {
    if (fundData) { viewState(view, 'body'); render(fundData); return; }
    viewState(view, 'loading');
    getFund().then(function (d) { viewState(view, 'body'); render(d); }).catch(function () { viewState(view, 'error'); });
  }
  $$('[data-retry]').forEach(function (b) {
    b.addEventListener('click', function () { getFund(true).then(route, route); route(); });
  });

  function allReports(d) {
    var out = [];
    (d.months || []).forEach(function (m) { (m.reports || []).forEach(function (r) { out.push(Object.assign({ month: m.key }, r)); }); });
    return out;
  }

  /* ------------------------------------------------------------ router */
  var current = null;
  function parse() {
    var parts = location.hash.replace(/^#\/?/, '').split('/');
    var name = parts[0] || 'home';
    var alias = { status: 'fee', updates: 'home', help: 'home' };
    name = alias[name] || name;
    if (['home', 'fee', 'fund', 'receipts', 'report'].indexOf(name) < 0) name = 'home';
    return { name: name, arg: parts.slice(1).join('/') };
  }
  function route() {
    var r = parse();
    current = r;
    $$('.view').forEach(function (v) { v.hidden = v.getAttribute('data-view') !== r.name; });
    var navName = r.name === 'report' ? 'receipts' : r.name;
    $$('[data-route]').forEach(function (a) {
      if (a.getAttribute('data-route') === navName) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    var titles = { home: 'Home', fee: 'My fee', fund: 'Council fund', receipts: 'Liquidation reports', report: 'Liquidation report' };
    document.title = titles[r.name] + ' · AutoTrack v2 · BUCENG-CSC';
    if (r.name === 'home') renderHome();
    if (r.name === 'fee') renderFeeLines();
    if (r.name === 'fund') withFund('fund', renderFund);
    if (r.name === 'receipts') withFund('receipts', renderReceipts);
    if (r.name === 'report') withFund('report', function (d) { renderReport(d, decodeURIComponent(r.arg || '')); });
  }
  window.addEventListener('hashchange', function () {
    route(); window.scrollTo(0, 0);
    var m = byId('main'); if (m) m.focus({ preventScroll: true });
  });

  /* ------------------------------------------------------------ HOME */
  function renderHome() {
    getFund().then(function (d) {
      byId('home-err').hidden = true;
      var fee = (d.fee || []).reduce(function (s, l) { return s + (Number(l.amount) || 0); }, 0);
      if (fee) text('h-fee', peso(fee, true));
      var r = d.report || {};
      text('h-fund', peso(r.ending, true));
      text('h-fund-sub', has(r.outflow) ? 'Council fund, after ' + peso(r.outflow, true) + ' spent this sem' : 'Council fund');
      var c = d.collection || { paid: 0, total: 0, pct: 0 };
      text('h-paid', c.pct + '%');
      byId('h-paid-bar').style.setProperty('--w', (c.total ? c.paid / c.total * 100 : 0).toFixed(1) + '%');
      text('h-paid-sub', count(c.paid) + ' of ' + count(c.total) + ' · ' + count(c.total - c.paid) + ' to go');
      var reps = allReports(d);
      var backed = reps.reduce(function (s, x) { return s + (Number(x.cashOut) || 0); }, 0);
      text('h-rep', String(reps.length));
      text('h-rep-sub', reps.length ? peso(backed, true) + ' backed by receipts · Latest: ' + reps[reps.length - 1].event : 'No reports published yet');
    }).catch(function () { byId('home-err').hidden = false; });

    getUpdates().then(function (posts) {
      var banner = byId('banner'), list = byId('uplist');
      if (!posts.length) { banner.hidden = true; list.hidden = true; return; }
      var p = posts[0];
      text('banner-tag', p.type || 'Update');
      text('banner-title', p.title);
      setLink(banner, p.link);
      banner.hidden = false;
      list.textContent = '';
      posts.slice(1, 4).forEach(function (q) {
        var li = clone('tpl-update');
        $('time', li).textContent = fmtDate(q.date).replace(/, \d{4}$/, '');
        $('time', li).setAttribute('datetime', q.date);
        var a = $('a', li); a.textContent = q.title; setLink(a, q.link);
        $('.b', li).textContent = q.body;
        list.appendChild(li);
      });
      list.hidden = posts.length < 2;
    });
  }
  function setLink(a, link) {
    a.removeAttribute('target'); a.removeAttribute('rel');
    if (/^#\//.test(link || '')) a.setAttribute('href', link);
    else if (/^https:\/\//.test(link || '')) { a.setAttribute('href', link); a.target = '_blank'; a.rel = 'noopener noreferrer'; }
    else a.removeAttribute('href');
  }

  /* ------------------------------------------------------------ MY FEE */
  var form = byId('lookup'), sidEl = byId('sid'), lnEl = byId('lname'), btn = byId('lookup-btn'), errBox = byId('lookup-err');
  var ID_RE = /^\d{4}-(?:[A-Z]{2,5}-|\d{2,4}-)?\d{4,6}$/;
  var SID_HELP = 'Format: 2026-01-12345. Dashes are added for you.';

  function renderFeeLines(lines) {
    var go = function (ls) {
      if (!ls || !ls.length) return;
      var box = byId('fee-lines'); box.textContent = '';
      var total = 0;
      ls.forEach(function (l) {
        var row = clone('tpl-li');
        $('.k', row).textContent = l.label; $('.v', row).textContent = peso(l.amount, 'auto');
        total += Number(l.amount) || 0;
        box.appendChild(row);
      });
      text('fee-total', peso(total, 'auto'));
    };
    if (lines) return go(lines);
    getFund().then(function (d) { go(d.fee); }).catch(function () { /* the static total stays */ });
  }

  function fieldErr(input, helpId, msg, normal) {
    var help = byId(helpId);
    if (msg) { input.setAttribute('aria-invalid', 'true'); help.textContent = msg; help.classList.add('is-err'); }
    else { input.removeAttribute('aria-invalid'); help.textContent = normal || ''; help.classList.remove('is-err'); }
  }
  function formErr(msg, withContact) {
    errBox.textContent = '';
    if (!msg) { errBox.hidden = true; return; }
    errBox.appendChild(document.createTextNode(msg + ' '));
    if (withContact && CFG.contactEmail) {
      var a = document.createElement('a'); a.href = mailto('AutoTrack: my record is missing'); a.textContent = 'Message the council'; errBox.appendChild(a);
    }
    errBox.hidden = false;
  }
  sidEl.addEventListener('input', function () {
    var v = sidEl.value.replace(/[‐-―]/g, '-');
    if (/^\d{11}$/.test(v)) v = v.slice(0, 4) + '-' + v.slice(4, 6) + '-' + v.slice(6);
    if (v !== sidEl.value) sidEl.value = v;
    if (sidEl.hasAttribute('aria-invalid')) fieldErr(sidEl, 'sid-help', '', SID_HELP);
  });
  lnEl.addEventListener('input', function () { if (lnEl.hasAttribute('aria-invalid')) fieldErr(lnEl, 'lname-help', ''); });

  var ERRORS = {
    bad_input: 'Check your Student No. It needs its dashes, like 2026-01-12345.',
    too_many: 'Too many tries for this Student No. Wait 10 minutes, then try again.',
    busy: 'AutoTrack is busy right now. Try again in a minute.',
    not_configured: 'AutoTrack isn’t connected to the council records yet.',
    network: 'We couldn’t reach the council records. Check your connection and try again.'
  };
  function setLoading(on) {
    btn.disabled = on;
    btn.textContent = '';
    if (on) { var s = document.createElement('span'); s.className = 'spin'; s.setAttribute('aria-hidden', 'true'); btn.appendChild(s); }
    var t = document.createElement('span'); t.id = 'lookup-label'; t.textContent = on ? 'Checking the list…' : 'Check payment status'; btn.appendChild(t);
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var sid = sidEl.value.replace(/\s+/g, '').toUpperCase(), ln = lnEl.value.trim();
    var bad = false;
    formErr('');
    if (!sid) { fieldErr(sidEl, 'sid-help', 'Enter your Student No.'); bad = true; }
    else if (!ID_RE.test(sid)) { fieldErr(sidEl, 'sid-help', 'Include the dashes, like 2026-01-12345.'); bad = true; }
    else fieldErr(sidEl, 'sid-help', '', SID_HELP);
    if (!ln) { fieldErr(lnEl, 'lname-help', 'Enter your last name as registered.'); bad = true; }
    else fieldErr(lnEl, 'lname-help', '');
    if (bad) { (sidEl.hasAttribute('aria-invalid') ? sidEl : lnEl).focus(); return; }
    setLoading(true);
    api('status', { sid: sid, lastName: ln }).then(function (r) {
      if (!r.ok) return formErr(ERRORS[r.error] || ERRORS.network);
      if (!r.found) return formErr('We couldn’t find that Student No. and last name together. Check the dashes and the spelling on your registration form. Still nothing?', true);
      showResult(r);
    }).catch(function (x) {
      formErr(x && x.message === 'not_configured' ? ERRORS.not_configured : ERRORS.network);
    }).then(function () { setLoading(false); });
  });

  function showResult(r) {
    var total = (r.fee || []).reduce(function (s, l) { return s + (Number(l.amount) || 0); }, 0);
    var mode = r.mode ? r.mode.charAt(0).toUpperCase() + r.mode.slice(1) : '';
    var code = DEPT_CODE[r.department] || String(r.department || '').slice(0, 3).toUpperCase();
    var updated = fmtDate(r.updated);
    var V = {
      paid: { cls: 'v-paid', pill: 'Paid', icon: ICON.check, title: 'Bayad ka na.',
        sub: 'Your council fee is recorded' + (mode ? ' (paid ' + mode.toLowerCase() + ')' : '') + '. Nothing left to pay this school year.',
        pass: 'paid', stamp: 'PAID', stampSub: (mode || 'RECORDED').toUpperCase(), tail: code + (mode ? ' · ' + mode.toUpperCase() : ''), fine: 'SHOW THIS AT CSC EVENTS',
        rows: [['Balance', '₱0 of ' + peso(total, 'auto')], mode ? ['Paid via', mode] : null, ['Department', r.department], ['List updated', updated]],
        help: '' },
      unpaid: { cls: 'v-unpaid', pill: 'Not paid', icon: ICON.bang, title: 'Not paid yet.',
        sub: 'Pay ' + peso(total, 'auto') + ' at the CSC office or online, then check again. The list is updated every day.',
        pass: 'unpaid', stamp: 'NOT PAID', stampSub: peso(total, 'auto') + ' DUE', tail: code + ' · UNPAID', fine: 'PAY AT THE CSC OFFICE OR ONLINE',
        rows: [['Balance', peso(total, 'auto') + ' due'], ['Pay at', 'CSC office or online'], ['Department', r.department], ['List updated', updated]],
        help: 'Already paid? Send the council your receipt' },
      norecord: { cls: 'v-norecord', pill: 'No record yet', icon: ICON.ask, title: 'No record yet.',
        sub: 'You’re on the list, but nothing is recorded for A.Y. ' + r.ay + ' yet.',
        pass: 'norecord', stamp: 'NO RECORD', stampSub: 'ASK THE CSC', tail: code + ' · NO RECORD', fine: 'ASK THE TREASURER TO CHECK',
        rows: [['Status', 'Nothing recorded yet'], ['Department', r.department], ['List updated', updated]],
        help: 'Ask the council to check your record' }
    }[r.status];
    if (!V) return formErr(ERRORS.network);

    var vd = byId('verdict'); vd.className = 'card verdict ' + V.cls;
    text('v-pill-txt', V.pill); byId('v-icon').setAttribute('d', V.icon);
    text('v-ay', 'A.Y. ' + r.ay);
    text('v-title', V.title); text('v-sub', V.sub);

    var pass = byId('pass');
    pass.setAttribute('class', 'pass pass--' + V.pass);
    text('pass-t', 'Fee pass: ' + V.pill.toLowerCase() + ', ' + r.masked);
    text('pass-sub', 'council fee pass · A.Y. ' + r.ay);
    text('pass-stamp', V.stamp); text('pass-stampsub', V.stampSub);
    text('pass-id', r.masked); text('pass-tail', V.tail); text('pass-fine', V.fine);
    byId('passwrap').classList.toggle('is-paid', r.status === 'paid');

    var rows = byId('r-rows'); rows.textContent = '';
    V.rows.filter(Boolean).forEach(function (kv) {
      if (!kv[1]) return;
      var row = clone('tpl-li'); $('.k', row).textContent = kv[0]; $('.v', row).textContent = kv[1]; rows.appendChild(row);
    });
    var help = byId('r-help');
    if (V.help) { text('r-help-txt', V.help); help.setAttribute('href', mailto('AutoTrack: fee status (' + r.masked + ')')); help.setAttribute('data-subject', '1'); help.hidden = false; }
    else help.hidden = true;

    renderFeeLines(r.fee);
    byId('fee-form-view').hidden = true; byId('fee-result-view').hidden = false;
    sidEl.value = ''; lnEl.value = '';           // nothing personal lingers in the form
    window.scrollTo(0, 0);
    byId('v-title').focus({ preventScroll: true });
  }
  byId('again').addEventListener('click', function () {
    byId('fee-result-view').hidden = true; byId('fee-form-view').hidden = false; formErr(''); sidEl.focus();
  });

  /* ------------------------------------------------------------ FUND */
  function renderFund(d) {
    var r = d.report || {};
    var sem = String(r.title || '').match(/(First|Second|1st|2nd|Mid-?year|Summer)\s*(Semester|Term)?/i);
    text('f-period', sem ? 'From the ' + sem[0].replace(/\b\w/g, function (c) { return c.toUpperCase(); }) + ' Financial Report' : 'From the latest Financial Report');
    var end = byId('f-ending'); end.textContent = '';
    if (has(r.ending)) {
      var whole = Math.floor(Number(r.ending)), cents = Math.round((Number(r.ending) - whole) * 100);
      end.appendChild(document.createTextNode(peso(whole, true)));
      var sm = document.createElement('small'); sm.textContent = '.' + ('0' + cents).slice(-2); end.appendChild(sm);
    } else end.textContent = '—';
    var out = Number(r.outflow) || 0, left = Number(r.ending) || 0, all = out + left;
    byId('f-split-a').style.setProperty('--a', String(out || 0.0001));
    byId('f-split-b').style.setProperty('--b', String(left || 0.0001));
    text('f-out-k', 'Spent' + (all ? ' · ' + Math.round(out / all * 100) + '%' : ''));
    text('f-left-k', 'Left' + (all ? ' · ' + Math.round(left / all * 100) + '%' : ''));
    text('f-out-v', peso(r.outflow)); text('f-left-v', peso(r.ending));
    text('t-begin', peso(r.beginning)); text('t-in', peso(r.inflow)); text('t-out', peso(r.outflow)); text('t-left', peso(r.ending));
    var rem = (r.remitted || []).filter(function (x) { return has(x.amount) && x.amount; });
    var remEl = byId('t-remit');
    if (rem.length) {
      var sum = rem.reduce(function (s, x) { return s + Number(x.amount); }, 0);
      remEl.textContent = 'Cash out includes ' + peso(sum) + ' of collected fees passed on to the university: ' + rem.map(function (x) { return x.name.replace(/\s*Fee$/i, ' fee') + ' ' + peso(x.amount); }).join(', ') + '.';
      remEl.hidden = false;
    } else remEl.hidden = true;
    var reps = allReports(d);
    var backed = reps.reduce(function (s, x) { return s + (Number(x.cashOut) || 0); }, 0);
    text('trace-h', reps.length ? peso(backed, 'auto') + ' of cash out has receipts' : 'No receipts published yet');
    text('trace-sub', reps.length + (reps.length === 1 ? ' published liquidation report' : ' published liquidation reports'));

    var c = d.collection || { paid: 0, total: 0, pct: 0, departments: [] };
    var fee = (d.fee || []).reduce(function (s, l) { return s + (Number(l.amount) || 0); }, 0);
    text('c-cap', 'Who has paid the ' + (fee ? peso(fee, 'auto') + ' ' : '') + 'council fee, from the fee list');
    text('c-pct', c.pct + '%');
    byId('c-bar').style.setProperty('--w', (c.total ? c.paid / c.total * 100 : 0).toFixed(1) + '%');
    text('c-paid', count(c.paid)); text('c-left', count(c.total - c.paid)); text('c-total', count(c.total));
    var box = byId('c-depts'); box.textContent = '';
    (c.departments || []).forEach(function (dep) {
      var row = clone('tpl-dept');
      $('.n', row).textContent = dep.name;
      if (!dep.total) {
        row.removeChild($('.bar', row)); row.removeChild($('.p', row));
        var none = document.createElement('span'); none.className = 'none'; none.textContent = 'Not counted yet'; row.appendChild(none);
      } else {
        $('.bar i', row).style.setProperty('--w', (dep.paid / dep.total * 100).toFixed(1) + '%');
        $('.p b', row).textContent = dep.pct + '%';
        $('.p span', row).textContent = count(dep.paid) + '/' + count(dep.total);
        row.setAttribute('aria-label', dep.name + ': ' + dep.pct + '% paid, ' + dep.paid + ' of ' + dep.total);
      }
      box.appendChild(row);
    });
    drawTrend(d.history || [], c);
    text('fund-foot', 'From the BUCENG-CSC Financial Report and fee list · Updated ' + fmtDate(d.updated) + '.');
  }

  function drawTrend(hist, c) {
    var pts = hist.map(function (h) { return { date: h.date, pct: h.total ? h.paid / h.total * 100 : 0 }; });
    var ok = pts.length >= 2;
    byId('trend-ghost').style.display = ok ? 'none' : '';
    byId('trend-axis').hidden = !ok;
    if (!ok) { byId('trend-line').setAttribute('d', ''); text('trend-note', 'This line starts filling after the first nightly count, one point a day.'); return; }
    var W = 320, H = 90, P = 4;
    var y = function (v) { return H - P - (Math.max(0, Math.min(100, v)) / 100) * (H - 2 * P); };
    var xy = pts.map(function (p, i) { return [P + i * (W - 2 * P) / (pts.length - 1), y(p.pct)]; });
    var d = 'M' + xy[0][0].toFixed(1) + ' ' + xy[0][1].toFixed(1);
    for (var i = 0; i < xy.length - 1; i++) {
      var p0 = xy[i - 1] || xy[i], p1 = xy[i], p2 = xy[i + 1], p3 = xy[i + 2] || p2;
      d += ' C' + [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]].map(function (n) { return n.toFixed(1); }).join(' ');
    }
    byId('trend-line').setAttribute('d', d);
    var short = function (s) { return fmtDate(s).replace(/, \d{4}$/, ''); };
    text('trend-x0', short(pts[0].date)); text('trend-x1', short(pts[pts.length - 1].date));
    text('trend-note', 'Share of students paid, one point per nightly count: ' + Math.round(pts[0].pct) + '% on ' + short(pts[0].date) + ' → ' + c.pct + '% now.');
    byId('trend-svg').setAttribute('aria-label', 'Share of students paid went from ' + Math.round(pts[0].pct) + '% on ' + short(pts[0].date) + ' to ' + Math.round(pts[pts.length - 1].pct) + '% on ' + short(pts[pts.length - 1].date) + '.');
  }

  /* ------------------------------------------------------------ RECEIPTS: one folder stack per month */
  var recState = { status: 'all', front: {} };
  function renderReceipts(d) {
    var r = d.report || {};
    var reps = allReports(d);
    var backed = reps.reduce(function (s, x) { return s + (Number(x.cashOut) || 0); }, 0);
    var out = Number(r.outflow) || 0;
    text('r-backed', peso(backed, 'auto'));
    text('r-of', out ? 'of ' + peso(out) + ' spent' : '');
    byId('r-bar').style.setProperty('--w', (out ? Math.min(100, backed / out * 100) : 0).toFixed(1) + '%');
    var rest = Math.round((out - backed) * 100) / 100;
    var rem = (r.remitted || []).reduce(function (s, x) { return s + (Number(x.amount) || 0); }, 0);
    text('r-rest', !out ? '' : rest <= 0.5 ? 'Every peso of cash out has a published report.'
      : 'The other ' + peso(rest) + (rem ? ' includes ' + peso(rem) + ' of fees passed on to the university (USC fee, insurance) and reports still being prepared.' : ' is in reports still being prepared or not yet published.'));

    // status filter chips (only statuses that exist)
    var counts = {}; reps.forEach(function (x) { var k = statusInfo(x.status).key; counts[k] = (counts[k] || 0) + 1; });
    if (recState.status !== 'all' && !counts[recState.status]) recState.status = 'all';
    var chips = byId('filters'); chips.textContent = '';
    [['all', 'All']].concat([['approved', 'Approved'], ['pending', 'Under review'], ['submitted', 'Submitted']].filter(function (s) { return counts[s[0]]; })).forEach(function (s) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'chip';
      b.textContent = s[1] + ' · ' + (s[0] === 'all' ? reps.length : counts[s[0]]);
      b.setAttribute('aria-pressed', recState.status === s[0] ? 'true' : 'false');
      b.addEventListener('click', function () { recState.status = (recState.status === s[0] && s[0] !== 'all') ? 'all' : s[0]; renderReceipts(d); });
      chips.appendChild(b);
    });
    chips.hidden = !reps.length; byId('r-hint').hidden = !reps.length;

    var months = (d.months || []).slice().reverse();      // newest first
    var color = {}; var ci = 0;
    months.forEach(function (m) { m.reports.forEach(function (x) { color[x.no] = FOLDER_COLORS[ci++ % FOLDER_COLORS.length]; }); });
    var box = byId('months'); box.textContent = '';
    var shown = 0;
    months.forEach(function (m) {
      var items = m.reports.filter(function (x) { return recState.status === 'all' || statusInfo(x.status).key === recState.status; });
      if (!items.length) return;
      shown += items.length;
      box.appendChild(monthStack(m, items, color));
    });
    var empty = byId('r-empty');
    empty.hidden = shown > 0;
    text('r-empty-txt', reps.length ? 'No reports with this status yet.' : 'No liquidation reports are published yet. They appear here once the treasurer publishes them.');
    byId('r-reset').hidden = !reps.length;
  }
  byId('r-reset').addEventListener('click', function () { recState.status = 'all'; if (fundData) renderReceipts(fundData); });

  function monthStack(m, items, color) {
    var lab = monthLabel(m.key);
    var g = clone('tpl-month');
    $('.mn', g).textContent = lab.name; $('.yr', g).textContent = lab.year;
    var total = items.reduce(function (s, x) { return s + (Number(x.cashOut) || 0); }, 0);
    $('.sum', g).textContent = items.length + (items.length === 1 ? ' report · ' : ' reports · ') + peso(total, 'auto') + ' out';
    g.setAttribute('aria-label', lab.name + ' ' + lab.year + ': ' + items.length + (items.length === 1 ? ' report' : ' reports'));
    var stack = $('.folders', g);
    var frontNo = items.some(function (x) { return x.no === recState.front[m.key]; }) ? recState.front[m.key] : items[0].no;
    var n = items.length, FH = 236, k = 0;
    var tabLeft = function (i) { return n > 1 ? 'calc(12px + ' + (i / (n - 1)).toFixed(4) + ' * (100% - 136px))' : '12px'; };
    items.forEach(function (x, i) {
      if (x.no === frontNo) return;
      var f = clone('tpl-folder-back');
      f.classList.add(color[x.no]);
      f.style.top = (28 + k * 30) + 'px'; k++;
      var tab = $('.folder__tab', f);
      tab.textContent = shortName(x.event);
      tab.style.left = tabLeft(i);
      tab.setAttribute('aria-label', 'Bring forward: ' + x.event);
      tab.addEventListener('click', function () {
        recState.front[m.key] = x.no;
        var fresh = monthStack(m, items, color);
        g.parentNode.replaceChild(fresh, g);
        var t = $('.folder:last-child .folder__body h3', fresh); if (t) { t.setAttribute('tabindex', '-1'); t.focus(); }
      });
      stack.appendChild(f);
    });
    var x = items.filter(function (it) { return it.no === frontNo; })[0], i = items.indexOf(x);
    var st = statusInfo(x.status);
    var f = clone('tpl-folder-front');
    f.classList.add(color[x.no]);
    f.style.top = (28 + k * 30) + 'px';
    var tab = $('.folder__tab', f); tab.textContent = shortName(x.event); tab.style.left = tabLeft(i);
    $('.folder__blur span', f).textContent = blurWord(x.event);
    $('.pill', f).classList.add('pill--' + st.key); $('.pill path', f).setAttribute('d', st.icon); $('.pill .st', f).textContent = st.label;
    $('h3', f).textContent = x.event;
    $('p', f).textContent = x.note || (x.held ? 'Held ' + x.held + '.' : '');
    $('.amt', f).textContent = peso(x.cashOut, 'auto');
    var a = $('a', f); a.setAttribute('href', '#/report/' + encodeURIComponent(x.no)); a.setAttribute('aria-label', 'Open report: ' + x.event);
    stack.appendChild(f);
    stack.style.height = (28 + k * 30 + FH) + 'px';
    return g;
  }

  /* ------------------------------------------------------------ REPORT DETAIL */
  function renderReport(d, no) {
    var x = allReports(d).filter(function (r) { return r.no === no; })[0];
    byId('rep-missing').hidden = !!x;
    if (!x) { viewState('report', 'none'); return; }
    var lab = monthLabel(x.month), st = statusInfo(x.status), r = d.report || {};
    document.title = x.event + ' · Liquidation report · AutoTrack v2';
    byId('rep-cover').className = 'cover f-cream';
    text('rep-month', lab.short + ' ' + lab.year);
    text('rep-blur', blurWord(x.event));
    byId('rep-pill').className = 'pill pill--' + st.key; byId('rep-icon').setAttribute('d', st.icon); text('rep-status', st.label);
    text('rep-title', x.event);
    text('rep-desc', x.note || (x.held ? 'Held ' + x.held + '.' : ''));
    $$('#rep-steps li').forEach(function (li, i) { li.classList.toggle('done', i < st.level); if (i === st.level - 1) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current'); });
    text('rep-roles', 'Prepared by the ' + (x.preparedBy || 'CSC Treasurer') + '. Noted by the ' + (x.notedBy || 'CSC Adviser') + '.');

    var figs = byId('rep-figs'); figs.textContent = '';
    var add = function (k, v, total) { var row = clone('tpl-li'); if (total) row.classList.add('li--total'); $('.k', row).textContent = k; $('.v', row).textContent = v; figs.appendChild(row); };
    if (x.held) add('Held', x.held);
    if (has(x.cashIn)) add('Cash in', peso(x.cashIn));
    add('Cash out', peso(x.cashOut));
    if (has(x.cashIn)) add('Left', peso(Math.round((x.cashIn - x.cashOut) * 100) / 100), true);
    if (has(r.outflow) && r.outflow) add('Share of semester cash out', Math.round(x.cashOut / r.outflow * 100) + '%');

    var grid = byId('rep-lines'); grid.textContent = '';
    var lines = x.lines || [], note = byId('rep-lines-note');
    if (lines.length) {
      ['No.', 'Item', 'Amount'].forEach(function (h, i) { var s = document.createElement('span'); s.className = 'hd' + (i === 2 ? ' amt' : ''); s.textContent = h; grid.appendChild(s); });
      var sum = 0;
      lines.forEach(function (l) {
        [['no', l.receipt || '—'], ['', l.item + (l.qty ? ' · ' + l.qty : '')], ['amt', peso(l.amount)]].forEach(function (c) {
          var s = document.createElement('span'); if (c[0]) s.className = c[0]; s.textContent = c[1]; grid.appendChild(s);
        });
        sum += Number(l.amount) || 0;
      });
      [['tot', ''], ['tot', 'Total of receipts'], ['tot amt', peso(sum)]].forEach(function (c) { var s = document.createElement('span'); s.className = c[0]; s.textContent = c[1]; grid.appendChild(s); });
      var diff = Math.abs(sum - (Number(x.cashOut) || 0)) > 0.5;
      note.textContent = diff ? 'The receipt lines add up to ' + peso(sum) + '; the report lists ' + peso(x.cashOut) + ' cash out. The signed PDF has the full breakdown.' : '';
      note.hidden = !diff;
    } else {
      note.textContent = 'The receipt lines for this report are in the signed PDF.'; note.hidden = false;
    }
    var pdf = byId('rep-pdf');
    if (/^https:\/\//.test(x.pdf || '')) { pdf.setAttribute('href', x.pdf); pdf.hidden = false; text('rep-pdf-note', 'Opens the scanned copy with signatures.'); }
    else { pdf.removeAttribute('href'); pdf.hidden = true; text('rep-pdf-note', 'The signed copy hasn’t been uploaded yet.'); }
    byId('rep-title').focus({ preventScroll: true });
  }

  route();
  getFund().catch(function () { /* each view shows its own error */ });
})();
