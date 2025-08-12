// ==== CONFIG: your Worker URL ====
// You can override this from index.html with: <script>window.BACKEND_URL='https://YOUR-WORKER.workers.dev'</script>
const BACKEND_URL =
  (document.querySelector('meta[name="trakstar-backend"]')?.content) ||
  window.BACKEND_URL ||
  'https://trakstar-backend.krb52.workers.dev';

// ==== tiny UI helpers ====
function showModal(title, message) {
  if (typeof createModal === 'function') {
    const node = typeof message === 'string'
      ? (() => { const p = document.createElement('pre'); p.style.whiteSpace = 'pre-wrap'; p.textContent = message; return p; })()
      : message;
    createModal(title, [node], null);
  } else {
    alert(`${title}\n\n${typeof message === 'string' ? message : JSON.stringify(message, null, 2)}`);
  }
}
async function fetchJSON(url, opts = {}) {
  const res = await fetch(url, { ...opts, credentials: 'omit' });
  if (!res.ok) {
    const text = await res.text().catch(()=>'');
    throw new Error(`HTTP ${res.status} ${text}`);
  }
  return res.json();
}
function openMenuLink(id, fn){ const el=document.getElementById(id); if(el) el.onclick=fn; }

// ==== OAuth helpers ====
function isOauthReturn() {
  const p = new URLSearchParams(window.location.search);
  return p.has('oauth_state_id') || p.has('plaid_oauth_state_id');
}

// ==== Backend API wrappers ====
async function createLinkToken(redirect_uri) {
  return fetchJSON(`${BACKEND_URL}/plaid/create_link_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId:'default', redirect_uri })
  });
}
async function exchangePublicToken(public_token, institution) {
  return fetchJSON(`${BACKEND_URL}/plaid/exchange_public_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ public_token, userId:'default', institution })
  });
}
async function getAccounts() {
  return fetchJSON(`${BACKEND_URL}/plaid/accounts?user=default`);
}
async function refreshAccountsCache() {
  try { await fetchJSON(`${BACKEND_URL}/plaid/refresh_accounts?user=default`); } catch {}
}
async function unlinkItem(item_id) {
  return fetchJSON(`${BACKEND_URL}/plaid/unlink_item`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId:'default', item_id })
  });
}
async function getMappings() { return fetchJSON(`${BACKEND_URL}/plaid/mappings?user=default`); }
async function saveMappings(m) {
  return fetchJSON(`${BACKEND_URL}/plaid/mappings`, {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({ userId:'default', mappings: m })
  });
}
async function fetchAccountBalance(account_id) {
  return fetchJSON(`${BACKEND_URL}/bank/balance?user=default&account_id=${encodeURIComponent(account_id)}`);
}
async function fetchAccountTransactions(account_id, from=null, to=null) {
  const q = new URLSearchParams({ user:'default', account_id });
  if (from) q.set('from', from);
  if (to) q.set('to', to);
  return fetchJSON(`${BACKEND_URL}/bank/transactions?${q.toString()}`);
}

// ==== Plaid connect ====
async function connectBank(auto=false) {
  try {
    if (!window.Plaid || !window.Plaid.create) {
      showModal('Plaid not loaded', 'The Plaid Link script failed to load.');
      return;
    }
    const redirectUri = window.location.origin;
    const { link_token } = await createLinkToken(redirectUri);
    const handler = window.Plaid.create({
      token: link_token,
      receivedRedirectUri: isOauthReturn() ? window.location.href : undefined,
      onSuccess: async (public_token, metadata) => {
        await exchangePublicToken(public_token, metadata?.institution ? {
          name: metadata.institution.name,
          institution_id: metadata.institution.institution_id
        } : null);
        await refreshAccountsCache();
        showModal('Bank Connected', 'Account(s) added. Open “Manage Banks” to link them to counters.');
        annotateLinkedCounters();
        syncLinkedBalances(true);
      },
      onExit: (err) => { if (err && !auto) showModal('Plaid Exit', `${err.error_code}: ${err.error_message || ''}`); }
    });
    handler.open();
  } catch (e) {
    showModal('Connect Bank Failed', e.message);
  }
}

