// ==== CONFIG: your Worker URL ====
const BACKEND_URL = 'https://trakstar-backend.krb52.workers.dev';

// ==== tiny UI helpers ====
function showModal(title, message) {
  if (typeof createModal === 'function') {
    const node = typeof message === 'string' ? (() => {
      const p = document.createElement('pre'); p.style.whiteSpace = 'pre-wrap'; p.textContent = message; return p;
    })() : message;
    createModal(title, [node], null);
  } else {
    alert(`${title}\n\n${typeof message === 'string' ? message : JSON.stringify(message, null, 2)}`);
  }
}

async function fetchJSON(url, opts = {}) {
  const res = await fetch(url, { cache: 'no-store', ...opts, credentials: 'omit' });
  if (!res.ok) {
    const text = await res.text().catch(()=> '');
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

// ==== Plaid: connect flow (multi-item supported) ====
async function connectBank(auto=false) {
  try {
    const redirectUri = window.location.origin; // must match Plaid dashboard allowlist
    const { link_token } = await fetchJSON(`${BACKEND_URL}/plaid/create_link_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'default', redirect_uri: redirectUri })
    });

    const handler = window.Plaid.create({
      token: link_token,
      receivedRedirectUri: isOauthReturn() ? window.location.href : undefined,
      onSuccess: async (public_token, metadata) => {
        await fetchJSON(`${BACKEND_URL}/plaid/exchange_public_token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            public_token,
            userId: 'default',
            // pass institution metadata so backend can label items/accounts nicely
            institution: metadata && metadata.institution ? {
              name: metadata.institution.name,
              institution_id: metadata.institution.institution_id
            } : null
          })
        });
        await refreshAccountsCache();
        showModal('Bank Connected', 'Account(s) added. Open “Manage Banks” to link them to counters.');
      },
      onExit: (err) => {
        if (err && !auto) showModal('Plaid Exit', `${err.error_code}: ${err.error_message || ''}`);
      }
    });
    handler.open();
  } catch (e) {
    showModal('Connect Bank Failed', e.message);
  }
}

// ==== Backend API wrappers ====
async function getAccounts() {
  return fetchJSON(`${BACKEND_URL}/plaid/accounts?user=default`);
}
async function getMappings() {
  return fetchJSON(`${BACKEND_URL}/plaid/mappings?user=default`);
}
async function saveMappings(mapObj) {
  return fetchJSON(`${BACKEND_URL}/plaid/mappings`, {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({ userId:'default', mappings: mapObj })
  });
}
async function unlinkItem(itemId) {
  return fetchJSON(`${BACKEND_URL}/plaid/unlink_item`, {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({ userId: 'default', item_id: itemId })
  });
}
async function fetchAccountBalance(account_id) {
  return fetchJSON(`${BACKEND_URL}/bank/balance?user=default&account_id=${encodeURIComponent(account_id)}`);
}
async function refreshAccountsCache() {
  // refresh backend's cached accounts (idempotent)
  try { await fetchJSON(`${BACKEND_URL}/plaid/refresh_accounts?user=default`); } catch {}
}

// ==== Manage Banks UI ====
function getFinancialCounters() {
  if (!window.TrakStar || !window.TrakStar.getCounters) return [];
  return window.TrakStar.getCounters().filter(c => c.counterType === 'financial');
}

