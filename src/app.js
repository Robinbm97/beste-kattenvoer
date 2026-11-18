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
    var list = v.querySelector('#vList'), more = v.querySelector('#vMore'), count = v.querySelector('#vN');
    var st = { form: 'droog', stage: '', t: {}, q: '', sort: 'ppd', shown: 12 }, data = null;
    var labels = { droog: 'Droogvoer', nat: 'Natvoer', vers: 'Vers vlees' }, stages = { kitten: 'Kitten', senior: 'Senior' };
    var fl = { graanvrij: 'Graanvrij', gesteriliseerd: 'Gesteriliseerd', gevoelig: 'Gevoelige maag', gewicht: 'Light', bio: 'Biologisch' };
    var card = function (r) {
      var tags = [stages[r[4]]].concat(r[5].split(' ').indexOf('graanvrij') >= 0 ? ['Graanvrij'] : []).concat(r[13] === 'budget' ? ['Voordelig'] : []).filter(Boolean).slice(0, 2);
      var nm = String(r[2]).split(/\s+[-–|]\s+/).filter(function (s, i) { return i === 0 || !/kattenvoer|kattenbrok|natvoer|droogvoer|brokjes|brokken|natte voeding|\d|kat\b|multipack|voordeel/i.test(s); }).join(' - ').replace(/\s+\d+([.,]\d+)?\s*(kg|gr|gram|g)\b.*$/i, '');
      var name = r[17] ? '<a href="' + r[17] + '">' + esc(nm) + '</a>' : esc(nm);
      var stats = '<div class="pstats">' + (r[14] != null ? '<div class="st-score"><b>' + String(r[14]).replace('.', ',') + '</b><span>score</span></div><div><b>' + Math.round(r[15]) + '%</b><span>eiwit*</span></div>' : '') + '<div><b>' + eur(r[6], 2) + '</b><span>per dag</span></div>' + (r[14] == null ? '<div><b>' + eur(r[7], 2) + '</b><span>per kilo</span></div>' : '') + '</div>';
      return '<article class="pcard"><div class="pcard-img"><img src="' + esc(r[10]) + '" alt="' + esc(nm) + '" loading="lazy" width="300" height="300"></div><div class="pcard-body"><p class="pcard-brand">' + esc(r[1]) + ' · ' + (labels[r[3]] || '') + '</p><p class="pcard-name">' + name + '</p>' + stats + '<p class="pmeta">' + eur(r[8], 2) + ' · ' + esc(r[9]) + ' · ' + eur(r[7], 2) + '/kg' + (tags.length ? ' <span class="ptags">' + tags.map(function (t) { return '<i>' + esc(t) + '</i>'; }).join('') + '</span>' : '') + '</p><a class="btn btn-buy" href="' + esc(r[11]) + '" rel="sponsored nofollow noopener" target="_blank">Bekijk bij ' + esc(r[12]) + '</a></div></article>';
    };
    var draw = function () {
      if (!data) return;
      var q = st.q.toLowerCase();
      var xs = data.filter(function (r) {
        if (st.form && r[3] !== st.form) return false;
        if (st.stage && r[4] !== st.stage) return false;
        for (var k in st.t) if (st.t[k] && r[5].split(' ').indexOf(k) < 0) return false;
        if (q && (r[1] + ' ' + r[2]).toLowerCase().indexOf(q) < 0) return false;
        return true;
      });
      var nz = function (v, d) { return v == null ? d : v; };
      if (['score', 'eiwit', 'p100'].indexOf(st.sort) >= 0) xs = xs.filter(function (r) { return r[14] != null; });
      xs.sort(st.sort === 'score' ? function (a, b) { return nz(b[14], 0) - nz(a[14], 0); } : st.sort === 'eiwit' ? function (a, b) { return nz(b[15], 0) - nz(a[15], 0); } : st.sort === 'p100' ? function (a, b) { return nz(a[16], 999) - nz(b[16], 999); } : st.sort === 'duur' ? function (a, b) { return b[6] - a[6]; } : st.sort === 'naam' ? function (a, b) { return a[2].localeCompare(b[2], 'nl'); } : function (a, b) { return a[6] - b[6]; });
      count.textContent = xs.length.toLocaleString('nl-NL');
      list.innerHTML = xs.slice(0, st.shown).map(card).join('') || '<p>Niets gevonden. Haal een filter weg of zoek op iets anders.</p>';
      more.hidden = xs.length <= st.shown;
    };
    var load = function () { if (data) return Promise.resolve(); return fetch('/assets/voer.json').then(function (r) { return r.json(); }).then(function (d) { data = d; }); };
    var go = function () { st.shown = 12; load().then(draw); };
    v.querySelectorAll('[data-f]').forEach(function (b) {
      b.addEventListener('click', function () {
        st[b.dataset.f] = b.dataset.v;
        v.querySelectorAll('[data-f="' + b.dataset.f + '"]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        go();
      });
    });
    v.querySelectorAll('[data-t]').forEach(function (b) {
      b.addEventListener('click', function () { st.t[b.dataset.t] = !st.t[b.dataset.t]; b.setAttribute('aria-pressed', String(!!st.t[b.dataset.t])); go(); });
    });
    var tm; v.querySelector('#vQ').addEventListener('input', function (e) { clearTimeout(tm); tm = setTimeout(function () { st.q = e.target.value.trim(); go(); }, 200); });
    v.querySelector('#vS').addEventListener('change', function (e) { st.sort = e.target.value; go(); });
    more.addEventListener('click', function () { st.shown += 24; load().then(draw); });
  }
})();
