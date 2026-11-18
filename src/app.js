// Kleine, afhankelijkheidsvrije scripts: vergelijker en zoekfunctie.
(function () {
  var fmt = function (n) { return '€' + Math.round(n).toLocaleString('nl-NL'); };

  // ---------- Vergelijker ----------
  var list = document.getElementById('cmpList');
  if (list) {
    var state = { budget: 900, sort: 'score', f: {} };
    var budget = document.getElementById('budget');
    var budgetOut = document.getElementById('budgetOut');
    var countOut = document.getElementById('countOut');
    var empty = document.getElementById('emptyMsg');
    var items = Array.prototype.slice.call(list.children);
    items.forEach(function (el, i) { el.dataset.rank = i; });

    var render = function () {
      budgetOut.textContent = state.budget >= 900 ? 'Geen limiet' : fmt(state.budget);
      var visible = 0;
      items.forEach(function (el) {
        var f = JSON.parse(el.dataset.f);
        var ok = Number(el.dataset.price) <= (state.budget >= 900 ? Infinity : state.budget);
        Object.keys(state.f).forEach(function (k) { if (state.f[k] && !f[k]) ok = false; });
        if (ok) visible++;
        document.querySelectorAll('[data-col="' + el.dataset.col + '"]').forEach(function (x) { x.classList.toggle('is-hidden', !ok); });
      });
      items.slice().sort(function (a, b) {
        return state.sort === 'price' ? Number(a.dataset.price) - Number(b.dataset.price) : Number(a.dataset.rank) - Number(b.dataset.rank);
      }).forEach(function (el) { list.appendChild(el); });
      countOut.textContent = visible + ' van ' + items.length;
      empty.hidden = visible !== 0;
    };

    budget.addEventListener('input', function () { state.budget = Number(budget.value); render(); });
    document.querySelectorAll('[data-sort]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.sort = b.dataset.sort;
        document.querySelectorAll('[data-sort]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        render();
      });
    });
    document.querySelectorAll('[data-filter]').forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.dataset.filter;
        state.f[k] = !state.f[k];
        b.setAttribute('aria-pressed', String(state.f[k]));
        render();
      });
    });
    var tg = document.getElementById('tableToggle');
    if (tg) tg.addEventListener('click', function () {
      var open = tg.getAttribute('aria-expanded') !== 'true';
      tg.setAttribute('aria-expanded', String(open));
      document.getElementById('cmpTable').classList.toggle('is-open', open);
      tg.textContent = open ? 'Tabel verbergen' : 'Alles naast elkaar in één tabel';
    });
    render();
  }


  // ---------- Keuzehulp ----------
  var kh = document.getElementById('khData');
  if (kh) {
    var items = JSON.parse(kh.textContent);
    var form = document.getElementById('khForm');
    var out = document.getElementById('khResults');
    var note = document.getElementById('khNote');
    var bud = document.getElementById('khBudget');
    var budOut = document.getElementById('khBudgetOut');
    var refurb = document.getElementById('khRefurb');
    var val = function (n) { var el = form.querySelector('input[name="' + n + '"]:checked'); return el ? el.value : ''; };
    var esc2 = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
    var run = function () {
      var b = Number(bud.value); budOut.textContent = b >= 900 ? 'Geen limiet' : fmt(b);
      var kg = val('kg'), cats = Number(val('cats')), shape = val('shape'), smart = val('smart');
      var res = items.map(function (p) {
        var s = p.s * 10, why = [];
        if (b < 900 && p.pr > b) return null;
        if (!refurb.checked && p.rf) return null;
        if (kg === 'big') { if (p.big || (p.max && p.max >= 10)) { s += 25; why.push(p.max ? 'Geschikt tot ' + p.max + ' kg' : 'Extra ruim'); } else s -= 30; }
        if (kg === 'small') { if (p.min && p.min <= 1.4) { s += 15; why.push('Laag minimumgewicht (' + String(p.min).replace('.', ',') + ' kg)'); } }
        if (cats >= 2) { if (p.multi) { s += 15; why.push('Geschikt voor meerdere katten'); } else s -= 10; if (p.waste) s += 5; }
        if (shape === 'open') { if (p.shape === 'open') { s += 30; why.push('Open model, geen kap'); } else s -= 20; }
        if (smart === 'cam') { if (p.cam) { s += 25; why.push('Met camera'); } else s -= 40; }
        if (smart === 'app') { if (p.app === true) { s += 10; why.push('App met gewicht en gebruik'); } else s -= 15; }
        if (p.rf) why.push('Refurbished, dus voordeliger');
        if (!why.length) why.push(p.bf);
        return { p: p, s: s, why: why };
      }).filter(Boolean).sort(function (a, c) { return c.s - a.s; }).slice(0, 3);
      out.innerHTML = res.length ? res.map(function (r, n) {
        return '<a class="kh-res' + (n === 0 ? ' is-top' : '') + '" href="' + r.p.u + '"><img src="' + r.p.i + '" width="72" height="72" alt="' + esc2(r.p.n) + '" loading="lazy"><span><small>' + (n === 0 ? 'Beste match' : 'Match ' + (n + 1)) + '</small><b>' + esc2(r.p.n) + '</b><em>' + esc2(r.why.slice(0, 2).join(' · ')) + '</em></span><span class="kh-price">' + fmt(r.p.pr) + '<small>' + esc2(r.p.sh) + (r.p.rf ? ', refurb.' : '') + '</small></span></a>';
      }).join('') : '<p>Geen bak past bij deze combinatie. Verhoog je budget of zet refurbished aan.</p>';
      note.textContent = kg === 'small' ? 'Let op: zet bij een kitten onder het minimumgewicht de automatische reiniging uit tot hij zwaar genoeg is.' : '';
    };
    form.addEventListener('change', run); bud.addEventListener('input', run); refurb.addEventListener('change', run); run();
  }

  // ---------- Kostencalculator ----------
  var kc = document.getElementById('kcTotal');
  if (kc) {
    var g = function (id) { return document.getElementById(id); };
    var calc = function () {
      var price = Number(g('kcPrice').value), cats = Number(g('kcCats').value), yrs = Number(g('kcYears').value), bag = Number(g('kcBag').value);
      g('kcPriceOut').textContent = fmt(price); g('kcCatsOut').textContent = cats; g('kcYearsOut').textContent = yrs; g('kcBagOut').textContent = '€' + bag.toFixed(2).replace('.', ',');
      var bags = 52 * cats * bag * yrs, filt = 4 * 14 * yrs, power = 12 * yrs, litter = 3 * 12 * cats * 2.2 * yrs;
      var tot = price + bags + filt + power + litter;
      kc.textContent = fmt(tot);
      g('kcMonth').textContent = 'Dat is ' + fmt(tot / (yrs * 12)) + ' per maand over ' + yrs + ' jaar.';
      g('kcList').innerHTML = [['Aanschaf', price], ['Afvalzakken', bags], ['Filters / geurblokjes', filt], ['Kattenbakvulling', litter], ['Stroom', power]].map(function (x) { return '<li><span>' + x[0] + '</span><b>' + fmt(x[1]) + '</b></li>'; }).join('');
    };
    ['kcPrice', 'kcCats', 'kcYears', 'kcBag'].forEach(function (id) { g(id).addEventListener('input', calc); });
    calc();
  }

  // ---------- Zoeken ----------
  var results = document.getElementById('results');
  if (results) {
    var input = document.getElementById('q');
    var params = new URLSearchParams(location.search);
    var idx = null;
    var esc = function (s) { return s.replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
    var run = function () {
      var q = (input.value || '').trim().toLowerCase();
      if (!q || !idx) { results.innerHTML = ''; return; }
      var words = q.split(/\s+/);
      var hits = idx.map(function (p) {
        var hay = (p.t + ' ' + p.k + ' ' + p.d + ' ' + p.x).toLowerCase();
        var s = 0;
        words.forEach(function (w) { if (p.t.toLowerCase().indexOf(w) > -1) s += 5; if (p.k.toLowerCase().indexOf(w) > -1) s += 3; if (hay.indexOf(w) > -1) s += 1; });
        return { p: p, s: s };
      }).filter(function (h) { return h.s > 0; }).sort(function (a, b) { return b.s - a.s; }).slice(0, 12);
      results.innerHTML = hits.length ? hits.map(function (h) {
        return '<a class="rel-card" href="' + h.p.u + '"><b>' + esc(h.p.t) + '</b><span>' + esc(h.p.d) + '</span></a>';
      }).join('') : '<p>Niks gevonden. Probeer een ander woord, of kijk in de <a href="/kennisbank/">kennisbank</a>.</p>';
    };
    fetch('/search-index.json').then(function (r) { return r.json(); }).then(function (j) { idx = j; run(); });
    input.value = params.get('q') || '';
    input.addEventListener('input', run);
  }
})();
