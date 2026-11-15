// Token Radar dashboard (model radar-2). Reads window.RADAR from data.js, renders the ranked
// board, the top-10 by expected value, a per-protocol detail view and the methodology. No network:
// every byte shown is in data.js. Farm plans are regenerated in-page from the same derivation
// lib/model.ts writes to board.json (category, chains, TVL, age) and checked against the data.
(function () {
  'use strict';
  var DATA = window.RADAR;
  if (!DATA) return;
  var M = DATA.model;
  var app = document.getElementById('boardWrap');
  var state = { q: '', category: 'all', tab: 'pre', sort: 'implied', dir: -1, selected: null };
  var maxTvl = 0;
  DATA.rows.forEach(function (r) { if (r.tvl_usd > maxTvl) maxTvl = r.tvl_usd; });

  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtPct(n) { if (n === null || n === undefined || !isFinite(n)) return 'n/a'; return (n > 0 ? '+' : '') + n.toFixed(2) + '%'; }
  function fmtAge(d) { if (d === null || d === undefined) return 'unknown'; if (d >= 365) return (d / 365).toFixed(1) + 'y'; return Math.max(0, Math.round(d)) + 'd'; }
  function clip(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else if (k === 'html') node.innerHTML = attrs[k];
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x) node.appendChild(x); });
      else if (typeof c === 'string') node.appendChild(document.createTextNode(c));
      else node.appendChild(c);
    }
    return node;
  }

  // ---- Farm plan: the same derivation as lib/model.ts farmSteps(), no name special-cased. ----
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function secondChainOf(p) { return p.chains && p.chains.length > 1 ? p.chains[1] : null; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function isNoDeposit(p) { var c = (p.category || '').toLowerCase(); return c === 'chain' || c === 'payments'; }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c === 'chain') return name + ' is a chain, not a vault: there is no deposit action to farm here. Only use its native function on ' + chain + ' if the app exposes one without a token, and record it as not farmable if it does not.';
    if (c === 'payments') return name + ' is a payment network, not a vault: there is no deposit action to farm here. Only open a payment channel on ' + chain + ' if you already run the tooling and understand routing; otherwise record it as not farmable and move on.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('uncollateralized lending') >= 0 || c.indexOf('lend') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Lock $' + capital + ' of collateral in ' + name + ' on ' + chain + ' and mint its stable asset against it.';
    if (c.indexOf('basis') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' on ' + chain + ' and open one small basis position.';
    if (c.indexOf('derivative') >= 0 || c.indexOf('perpetual') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' on ' + chain + ' and open one small position.';
    if (c.indexOf('dex') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('leveraged farm') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' leveraged position on ' + chain + ' and keep it open.';
    if (c.indexOf('yield') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault or strategy on ' + chain + ' and keep the shares.';
    if (c.indexOf('liquidity manager') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' managed liquidity position on ' + chain + ' and keep it open.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it; check eligibility first, as RWA positions are often permissioned or KYC-gated.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' on ' + chain + ' and keep the receipt.';
    if (c.indexOf('anchor btc') >= 0 || c.indexOf('decentralized btc') >= 0) return 'Deposit $' + capital + ' of BTC through ' + name + ' on ' + chain + ' and keep the receipt.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + ' on ' + chain + '.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('card') >= 0) return "Use " + name + "'s card product on " + chain + ' for a $' + capital + ' spend and keep the receipt.';
    if (c.indexOf('index') >= 0) return 'Buy $' + capital + ' of the ' + name + ' index on ' + chain + ' and hold it.';
    if (c.indexOf('governance') >= 0) return 'Deposit $' + capital + ' to take part in ' + name + ' governance on ' + chain + ' and vote once.';
    if (c.indexOf('cedefi') >= 0) return 'Deposit $' + capital + ' into ' + name + ' on ' + chain + ' and keep the position open.';
    if (c === 'farm') return 'Deposit $' + capital + ' into a ' + name + ' farm on ' + chain + ' and keep the position open.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function secondaryFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (isNoDeposit(p)) return 'A week later, check whether ' + name + ' has published any usable on-chain action on ' + chain + '; if it still has none, record that and do not force a deposit.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('liquidity manager') >= 0 || c === 'farm') return 'A week later, deposit a second, smaller tranche into the same ' + name + ' vault on ' + chain + ' and withdraw-test a small amount to prove the exit works.';
    if (c.indexOf('lend') >= 0) return 'Borrow a small amount against the supplied collateral on ' + name + ' (only if you understand liquidation), then repay it in full.';
    if (c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Repay or burn a portion of the minted asset on ' + name + ' to prove the position can be unwound.';
    if (c.indexOf('dex') >= 0) return 'Swap a small amount through the ' + name + ' pool on ' + chain + ' to add volume, then check the liquidity position is still intact.';
    if (c.indexOf('basis') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('perpetual') >= 0) return 'Close the position on ' + name + ' and open one fresh small position, spaced days apart from the first.';
    if (c.indexOf('rwa') >= 0 || c.indexOf('stable') >= 0) return 'Hold the position for a full week, then check it is still visible in the app and in your wallet.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Check the staking receipt and rewards page on ' + name + ', and unstake-test a small amount if the lock allows it.';
    if (c.indexOf('prediction') >= 0) return 'Place a second, smaller market position on ' + name + ' on a different market.';
    if (c.indexOf('insurance') >= 0) return 'Check the policy is active in the ' + name + ' app and note its expiry date.';
    if (c.indexOf('card') >= 0) return 'Make a second small card spend through ' + name + ' and keep both receipts.';
    if (c.indexOf('index') >= 0) return 'Check the index composition on ' + name + ' and confirm your holding is still shown.';
    if (c.indexOf('governance') >= 0) return 'Vote a second time on ' + name + ' when the next proposal opens.';
    return 'Repeat the core action once more on ' + name + ' on ' + chain + ', spaced days apart from the first, so the activity is not a single burst.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p, age) {
    var chain = chainOf(p);
    var second = secondChainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(age);
    var action = actionFor(p, capital, chain);
    var breadth = isNoDeposit(p)
      ? 'Breadth does not apply here: ' + p.name + ' is a network, not a vault, so there is no second-chain deposit to repeat.'
      : second !== null
        ? 'Repeat the core position on ' + second + ", the protocol's second listed chain, if gas allows; otherwise note why it was skipped."
        : 'This protocol runs on one chain only (' + chain + '), so there is no second-chain position to repeat; note that in the log.';
    void hold;
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: action, cost: isNoDeposit(p) ? 'no capital unless you choose to use the native function' : '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: secondaryFor(p, capital, chain), cost: 'about $2 of gas', time: '10 minutes' },
      { text: breadth, cost: second !== null && !isNoDeposit(p) ? 'about $' + (capital >= 150 ? 8 : 4) + ' of gas for the second-chain position' : 'nothing', time: second !== null && !isNoDeposit(p) ? '15 minutes' : '5 minutes' },
      { text: "Re-check the protocol's TVL and 7-day change in a fresh snapshot before adding more capital; exit or reduce if TVL falls more than 20% in a week or the position cannot be withdrawn.", cost: 'no fee to check', time: '10 minutes' },
      { text: 'Unverified — no points program confirmed in the snapshot. Do not assume this protocol has points, a reward, or an airdrop; keep the wallet, the dates and every transaction hash in a farm log as the only evidence.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  // ---- Launch-score components, recomputed in-page from the row + model constants. ----
  // sizeDenom uses the largest TVL on the board: every early row is below the $50M floor and every
  // watchlist row is at or above it, so the board maximum is a watchlist TVL (Steakhouse, $2,754M).
  function components(r) {
    var sizeDenom = Math.log10(maxTvl / M.tvl_floor_usd);
    var size = sizeDenom > 0 ? clip(Math.log10(r.tvl_usd / M.tvl_floor_usd) / sizeDenom, 0, 1) : 0;
    var growth = r.change_7d === null ? 0.5 : clip((r.change_7d - M.growth_low) / (M.growth_high - M.growth_low), 0, 1);
    var age = r.age_days, maturity;
    if (age === null || age === undefined) maturity = 0.5;
    else if (age < M.maturity_young_days) maturity = 0.5 * (age / M.maturity_young_days);
    else if (age <= M.maturity_peak_days) maturity = 0.5 + 0.5 * ((age - M.maturity_young_days) / (M.maturity_peak_days - M.maturity_young_days));
    else if (age <= M.maturity_old_days) maturity = 1 - 0.3 * ((age - M.maturity_peak_days) / (M.maturity_old_days - M.maturity_peak_days));
    else maturity = M.maturity_old_value;
    var reach = Math.min((r.chains || []).length, M.reach_cap_chains) / M.reach_cap_chains;
    var p = M.weight_size * size + M.weight_growth * growth + M.weight_maturity * maturity + M.weight_reach * reach;
    return { size: size, growth: growth, maturity: maturity, reach: reach, p: p };
  }

  // ---- Hash state: #q, #category, #sort, #tab, #p — every view is linkable. ----
  function readHash() {
    var params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('sort')) state.sort = params.get('sort');
    if (params.get('tab') === 'live' || params.get('tab') === 'pre') state.tab = params.get('tab');
    if (params.get('p')) state.selected = params.get('p');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.sort !== 'implied') params.set('sort', state.sort);
    if (state.tab !== 'pre') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  function findRow(slug) { for (var i = 0; i < DATA.rows.length; i++) if (DATA.rows[i].slug === slug) return DATA.rows[i]; return null; }

  function filtered() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (!q) return true;
      return [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase().indexOf(q) >= 0;
    });
  }
  function sorted(list) {
    var key = state.sort, dir = state.dir;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'score') { av = a.score; bv = b.score; }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  // ---- Rendering ----
  function renderMeta() {
    document.getElementById('meta').innerHTML = '';
    var meta = document.getElementById('meta');
    meta.appendChild(el('span', null, 'Snapshot ', el('b', { text: DATA.as_of })));
    meta.appendChild(el('span', { text: 'DefiLlama protocol index' }));
    meta.appendChild(el('span', null, 'Model ', el('b', { text: DATA.model_version })));
    meta.appendChild(el('span', null, el('b', { text: String(DATA.board_size) }), ' rows'));
    document.getElementById('n-board').textContent = String(DATA.board_size);
    var facts = document.getElementById('facts');
    facts.innerHTML = '';
    [['Watchlist covered', DATA.watchlist_size + ' / ' + DATA.watchlist_size],
     ['Pre-token rows scored', String(DATA.board_size)],
     ['Early rows below the floor', String(DATA.early_size)],
     ['Live-token protocols set aside', String(DATA.live_size)]
    ].forEach(function (f) {
      var d = document.createElement('div');
      d.appendChild(el('dt', { text: f[0] }));
      d.appendChild(el('dd', { text: f[1] }));
      facts.appendChild(d);
    });
  }

  function renderTop10() {
    var list = DATA.rows.slice().sort(function (a, b) { return a.score_rank - b.score_rank; }).slice(0, 10);
    var ol = document.getElementById('top10');
    ol.innerHTML = '';
    list.forEach(function (r) {
      var li = el('li', { tabindex: '0', role: 'button', 'aria-label': 'Show details for ' + r.name,
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } } },
        el('span', { class: 'crank', text: '#' + r.score_rank + ' BY EXPECTED VALUE' }),
        el('b', { text: r.name }),
        el('span', { class: 'sub', text: (r.category || 'Other') + ' · rank ' + r.rank + ' by implied value' }),
        el('span', { class: 'cimp', text: fmtUsd(r.implied_value_usd) }),
        el('span', { class: 'cmeta' }, el('span', { text: 'P ' + r.launch_score.toFixed(2) }), el('span', { class: 'badge ' + r.confidence, text: r.confidence }))
      );
      ol.appendChild(li);
    });
  }

  function sortHeader(key, label) {
    var th = document.createElement('th');
    th.setAttribute('scope', 'col');
    if (state.sort === key) th.setAttribute('aria-sort', state.dir < 0 ? 'descending' : 'ascending');
    var btn = el('button', { type: 'button', onclick: function () {
      if (state.sort === key) state.dir = -state.dir;
      else { state.sort = key; state.dir = -1; }
      writeHash(); renderBoard();
    } }, label, state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' ↓' : ' ↑' }) : null);
    th.appendChild(btn);
    return th;
  }
  function plainTh(label) { var th = document.createElement('th'); th.setAttribute('scope', 'col'); th.textContent = label; return th; }

  function rowCells(r, maxImplied) {
    var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
    var gc = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
    return [
      el('td', { class: 'num', text: String(r.rank) }),
      el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }),
        el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + ((r.chains || []).slice(0, 2).join(', ') || 'an unnamed chain') }))),
      el('td', null, el('div', { class: 'implied' },
        el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / maxImplied) * 100)) + '%' })),
        el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) }))),
      el('td', { class: 'num', text: fmtUsd(r.score) }),
      el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
      el('td', { class: 'num ' + gc, text: growth }),
      el('td', { class: 'num', text: fmtAge(r.age_days) }),
      el('td', { class: 'num', text: r.launch_score.toFixed(2) }),
      el('td', null, el('span', { class: 'badge ' + r.confidence, text: r.confidence }))
    ];
  }

  function renderBoard() {
    var wrap = app;
    wrap.innerHTML = '';
    document.getElementById('count').textContent = state.tab === 'pre' ? filtered().length + ' of ' + DATA.board_size + ' rows shown' : DATA.live.length + ' live-token protocols';
    document.getElementById('tab-pre').setAttribute('aria-pressed', state.tab === 'pre' ? 'true' : 'false');
    document.getElementById('tab-live').setAttribute('aria-pressed', state.tab === 'live' ? 'true' : 'false');
    if (state.tab === 'live') { wrap.appendChild(liveTable()); return; }
    var list = sorted(filtered());
    if (list.length === 0) {
      wrap.appendChild(el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: clearFilters }))));
      return;
    }
    var maxImplied = 0;
    DATA.rows.forEach(function (r) { if (r.implied_value_usd > maxImplied) maxImplied = r.implied_value_usd; });
    var tbody = el('tbody');
    list.forEach(function (r) {
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false', tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      });
      rowCells(r, maxImplied).forEach(function (c) { tr.appendChild(c); });
      tbody.appendChild(tr);
    });
    var thead = el('thead', null, el('tr', null,
      sortHeader('implied', 'Rank'), plainTh('Protocol'), sortHeader('implied', 'Implied value'),
      sortHeader('score', 'Expected value'), sortHeader('tvl', 'TVL'), sortHeader('growth', '7d'),
      sortHeader('age', 'Age'), plainTh('P'), plainTh('Confidence')));
    // The Rank and Implied headers share one sort key; the second keeps its own label only.
    wrap.appendChild(el('div', { class: 'panel' }, el('div', { class: 'table-wrap' },
      el('table', null,
        el('caption', { class: 'sub', text: 'Pre-token protocols. Select a row for its model breakdown and farm plan. Rank follows implied value; sort by expected value for the analyst\u2019s ordering.' }),
        thead, tbody))));
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      var tr = el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + ((r.chains || []).slice(0, 2).join(', ') || 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'badge HIGH', text: 'ALREADY TRADES' })));
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' }, el('div', { class: 'table-wrap' },
      el('table', null,
        el('caption', { class: 'sub', text: 'Top 24 live-token protocols by market cap. These already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
        el('thead', null, el('tr', null, plainTh('Status'), plainTh('Protocol'), plainTh('TVL'), plainTh('7d'), plainTh('Market cap'), plainTh('Token'))),
        tbody)));
  }

  function renderRatioTable() {
    var byCat = {};
    DATA.rows.forEach(function (r) {
      var c = r.category || 'Unknown';
      if (!byCat[c]) byCat[c] = { ratio: r.ratio, n: r.ratio_n, src: r.ratio_source, conf: r.confidence, count: 0 };
      byCat[c].count++;
    });
    var cats = Object.keys(byCat).sort(function (a, b) { return byCat[b].n - byCat[a].n || (a < b ? -1 : 1); });
    var tbody = document.querySelector('#ratioTable tbody');
    tbody.innerHTML = '';
    cats.forEach(function (c) {
      var v = byCat[c];
      var tr = document.createElement('tr');
      [el('td', { text: c }), el('td', { class: 'num', text: String(v.n) }), el('td', { class: 'num', text: v.ratio.toFixed(4) }),
       el('td', { text: v.src }), el('td', null, el('span', { class: 'badge ' + v.conf, text: v.conf })),
       el('td', { class: 'num', text: String(v.count) })].forEach(function (cell) { tr.appendChild(cell); });
      tbody.appendChild(tr);
    });
  }

  // ---- Detail view ----
  var dialog = document.getElementById('detail');
  dialog.addEventListener('close', function () { if (state.selected) { state.selected = null; writeHash(); renderBoard(); } });

  function pBar(label, value, weight) {
    return el('div', { class: 'pbar' },
      el('span', { text: label + ' × ' + weight }),
      el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.round(value * 100) + '%' })),
      el('b', { text: value.toFixed(2) }));
  }
  function openDetail(slug) {
    var row = findRow(slug);
    if (!row) return;
    state.selected = slug;
    writeHash();
    var comp = components(row);
    var steps = farmSteps(row, row.age_days);
    var match = Array.isArray(row.farm_steps) && row.farm_steps.length === steps.length &&
      row.farm_steps.every(function (s, i) { return s === steps[i]; });
    var impliedCheck = Math.round(row.tvl_usd * row.ratio);
    dialog.innerHTML = '';
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'RANK ' + row.rank + ' OF ' + DATA.board_size + '  ·  #' + row.score_rank + ' BY EXPECTED VALUE' }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + ((row.chains || []).join(', ') || 'an unnamed chain') + ' · listed ' + (row.listed_at || 'unknown') })),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'kpis' },
        el('div', { class: 'kpi' }, el('span', { text: 'Implied value' }), el('b', { text: fmtUsd(row.implied_value_usd) })),
        el('div', { class: 'kpi' }, el('span', { text: 'Expected value (score)' }), el('b', { text: fmtUsd(row.score) })),
        el('div', { class: 'kpi' }, el('span', { text: 'TVL' }), el('b', { text: fmtUsd(row.tvl_usd) })),
        el('div', { class: 'kpi' }, el('span', { text: '7-day change' }), el('b', { class: row.change_7d !== null && row.change_7d >= 0 ? 'pos' : 'neg', text: fmtPct(row.change_7d) })),
        el('div', { class: 'kpi' }, el('span', { text: 'Age with no token' }), el('b', { text: fmtAge(row.age_days) })),
        el('div', { class: 'kpi' }, el('span', { text: 'Launch score P' }), el('b', { text: row.launch_score.toFixed(4) }))),
      el('div', { class: 'equation', style: 'margin-top:12px' },
        el('div', null, el('span', { text: 'Ratio (mcap/TVL, ' + row.ratio_source + ', n=' + row.ratio_n + ')' }), el('b', { text: row.ratio.toFixed(4) + '  ·  ' + row.confidence })),
        el('div', null, el('span', { text: 'Check: TVL × ratio' }), el('b', { text: fmtUsd(impliedCheck) })),
        el('div', null, el('span', { text: 'Score = implied × P (unrounded P)' }), el('b', { text: fmtUsd(row.score) }))),
      el('p', { class: 'check', text: 'The check differs from the board value only because the ratio is shown to 4 decimals. ' + DATA.implied_note + ' ' + DATA.launch_score_note })));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Launch score P — recomputed here from the row' }),
      pBar('Size (log TVL)', comp.size, M.weight_size),
      pBar('Growth (7d)', comp.growth, M.weight_growth),
      pBar('Maturity (age)', comp.maturity, M.weight_maturity),
      pBar('Reach (chains)', comp.reach, M.weight_reach),
      el('p', { class: 'check', text: 'Recomputed P = ' + comp.p.toFixed(4) + '; the board carries ' + row.launch_score.toFixed(4) + ' (rounded to 4 decimals). Chains: ' + (row.chains || []).length + '.' })));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan — 6 steps' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        return el('li', null, el('b', { text: at >= 0 ? s.slice(0, at) : s }), el('span', { class: 'cost', text: at >= 0 ? s.slice(at + 1) : '' }));
      })),
      el('p', { class: 'check', style: 'margin-top:12px' },
        match ? el('b', { text: 'Plan verified: ' }) : el('b', { text: 'Plan differs from board.json: ' }),
        document.createTextNode(match ? 'these steps, regenerated in-page, match the farm_steps board.json carries for this protocol.' : 'the regenerated steps do not match board.json for this protocol — treat the plan as unreviewed.'))));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Read this before farming' }),
      el('p', { class: 'note', text: 'Unverified — no points program confirmed in the snapshot. Do not assume this protocol has points, a reward, or an airdrop.' }),
      el('p', { class: 'check', style: 'margin-top:12px', text: 'P is a relative ranking score, not a probability: P = ' + row.launch_score.toFixed(2) + ' does not mean a ' + Math.round(row.launch_score * 100) + '% chance of launching. Implied value is an implied market cap, not FDV — the snapshot carries no FDV or supply, so a launch\u2019s FDV would typically be higher than its day-1 market cap. Capital figures in the plan ($50–$250) are sizing suggestions, not promises; no yield, APY or fee figure is quoted anywhere, because none is in the snapshot.' })));
    if (typeof dialog.showModal === 'function') { if (!dialog.open) dialog.showModal(); }
    else dialog.setAttribute('open', '');
    renderBoard();
  }

  // ---- Controls + init ----
  function clearFilters() {
    state.q = ''; state.category = 'all'; state.sort = 'implied'; state.dir = -1;
    document.getElementById('q').value = '';
    document.getElementById('category').value = 'all';
    document.getElementById('sort').value = 'implied';
    writeHash(); renderBoard();
  }
  function wireControls() {
    var cats = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var sel = document.getElementById('category');
    cats.forEach(function (c) {
      var o = document.createElement('option');
      o.value = c; o.textContent = c;
      if (c === state.category) o.selected = true;
      sel.appendChild(o);
    });
    var q = document.getElementById('q');
    q.value = state.q;
    q.addEventListener('input', function () { state.q = q.value; writeHash(); renderBoard(); });
    sel.addEventListener('change', function () { state.category = sel.value; writeHash(); renderBoard(); });
    var sort = document.getElementById('sort');
    sort.value = state.sort;
    sort.addEventListener('change', function () { state.sort = sort.value; state.dir = -1; writeHash(); renderBoard(); });
    document.getElementById('tab-pre').addEventListener('click', function () { state.tab = 'pre'; writeHash(); renderBoard(); });
    document.getElementById('tab-live').addEventListener('click', function () { state.tab = 'live'; writeHash(); renderBoard(); });
    document.getElementById('clear').addEventListener('click', clearFilters);
    window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && dialog.open) dialog.close(); });
    window.addEventListener('hashchange', function () { readHash(); q.value = state.q; sel.value = state.category; sort.value = state.sort; renderBoard(); });
  }

  readHash();
  renderMeta();
  renderTop10();
  wireControls();
  renderRatioTable();
  renderBoard();
  if (state.selected) openDetail(state.selected);
})();
