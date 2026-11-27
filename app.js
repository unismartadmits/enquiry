/* UniSmart Admits enquiry page.
 * Every number typed is saved to the Enquiry Log (Google Apps Script web app below):
 * - a row is saved the moment the number is complete ("Partial (left form)"), and updated when they submit ("New")
 * - every visit, and every different number in the same visit, gets its own row (nothing is overwritten)
 * - saves wait on the phone (outbox) when there's no network, and are sent later; nothing is dropped
 * - spam guard: max 10 different numbers a minute per phone (extras wait in the outbox), hidden bot trap
 * - a small line under the form shows how many entries this phone saved today, and says so when it's offline
 */
(function () {
  var EXEC = 'https://script.google.com/macros/s/AKfycbyAn6Qen6Fv8gFO_hShxO6vNw-QiLlLMx7Of1HcnGBABBVheT2uyEynhe9NlkbEso6Jog/exec';
  var CONSENT = ''; /* notice now sits above the box (#notice) */
  var RATE_MAX = 10, RATE_MS = 60000;

  var Q = (function () { try { return new URLSearchParams(location.search); } catch (e) { return { get: function () { return ''; } }; } })();
  var SOURCE = (Q.get('src') || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 30);

  function $(i) { return document.getElementById(i); }
  function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function load(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function store(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  var ID = newId(), savedNum = '', firstSent = false, done = false;
  var sel = { course: [], country: [], intake: [], branch: [] }, timer = null, lastSent = '';
  var LOC = '', GPS = '', geoAsked = false;

  function cc() { return $('cc').value; }
  function lim() { return (cc() === '' || cc() === '91') ? 10 : 15; }
  function phone() { return $('phone').value.replace(/\D/g, ''); }
  function valid() { var n = phone().length; return lim() === 10 ? n === 10 : (n >= 6 && n <= 15); }
  function data(final) {
    return { id: ID, cc: cc(), phone: phone(), name: $('name').value.trim(), city: $('city').value.trim(),
      course: sel.course.join(', '), country: sel.country.join(', '), intake: sel.intake.join(', '), branch: sel.branch.join(', '),
      source: SOURCE, loc: LOC, gps: GPS, hp: ($('hp') || {}).value || '', final: !!final };
  }

  /* ---------- outbox: every save is kept on the phone until it has gone out ---------- */
  function outbox() { return load('usa_outbox', {}); }
  function put(p) { var o = outbox(); o[p.id] = p; store('usa_outbox', o); count(p.id); }
  function drop(p) { var o = outbox(); if (o[p.id] && o[p.id].t === p.t) { delete o[p.id]; store('usa_outbox', o); } status(); }

  /* ---------- saved count: each new number saved on this phone today = +1 ---------- */
  var DAY = 'usa_saved_' + new Date().toISOString().slice(0, 10);
  function count(id) { var d = load(DAY, {}); if (!d[id]) { d[id] = 1; store(DAY, d); } status(); }
  function status() {
    var el = $('saved'); if (!el) return;
    var n = Object.keys(load(DAY, {})).length, w = Object.keys(outbox()).length;
    if (!n && !w) { el.style.display = 'none'; return; }
    var e = n + (n === 1 ? ' entry' : ' entries') + ' saved today on this phone';
    el.className = (!navigator.onLine || w) ? 'off' : '';
    el.textContent = !navigator.onLine ? '📴 Offline · ' + e + '. ' + (w ? w + ' will send when the internet is back.' : '')
      : w ? '⏳ ' + e + ' · ' + w + ' sending...' : '✓ ' + e;
    el.style.display = 'block';
  }
  window.addEventListener('offline', status);
  /* spam guard: a NEW number may go out only if fewer than RATE_MAX went out in the last minute */
  function admit(id) {
    var a = load('usa_admitted', {}), now = Date.now();
    if (a[id]) return true;
    var recent = 0;
    for (var k in a) { if (now - a[k] > 86400000) delete a[k]; else if (now - a[k] < RATE_MS) recent++; }
    if (recent >= RATE_MAX) { store('usa_admitted', a); return false; }
    a[id] = now; store('usa_admitted', a); return true;
  }
  function post(p, cb) {
    fetch(EXEC, { method: 'POST', mode: 'no-cors', credentials: 'omit', keepalive: !p.final,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(p) })
      .then(function () { drop(p); cb && cb(true); })
      .catch(function () { cb && cb(false); });
  }
  var flushing = false;
  function flush() {
    if (flushing) return; var o = outbox(), list = [];
    for (var k in o) list.push(o[k]);
    if (!list.length) return;
    flushing = true; list.sort(function (a, b) { return a.t - b.t; });
    var left = list.length;
    list.forEach(function (p) {
      if (!admit(p.id)) { if (--left === 0) flushing = false; return; }
      post(p, function () { if (--left === 0) flushing = false; });
    });
  }
  window.addEventListener('online', function () { status(); flush(); });
  setInterval(flush, 15000);

  function send(final, cb) {
    var d = data(final), key = JSON.stringify(d);
    if (!final && key === lastSent) return; lastSent = key;
    d.t = Date.now(); put(d);
    if (!admit(d.id)) { cb && cb(true); return; } // waits in the outbox, flush() sends it later
    post(d, function (ok) { if (!ok) lastSent = ''; cb && cb(true); }); // saved on the phone either way
  }
  function soon() {
    if (!valid() || done) return; clearTimeout(timer); var k = phone();
    // a different number in the same visit = a different person = a new row
    if (savedNum && k.indexOf(savedNum) !== 0 && savedNum.indexOf(k) !== 0) { ID = newId(); firstSent = false; lastSent = ''; }
    if (!firstSent) { firstSent = true; savedNum = k; send(false); askGeo(); return; }
    savedNum = k; timer = setTimeout(function () { send(false); }, 700);
  }
  function beacon() {
    if (!valid() || done) return; clearTimeout(timer);
    var d = data(false), key = JSON.stringify(d); if (key === lastSent) return; lastSent = key;
    d.t = Date.now(); put(d);
    if (!admit(d.id)) return;
    try { if (navigator.sendBeacon && navigator.sendBeacon(EXEC, new Blob([JSON.stringify(d)], { type: 'text/plain;charset=utf-8' }))) return; } catch (e) {}
    post(d);
  }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') beacon(); });
  window.addEventListener('pagehide', beacon);

  /* ---------- phone box ---------- */
  function check(e) {
    var p = $('phone'), c = p.value.replace(/\D/g, '');
    if (c.length === 12 && c.indexOf('91') === 0 && cc() === '') { $('cc').value = '91'; c = c.slice(2); }
    if (c.length > lim() && !(e && e.inputType === 'insertFromPaste') && !p.classList.contains('over')) c = c.slice(0, lim());
    if (c !== p.value) p.value = c;
    var m = $('pmsg'), over = c.length > lim(); p.classList.toggle('over', over);
    if (over) m.innerHTML = '<span class="err">Enter ' + lim() + ' digits only' + (lim() === 10 ? '' : ' (max)') + '.</span>';
    else m.textContent = CONSENT;
    soon();
  }
  $('phone').addEventListener('input', check);
  $('cc').addEventListener('change', check);
  ['phone', 'name', 'city'].forEach(function (i) { $(i).addEventListener('blur', soon); $(i).addEventListener('input', soon); });
  document.querySelectorAll('.chips').forEach(function (g) {
    g.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return; var k = g.dataset.k, v = b.textContent;
      if (g.dataset.one) { g.querySelectorAll('button').forEach(function (x) { x.classList.remove('on'); }); sel[k] = [v]; b.classList.add('on'); }
      else { b.classList.toggle('on'); sel[k] = [].map.call(g.querySelectorAll('.on'), function (x) { return x.textContent; }); }
      soon();
    });
  });

  /* ---------- location: rough guess from the connection; exact area only if they tap Yes ---------- */
  (function () {
    function set(a) { var t = a.filter(function (x) { return x; }).join(', '); if (t) { LOC = t.slice(0, 120); soon(); } }
    fetch('https://ipapi.co/json/').then(function (r) { return r.json(); }).then(function (j) { if (j.error) throw 0; set([j.city, j.region, j.country_name]); })
      .catch(function () { fetch('https://get.geojs.io/v1/ip/geo.json').then(function (r) { return r.json(); }).then(function (j) { set([j.city, j.region, j.country]); }).catch(function () {}); });
  })();
  function askGeo() { if (geoAsked || !navigator.geolocation) return; geoAsked = true; $('geo').style.display = 'block'; }
  function geoMsg(t) { $('geot').textContent = t; $('geob').style.display = 'none'; setTimeout(function () { $('geo').style.display = 'none'; }, 2500); }
  $('geon').addEventListener('click', function () { $('geo').style.display = 'none'; });
  $('geoy').addEventListener('click', function () {
    $('geot').textContent = '📍 Getting your area...'; $('geob').style.display = 'none';
    navigator.geolocation.getCurrentPosition(function (pos) {
      var la = pos.coords.latitude.toFixed(5), lo = pos.coords.longitude.toFixed(5), ll = ' (' + la + ', ' + lo + ')';
      function fin(t) { GPS = ((t || '') + ll).trim(); lastSent = ''; soon(); geoMsg('📍 Thanks! ' + (t || 'Location saved') + '.'); }
      fetch('https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=' + la + '&longitude=' + lo + '&localityLanguage=en')
        .then(function (r) { return r.json(); })
        .then(function (j) { fin([j.locality, j.city, j.principalSubdivision].filter(function (x, i, a) { return x && a.indexOf(x) === i; }).join(', ')); })
        .catch(function () { fin(''); });
    }, function () { geoMsg('No problem, you can continue.'); }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 300000 });
  });

  /* ---------- submit ---------- */
  $('f').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!valid()) { $('pmsg').innerHTML = '<span class="err">' + (phone().length > lim() ? 'Enter ' + lim() + ' digits only.' : 'Please enter the full mobile number.') + '</span>'; $('phone').focus(); return; }
    if (!$('name').value.trim()) { $('name').focus(); $('name').style.borderColor = '#AC070D'; return; }
    clearTimeout(timer); $('go').disabled = true; $('go').textContent = 'Saving...';
    send(true, function () {
      done = true;
      $('card').innerHTML = '<div class="done"><div style="font-size:44px">🎉</div><h2>Thank you, ' + $('name').value.trim().replace(/[<>&"]/g, '') +
        '!</h2><p>A UniSmart counsellor will call you within 24 hours.</p><a class="wa" href="https://wa.me/918108772314?text=Hi%20UniSmart%2C%20I%20just%20filled%20the%20enquiry%20form">Chat on WhatsApp now</a></div>';
    });
  });

  status(); flush(); // send anything left on this phone from earlier
})();
