// ==== CONFIG: your Worker URL ====
const BACKEND_URL = 'https://trakstar-backend.krb52.workers.dev';

// ==== small UI helpers ====
function showModal(title, content) {
  const n = typeof content === 'string'
    ? (() => { const p=document.createElement('pre'); p.style.whiteSpace='pre-wrap'; p.textContent=content; return p; })()
    : content;
  createModal(title, [n], null, "Close");
}
function fetchJSON(url, opts = {}) {
  return fetch(url, { ...opts, headers: { 'Content-Type':'application/json', ...(opts.headers||{}) } })
    .then(async r => { if (!r.ok) throw new Error((await r.text().catch(()=>r.statusText))||r.statusText); return r.json(); });
}
function by(k){ return (a,b) => (a[k] > b[k]) ? 1 : (a[k] < b[k]) ? -1 : 0; }
const el = (t,props={},kids=[]) => Object.assign(document.createElement(t),props, kids.length?{append:undefined}:{});
const groupBy = (arr, keyFn) => arr.reduce((m,x)=>{ const k=keyFn(x); (m[k]=m[k]||[]).push(x); return m; }, {});

// ==== Plaid Link (connect + update) ====
function isOauthReturn(){ return /plaid-oauth/.test(location.hash); }
async function createLinkToken(params={}) {
  const redirect = location.origin + location.pathname + '#plaid-oauth';
  const res = await fetchJSON(`${BACKEND_URL}/plaid/create_link_token`, {
    method: 'POST', body: JSON.stringify({ userId:'default', redirect_uri: redirect, ...params })
  });
  return res.link_token;
}
async function connectBank(isOauth=false) {
  try {
    const linkToken = await createLinkToken();
    const handler = window.Plaid.create({
      token: linkToken,
      receivedRedirectUri: isOauth ? location.href : undefined,
      onSuccess: async (public_token, metadata) => {
        await fetchJSON(`${BACKEND_URL}/plaid/exchange_public_token`, {
          method: 'POST',
          body: JSON.stringify({ userId: 'default', public_token, institution: metadata?.institution || null })
        });
        await fetchJSON(`${BACKEND_URL}/plaid/refresh_accounts?user=default`);
        showModal('Connected', 'Your institution was linked successfully.');
      },
      onExit: (err) => { if (err) showModal('Link error', err.display_message || err.error_message || err.message || 'Unknown error'); }
    });
    handler.open();
  } catch (e) { showModal('Connect Bank Failed', e.message); }
}

// ==== Backend wrappers ====
const api = {
  getAccounts: () => fetchJSON(`${BACKEND_URL}/plaid/accounts?user=default`),
  getMappings: () => fetchJSON(`${BACKEND_URL}/plaid/mappings?user=default`),
  saveMappings: (m) => fetchJSON(`${BACKEND_URL}/plaid/mappings`, { method:'POST', body: JSON.stringify({ userId:'default', mappings:m }) }),
  unlinkItem: (itemId) => fetchJSON(`${BACKEND_URL}/plaid/unlink_item`, { method:'POST', body: JSON.stringify({ userId:'default', item_id:itemId }) }),
  balance: (account_id) => fetchJSON(`${BACKEND_URL}/bank/balance?user=default&account_id=${encodeURIComponent(account_id)}`),
  transactions: (account_id, from, to) => fetchJSON(`${BACKEND_URL}/bank/transactions?user=default&account_id=${encodeURIComponent(account_id)}&from=${from}&to=${to}`),
  getPrefs: () => fetchJSON(`${BACKEND_URL}/plaid/account_prefs?user=default`),
  savePrefs: (p) => fetchJSON(`${BACKEND_URL}/plaid/account_prefs`, { method:'POST', body: JSON.stringify({ userId:'default', prefs:p }) })
};

// ==== Counters helper (from app.js API) ====
function getFinancialCounters() {
  const counters = (window.TrakStar && window.TrakStar.getCounters ? window.TrakStar.getCounters() : []);
  return counters.filter(c => c.counterType === 'financial');
}