// ==== Counters from app.js (read-only) ====
function getFinancialCounters() {
  if (!window.TrakStar || !window.TrakStar.getCounters) return [];
  return window.TrakStar.getCounters().filter(c => c.counterType === 'financial' || c.counterType === 'numerical');
}

// ==== “Linked” pill on cards ====
function annotateLinkedCounters() {
  let map = {};
  try { map = JSON.parse(localStorage.getItem('plaidMappingsCached') || '{}'); } catch {}
  const ids = new Set(Object.keys(map));
  document.querySelectorAll('.item-card').forEach(card => {
    const id = card.dataset.id;
    if (!id) return;
    let pill = card.querySelector('.linked-pill');
    if (ids.has(id)) {
      if (!pill) {
        pill = document.createElement('span');
        pill.className = 'linked-pill';
        pill.textContent = '🔗 Linked';
        const header = card.querySelector('.item-header');
        if (header) header.insertBefore(pill, header.lastElementChild);
      }
    } else {
      if (pill) pill.remove();
    }
  });
}
const listObs = new MutationObserver(() => annotateLinkedCounters());
window.addEventListener('DOMContentLoaded', () => {
  const cont = document.getElementById('tracker-container');
  if (cont) listObs.observe(cont, { childList:true, subtree:true });
  annotateLinkedCounters();
});