async function openManageBanks() {
  try {
    const [acctPayload, mapPayload] = await Promise.all([getAccounts(), getMappings()]);
    const accounts = acctPayload.accounts || [];
    const mappings = mapPayload.mappings || {}; // { trackerId -> { account_id, item_id } }

    // Build UI
    const wrapper = document.createElement('div');
    wrapper.style.maxWidth = '520px';
    const note = document.createElement('div');
    note.className = 'small-muted';
    note.textContent = 'Link any Plaid account to a financial counter. Linked counters will auto-update.';
    wrapper.appendChild(note);

    const ctrs = getFinancialCounters();
    if (ctrs.length === 0) {
      const p = document.createElement('p');
      p.textContent = 'No financial counters yet. Create one first (“Add Counter” → Financial).';
      wrapper.appendChild(p);
      showModal('Manage Banks', wrapper);
      return;
    }

    // accounts list
    const table = document.createElement('div');
    table.style.display = 'grid';
    table.style.gridTemplateColumns = '1fr 1fr';
    table.style.gap = '8px';
    table.style.marginTop = '10px';
    const head1 = document.createElement('div'); head1.innerHTML = '<b>Account</b>';
    const head2 = document.createElement('div'); head2.innerHTML = '<b>Linked Counter</b>';
    table.append(head1, head2);

    // helper to render one row
    function rowForAccount(acc) {
      const name = document.createElement('div');
      name.textContent = `${acc.institution_name || 'Bank'} • ${acc.name || acc.official_name || 'Account'} (${acc.mask || '—'})`;
      const sel = document.createElement('select');

      // list counters
      const optNone = document.createElement('option'); optNone.value = ''; optNone.textContent = '— Not Linked —';
      sel.appendChild(optNone);
      ctrs.forEach(c => {
        const o = document.createElement('option');
        o.value = c.id; o.textContent = c.name;
        sel.appendChild(o);
      });

      // set current mapping if any
      const current = Object.entries(mappings).find(([tid, m]) => m.account_id === acc.account_id);
      if (current) sel.value = current[0];

      // remember selection locally
      sel.dataset.accountId = acc.account_id;
      sel.dataset.itemId = acc.item_id;

      table.append(name, sel);
    }

    accounts.forEach(rowForAccount);

    wrapper.appendChild(table);

    // actions
    const row = document.createElement('div');
    row.style.textAlign = 'right'; row.style.marginTop = '12px';
    const unlinkInfo = document.createElement('div');
    unlinkInfo.className = 'small-muted';
    unlinkInfo.style.marginTop = '6px';
    unlinkInfo.textContent = 'Tip: To remove an institution entirely, unlink it from the backend.';
    const saveBtn = document.createElement('button'); saveBtn.textContent = 'Save Links';
    saveBtn.onclick = async () => {
      // Build mapping { trackerId -> {account_id,item_id} }
      const newMap = {};
      table.querySelectorAll('select').forEach(sel => {
        if (sel.value) newMap[sel.value] = { account_id: sel.dataset.accountId, item_id: sel.dataset.itemId };
      });
      await saveMappings(newMap);
      localStorage.setItem('plaidMappingsCached', JSON.stringify(newMap));
      showModal('Saved', 'Links saved. Balances will refresh shortly.');
      // kick off a sync now
      syncLinkedBalances(true);
    };

    row.append(saveBtn);
    wrapper.appendChild(row);
    wrapper.appendChild(unlinkInfo);

    showModal('Manage Banks', wrapper);
  } catch (e) {
    showModal('Manage Banks', `Could not load accounts. ${e.message}`);
  }
}

// ==== Live sync ====
async function syncLinkedBalances(showErrors=false) {
  try {
    // get mappings (prefer server; fall back to local cache)
    let map = null;
    try { map = (await getMappings()).mappings || null; } catch { /* offline */ }
    if (!map) map = JSON.parse(localStorage.getItem('plaidMappingsCached') || '{}');

    const entries = Object.entries(map);
    if (!entries.length) return;

    for (const [trackerId, link] of entries) {
      try {
        const data = await fetchAccountBalance(link.account_id); // { balance }
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

// periodic: every 5 minutes + on load
setInterval(() => syncLinkedBalances(false), 5 * 60 * 1000);
window.addEventListener('DOMContentLoaded', () => syncLinkedBalances(false));

// ==== Manual quick actions (kept) ====
async function onFetchBalance() {
  try {
    const resp = await fetchJSON(`${BACKEND_URL}/bank/balance?user=default`);
    const balance = (typeof resp.balance === 'number')
      ? `$${Number(resp.balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : JSON.stringify(resp);
    showModal('Bank Balance (sum of linked items)', `Current: ${balance}`);
  } catch (e) {
    showModal('Bank Error', `Could not fetch balance. ${e.message}`);
  }
}
async function onFetchTransactions() {
  const from = prompt('Transactions FROM date (YYYY-MM-DD)? Leave blank for last 30 days.');
  const to   = prompt('Transactions TO date (YYYY-MM-DD)? Leave blank for today.');
  try {
    const q = new URLSearchParams();
    if (from) q.set('from', from);
    if (to)   q.set('to', to);
    q.set('user', 'default');
    const data = await fetchJSON(`${BACKEND_URL}/bank/transactions?${q.toString()}`);
    const lines = (data.transactions || []).slice(0, 20).map(t => `${t.date} • ${t.name || t.merchant_name || t.description || 'txn'} • ${t.amount}`);
    showModal('Recent Transactions (all)', lines.length ? lines.join('\n') : 'No transactions returned.');
  } catch (e) {
    showModal('Bank Error', `Could not fetch transactions. ${e.message}`);
  }
}

// auto-finish OAuth when we return from the bank
window.addEventListener('DOMContentLoaded', () => { if (isOauthReturn()) connectBank(true); });

// menu hooks
window.addEventListener('DOMContentLoaded', () => {
  openMenuLink('connect-bank', connectBank);
  openMenuLink('manage-banks', openManageBanks);
  openMenuLink('fetch-balance', onFetchBalance);
  openMenuLink('fetch-transactions', onFetchTransactions);
});