// ==== Manage Linked Accounts (group + hide + reorder + unlink) ====
async function openManageBanks() {
  try {
    const [acctPayload, mapPayload, prefsPayload] = await Promise.all([api.getAccounts(), api.getMappings(), api.getPrefs().catch(()=>({}))]);
    const accounts = acctPayload.accounts || [];
    const mappings = mapPayload.mappings || {}; // { trackerId -> { account_id, item_id } }
    const prefs = prefsPayload.prefs || { hidden: [], order: [] };

    const wrapper = document.createElement('div');
    wrapper.style.maxWidth = '640px';
    wrapper.innerHTML = `<div class="small-muted" style="margin-bottom:.5rem">
      Link any Plaid account to a financial counter (auto-updates balances).
      Drag to reorder, click 👁 to hide/show, or unlink an institution entirely.
    </div>`;

    // Group by institution
    const groups = groupBy(accounts, a => a.institution_name || 'Bank');
    const orderedIds = prefs.order && prefs.order.length ? prefs.order : Object.values(groups).flat().map(a=>a.account_id);

    // Build a list section per institution
    for (const instName of Object.keys(groups).sort()) {
      const inst = groups[instName];
      const instItemId = inst[0].item_id;

      const h = document.createElement('div');
      h.className = 'inline';
      h.style.alignItems = 'center';
      h.style.margin = '.5rem 0';
      h.append(
        el('div', { innerHTML:`<strong>${instName}</strong>`, style:'flex:1' }),
        el('button', { textContent: 'Unlink', title:'Unlink institution', onclick: async () => {
          if (!confirm(`Unlink ${instName}?`)) return;
          await api.unlinkItem(instItemId);
          alert('Unlinked.');
          openManageBanks(); // reload modal
        }})
      );
      wrapper.appendChild(h);

      // Accounts list (draggable)
      const list = document.createElement('div');
      const instOrder = orderedIds.filter(id => inst.some(a => a.account_id === id))
        .concat(inst.filter(a => !orderedIds.includes(a.account_id)).map(a=>a.account_id));

      for (const accountId of instOrder) {
        const a = inst.find(x => x.account_id === accountId); if (!a) continue;
        const row = el('div', { className:'drag-row', draggable:true, dataset:{ accountId: a.account_id } });
        row.append(
          el('div', { className:'drag-handle', textContent:'↕' }),
          el('div', { textContent:`${a.name}${a.mask ? ' ••••'+a.mask : ''}` }),
          (() => {
            const btn = el('button', { textContent: prefs.hidden.includes(a.account_id) ? '👁' : '🙈', title:'Hide / Show' });
            btn.onclick = () => { const i = prefs.hidden.indexOf(a.account_id); if (i>-1) prefs.hidden.splice(i,1); else prefs.hidden.push(a.account_id); btn.textContent = i>-1 ? '🙈' : '👁'; };
            return btn;
          })()
        );

        // drag events
        row.addEventListener('dragstart', e => { row.classList.add('dragging'); e.dataTransfer.setData('text/plain', a.account_id); });
        row.addEventListener('dragend',   () => row.classList.remove('dragging'));
        list.addEventListener('dragover', e => {
          e.preventDefault();
          const dragging = $('.dragging', list);
          const after = Array.from(list.children).find(ch => ch !== dragging && e.clientY <= ch.getBoundingClientRect().top + ch.offsetHeight/2);
          if (!after) list.appendChild(dragging); else list.insertBefore(dragging, after);
        });

        list.appendChild(row);
      }
      wrapper.appendChild(list);
    }

    // Mapping section (counter -> account)
    const mapWrap = document.createElement('div');
    mapWrap.style.marginTop = '1rem';
    mapWrap.innerHTML = `<div style="margin:.25rem 0" class="small-muted">Link counters</div>`;
    const tbl = document.createElement('div'); tbl.style.display='grid'; tbl.style.gridTemplateColumns='1fr 1fr'; tbl.style.gap='.35rem';
    const ctrs = getFinancialCounters();
    const acctOptions = accounts
      .filter(a => !prefs.hidden.includes(a.account_id))
      .sort((a,b) => (a.institution_name||'').localeCompare(b.institution_name||'') || (a.name||'').localeCompare(b.name||''));
    for (const c of ctrs) {
      const label = el('div', { textContent: c.name });
      const sel = document.createElement('select');
      sel.append(el('option', { value:'', textContent:'— Not linked —' }));
      for (const a of acctOptions) {
        const opt = el('option', { value:c.id, textContent:`${a.institution_name || 'Bank'} • ${a.name}${a.mask?' ••••'+a.mask:''}` });
        opt.dataset.accountId = a.account_id;
        opt.dataset.itemId = a.item_id;
        sel.appendChild(opt);
      }
      // preselect by mapping
      const found = Object.entries(mappings).find(([,m]) => m.account_id && m.item_id && m && m.account_id);
      // but we want the mapping for this counter:
      const mine = mappings[c.id];
      if (mine) {
        const matchingOption = Array.from(sel.options).find(o => o.dataset.accountId === mine.account_id);
        if (matchingOption) sel.value = c.id;
      }

      tbl.append(label, sel);
    }
    mapWrap.appendChild(tbl);
    wrapper.appendChild(mapWrap);

    // Actions
    const saveRow = el('div', { style:'text-align:right; margin-top:12px' });
    const saveBtn = el('button', { textContent:'Save' });
    saveBtn.onclick = async () => {
      // collect new order
      const newOrder = Array.from(wrapper.querySelectorAll('.drag-row')).map(r => r.dataset.accountId);
      prefs.order = newOrder;

      // Build mapping { trackerId -> {account_id,item_id} }
      const newMap = {};
      tbl.querySelectorAll('select').forEach(sel => {
        const opt = sel.selectedOptions[0]; if (!opt || !sel.value) return;
        newMap[sel.value] = { account_id: opt.dataset.accountId, item_id: opt.dataset.itemId };
      });

      await Promise.all([ api.savePrefs(prefs), api.saveMappings(newMap) ]);
      localStorage.setItem('plaidMappingsCached', JSON.stringify(newMap));
      alert('Saved. Balances will refresh shortly.');
      syncLinkedBalances(true);
    };
    saveRow.append(saveBtn);
    wrapper.appendChild(saveRow);

    showModal('Manage Linked Accounts', wrapper);
  } catch (e) {
    showModal('Manage Accounts', `Could not load accounts. ${e.message}`);
  }
}

