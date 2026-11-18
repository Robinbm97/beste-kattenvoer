// Kleine scripts zonder afhankelijkheden: kostencalculator en kattenvoer-vergelijker.
(function () {
  var eur = function (n, d) { return '€' + n.toLocaleString('nl-NL', { minimumFractionDigits: d, maximumFractionDigits: d }); };
  var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); };

  // ---------- calculator ----------
  var c = document.querySelector('[data-widget="calc"]');
  if (c) {
    var t = JSON.parse(c.getAttribute('data-t'));
    var w = c.querySelector('#cW'), n = c.querySelector('#cN');
    var run = function () {
      var kg = Number(w.value), cats = Number(n.value);
      var f = (c.querySelector('input[name="cF"]:checked') || {}).value || 'mix';
      c.querySelector('#cKg').textContent = String(kg).replace('.', ',') + ' kg';
      c.querySelector('#cNo').textContent = cats;
      var scale = Math.pow(kg / 4, 0.67);
      var month = function (i) {
        var d = (t.droog[i] * t.g.droog / 1000) * scale, nn = (t.nat[i] * t.g.nat / 1000) * scale;
        var day = f === 'droog' ? d : f === 'nat' ? nn : (d + nn) / 2;
        return day * 30.4 * cats;
      };
      c.querySelector('#cLo').textContent = eur(month(0), 0);
      c.querySelector('#cMid').textContent = eur(month(1), 0);
      c.querySelector('#cHi').textContent = eur(month(2), 0);
    };
    c.addEventListener('input', run); run();
  }

  // ---------- vergelijker ----------
  var v = document.querySelector('[data-widget="vgl"]');
  if (v) {
    var list = v.querySelector('#vList'), more = v.querySelector('#vMore'), count = v.querySelector('#vN'), act = v.querySelector('#vAct');
    var maxI = v.querySelector('#vMax'), maxO = v.querySelector('#vMaxO');
    var st = { form: 'droog', stage: '', price: '', max: 99, t: {}, q: '', sort: 'ppd', shown: 12 }, data = null;
    var labels = { droog: 'Droogvoer', nat: 'Natvoer', vers: 'Vers vlees' }, stages = { kitten: 'Kitten', senior: 'Senior' };
    // kaart: zelfde opbouw als op de rest van de site
    var card = function (r) {
      var tags = [stages[r[4]]].concat(r[5].split(' ').indexOf('graanvrij') >= 0 ? ['Graanvrij'] : []).concat(r[13] === 'budget' ? ['Voordelig'] : []).filter(Boolean).slice(0, 2);
      var nm = String(r[2]).split(/\s+[-–|]\s+/).filter(function (s, i) { return i === 0 || !/kattenvoer|kattenbrok|natvoer|droogvoer|brokjes|brokken|natte voeding|\d|kat\b|multipack|voordeel/i.test(s); }).join(' - ').replace(/\s+\d+([.,]\d+)?\s*(kg|gr|gram|g)\b.*$/i, '');
      var name = r[17] ? '<a href="' + r[17] + '">' + esc(nm) + '</a>' : esc(nm);
      var stats = '<div class="pstats">' + (r[14] != null ? '<div class="st-score"><b>' + String(r[14]).replace('.', ',') + '</b><span>score</span></div><div><b>' + Math.round(r[15]) + '%</b><span>eiwit*</span></div>' : '') + '<div><b>' + eur(r[6], 2) + '</b><span>per dag</span></div>' + (r[14] == null ? '<div><b>' + eur(r[7], 2) + '</b><span>per kilo</span></div>' : '') + '</div>';
      return '<article class="pcard"><div class="pcard-img"><img src="' + esc(r[10]) + '" alt="' + esc(nm) + '" loading="lazy" width="300" height="300"></div><div class="pcard-body"><p class="pcard-brand">' + esc(r[1]) + ' · ' + (labels[r[3]] || '') + '</p><p class="pcard-name">' + name + '</p>' + stats + '<p class="pmeta">' + eur(r[8], 2) + ' · ' + esc(r[9]) + ' · ' + eur(r[7], 2) + '/kg' + (tags.length ? ' <span class="ptags">' + tags.map(function (t) { return '<i>' + esc(t) + '</i>'; }).join('') + '</span>' : '') + '</p><a class="btn btn-buy" href="' + esc(r[11]) + '" rel="sponsored nofollow noopener" target="_blank">Bekijk bij ' + esc(r[12]) + '</a></div></article>';
    };
    var nz = function (x, d) { return x == null ? d : x; };
    var sorts = {
      ppd: function (a, b) { return a[6] - b[6]; }, duur: function (a, b) { return b[6] - a[6]; },
      naam: function (a, b) { return a[2].localeCompare(b[2], 'nl'); },
      score: function (a, b) { return nz(b[14], -1) - nz(a[14], -1); }, eiwit: function (a, b) { return nz(b[15], -1) - nz(a[15], -1); },
      p100: function (a, b) { return nz(a[16], 999) - nz(b[16], 999); }
    };
    var activeCount = function () {
      var n = (st.stage ? 1 : 0) + (st.price ? 1 : 0) + (st.max < 99 ? 1 : 0);
      for (var k in st.t) if (st.t[k]) n++;
      act.hidden = !n; act.textContent = n;
    };
    var draw = function () {
      if (!data) return;
      var q = st.q.toLowerCase();
      var xs = data.filter(function (r) {
        if (st.form && r[3] !== st.form) return false;
        if (st.stage && r[4] !== st.stage) return false;
        if (st.price && r[13] !== st.price) return false;
        if (r[6] > st.max) return false;
        var fl = r[5].split(' ');
        for (var k in st.t) {
          if (!st.t[k]) continue;
          if (k === '_score') { if (r[14] == null) return false; }
          else if (k === '_eiwit') { if (r[15] == null || r[15] < 40) return false; }
          else if (fl.indexOf(k) < 0) return false;
        }
        if (q && (r[1] + ' ' + r[2]).toLowerCase().indexOf(q) < 0) return false;
        return true;
      });
      if (['score', 'eiwit', 'p100'].indexOf(st.sort) >= 0) xs = xs.filter(function (r) { return r[14] != null; });
      xs.sort(sorts[st.sort] || sorts.ppd);
      count.textContent = xs.length.toLocaleString('nl-NL');
      list.innerHTML = xs.slice(0, st.shown).map(card).join('') || '<p>Niets gevonden. Haal een filter weg of zoek op iets anders.</p>';
      more.hidden = xs.length <= st.shown;
      activeCount();
    };
    var load = function () { if (data) return Promise.resolve(); return fetch('/assets/voer.json').then(function (r) { return r.json(); }).then(function (d) { data = d; }); };
    var go = function () { st.shown = 12; load().then(draw); };
    var press = function (sel, on) { v.querySelectorAll(sel).forEach(function (x) { x.setAttribute('aria-pressed', String(on(x))); }); };
    v.querySelectorAll('[data-f]').forEach(function (b) {
      b.addEventListener('click', function () { st[b.dataset.f] = b.dataset.v; press('[data-f="' + b.dataset.f + '"]', function (x) { return x === b; }); go(); });
    });
    v.querySelectorAll('[data-t]').forEach(function (b) {
      b.addEventListener('click', function () { st.t[b.dataset.t] = !st.t[b.dataset.t]; b.setAttribute('aria-pressed', String(!!st.t[b.dataset.t])); go(); });
    });
    maxI.addEventListener('input', function () { var x = Number(maxI.value); st.max = x >= 3 ? 99 : x; maxO.textContent = x >= 3 ? 'geen limiet' : eur(x, 2); go(); });
    var tm; v.querySelector('#vQ').addEventListener('input', function (e) { clearTimeout(tm); tm = setTimeout(function () { st.q = e.target.value.trim(); go(); }, 200); });
    v.querySelector('#vS').addEventListener('change', function (e) { st.sort = e.target.value; go(); });
    v.querySelector('#vReset').addEventListener('click', function () {
      st.stage = ''; st.price = ''; st.max = 99; st.t = {}; maxI.value = 3; maxO.textContent = 'geen limiet';
      press('[data-f="stage"]', function (x) { return x.dataset.v === ''; }); press('[data-f="price"]', function (x) { return x.dataset.v === ''; }); press('[data-t]', function () { return false; });
      go();
    });
    v.querySelector('#vClose').addEventListener('click', function () { v.querySelector('.vgl-filters').open = false; count.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    more.addEventListener('click', function () { st.shown += 24; load().then(draw); });
    // filters standaard open op een groot scherm
    if (window.matchMedia('(min-width: 900px)').matches) v.querySelector('.vgl-filters').open = true;
  }
})();