// ==== Manage Banks UI (with Unlink) ====
async function openManageBanks() {
  try {
    const [acctPayload, mapPayload] = await Promise.all([getAccounts(), getMappings()]);
    const accounts = acctPayload.accounts || [];
    const mappings = mapPayload.mappings || {}; // { trackerId -> { account_id, item_id } }

    const wrapper = document.createElement('div');
    wrapper.style.maxWidth = '700px';
    const note = document.createElement('div');
    note.className = 'small-muted';
    note.textContent = 'Link any Plaid account to a financial counter. Linked counters auto-update.';
    wrapper.appendChild(note);

    const ctrs = getFinancialCounters();
    if (ctrs.length === 0) {
      const p = document.createElement('p'); p.textContent = 'No counters yet. Create one first (“Add Counter”).';
      wrapper.appendChild(p);
      showModal('Manage Banks', wrapper);
      return;
    }

    const table = document.createElement('div');
    table.style.display = 'grid';
    table.style.gridTemplateColumns = '1.25fr 1fr 0.7fr 0.6fr';
    table.style.gap = '8px';
    table.style.marginTop = '10px';
    ['Account','Linked Counter','Balance','Actions'].forEach(h => {
      const d = document.createElement('div'); d.innerHTML = `<b>${h}</b>`; table.appendChild(d);
    });

    function rowForAccount(acc) {
      // Account name
      const name = document.createElement('div');
      name.textContent = `${acc.institution_name || 'Bank'} • ${acc.name || acc.official_name || 'Account'} (${acc.mask || '—'})`;

      // Selector
      const sel = document.createElement('select');
      const optNone = document.createElement('option'); optNone.value = ''; optNone.textContent = '— Not Linked —';
      sel.appendChild(optNone);
      ctrs.forEach(c => { const o = document.createElement('option'); o.value=c.id; o.textContent=c.name; sel.appendChild(o); });
      const current = Object.entries(mappings).find(([tid, m]) => m.account_id === acc.account_id);
      if (current) sel.value = current[0];
      sel.dataset.accountId = acc.account_id; sel.dataset.itemId = acc.item_id;

      // Balance cell
      const bal = document.createElement('div'); bal.textContent = '…';
      fetchAccountBalance(acc.account_id).then(b => {
        const v = Number(b.balance || 0);
        bal.textContent = isFinite(v) ? `$${v.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}` : '—';
      }).catch(()=> bal.textContent='—');

      // Actions cell: View Tx + Unlink Item
      const actions = document.createElement('div'); actions.style.display='flex'; actions.style.gap='6px';
      const viewBtn = document.createElement('button'); viewBtn.textContent = 'View Tx';
      viewBtn.onclick = async () => {
        const from = prompt('Transactions FROM (YYYY-MM-DD) — optional:');
        const to   = prompt('Transactions TO   (YYYY-MM-DD) — optional:');
        try {
          const res = await fetchAccountTransactions(acc.account_id, from || null, to || null);
          const lines = (res.transactions || []).slice(0, 50).map(t => {
            const amt = Number(t.amount);
            return `${t.date}  ${t.name || t.merchant_name || t.description || 'txn'}  ${amt<0?'-':''}$${Math.abs(amt).toFixed(2)}`;
          });
          showModal('Transactions', lines.length ? lines.join('\n') : 'No transactions returned.');
        } catch(e){ showModal('Transactions', e.message); }
      };
      const unlinkBtn = document.createElement('button'); unlinkBtn.textContent = 'Unlink Item';
      unlinkBtn.style.background = '#ef4444';
      unlinkBtn.onclick = async () => {
        if (!confirm('Unlink this entire institution from TrakStar?')) return;
        try {
          await unlinkItem(acc.item_id);
          openManageBanks(); // refresh
        } catch(e) { showModal('Unlink failed', e.message); }
      };
      actions.append(viewBtn, unlinkBtn);

      table.append(name, sel, bal, actions);
    }

    accounts.forEach(rowForAccount);
    wrapper.appendChild(table);

    const row = document.createElement('div');
    row.style.textAlign='right';
    row.style.marginTop='12px';
    const saveBtn = document.createElement('button'); saveBtn.textContent = 'Save Links';
    saveBtn.onclick = async () => {
      const newMap = {};
      table.querySelectorAll('select').forEach(sel => {
        if (sel.value) newMap[sel.value] = { account_id: sel.dataset.accountId, item_id: sel.dataset.itemId };
      });
      await saveMappings(newMap);
      try { localStorage.setItem('plaidMappingsCached', JSON.stringify(newMap)); } catch {}
      annotateLinkedCounters();
      showModal('Saved', 'Links saved. Balances will refresh shortly.');
      syncLinkedBalances(true);
    };
    row.append(saveBtn);
    wrapper.appendChild(row);

    showModal('Manage Banks', wrapper);
  } catch (e) {
    showModal('Manage Banks', `Could not load accounts. ${e.message}`);
  }
}

// ==== Live sync ====
async function syncLinkedBalances(showErrors=false) {
  try {
    let map = null;
    try { map = (await getMappings()).mappings || null; } catch {}
    if (!map) { try { map = JSON.parse(localStorage.getItem('plaidMappingsCached') || '{}'); } catch { map = {}; } }
    const entries = Object.entries(map);
    if (!entries.length) return;
    for (const [trackerId, link] of entries) {
      try {
        const data = await fetchAccountBalance(link.account_id);
        if (window.TrakStar && window.TrakStar.updateCounterValue) {
          window.TrakStar.updateCounterValue(trackerId, Number(data.balance || 0), /*isBank*/true);
        }
      } catch (err) { if (showErrors) console.warn('Balance update failed for', trackerId, err); }
    }
  } catch (e) { if (showErrors) console.warn('sync error', e); }
  finally { annotateLinkedCounters(); }
}
setInterval(() => syncLinkedBalances(false), 5 * 60 * 1000);
window.addEventListener('DOMContentLoaded', () => {
  if (isOauthReturn()) connectBank(true);
  openMenuLink('connect-bank', connectBank);
  openMenuLink('manage-banks', openManageBanks);
  // hide raw endpoints if your HTML has them
  ['fetch-balance','fetch-transactions'].forEach(id => { const el=document.getElementById(id); if (el) el.style.display='none'; });
  syncLinkedBalances(false);
});