// ==== Balance sync ====
async function syncLinkedBalances(showErrors=false) {
  try {
    let map = null;
    try { map = (await api.getMappings()).mappings || null; } catch {}
    if (!map) map = JSON.parse(localStorage.getItem('plaidMappingsCached') || '{}');

    const entries = Object.entries(map);
    if (!entries.length) return;

    for (const [trackerId, link] of entries) {
      try {
        const data = await api.balance(link.account_id); // { balance }
        if (window.TrakStar && window.TrakStar.updateCounterValue) {
          window.TrakStar.updateCounterValue(trackerId, Number(data.balance || 0), /*isBank*/true);
        }
      } catch (err) {
        if (showErrors) console.warn('Balance update failed for', trackerId, err);
      }
    }
  } catch (e) {
    if (showErrors) console.warn('sync error', e);
  }
}
setInterval(() => syncLinkedBalances(false), 5 * 60 * 1000);
window.addEventListener('DOMContentLoaded', () => syncLinkedBalances(false));

// ==== On-demand fetch (single) ====
async function onFetchBalance() {
  try {
    const ctrs = getFinancialCounters();
    if (!ctrs.length) return alert("Create a financial counter first.");
    const sel = document.createElement('select');
    for (const c of ctrs) sel.append(el('option',{value:c.id,textContent:c.name}));
    const wrap = document.createElement('div');
    wrap.append(el('div',{className:'small-muted',textContent:'Pick the linked counter to refresh'}), sel);
    createModal('Fetch Balance',[wrap], async () => {
      const map = (await api.getMappings()).mappings || {};
      const link = map[sel.value]; if (!link) return alert('That counter is not linked.');
      const data = await api.balance(link.account_id);
      window.TrakStar.updateCounterValue(sel.value, Number(data.balance || 0), true);
    }, 'Fetch');
  } catch (e) { showModal('Bank Error', `Could not fetch balance. ${e.message}`); }
}

// ==== Transactions ====
async function onFetchTransactions() {
  try {
    const counters = getFinancialCounters();
    if (!counters.length) return alert("Create a financial counter first.");
    const sel = document.createElement('select');
    for (const c of counters) sel.append(el('option',{value:c.id,textContent:c.name}));
    const from = el('input',{type:'date'}); const to = el('input',{type:'date'});
    const row = el('div',{className:'inline'},[from,to]); const wrap = el('div'); wrap.append(row, document.createElement('hr'));
    const out = el('div',{style:'max-height:40vh;overflow:auto;font-family:ui-monospace,monospace;font-size:.9rem'});
    wrap.append(out);
    createModal('Fetch Transactions',[wrap], async () => {
      const map = (await api.getMappings()).mappings || {};
      const link = map[sel.value]; if (!link) return alert('That counter is not linked.');
      const res = await api.transactions(link.account_id, from.value, to.value);
      out.textContent = JSON.stringify(res.transactions || [], null, 2);
    }, 'Fetch');
  } catch (e) { showModal('Bank Error', `Could not fetch transactions. ${e.message}`); }
}

// auto-finish Plaid OAuth
window.addEventListener('DOMContentLoaded', () => { if (isOauthReturn()) connectBank(true); });

// menu hooks
window.addEventListener('DOMContentLoaded', () => {
  const bind = (id, fn) => document.getElementById(id)?.addEventListener('click', fn);
  bind('connect-bank', connectBank);
  bind('manage-banks', openManageBanks);
  bind('fetch-balance', onFetchBalance);
  bind('fetch-transactions', onFetchTransactions);
});
