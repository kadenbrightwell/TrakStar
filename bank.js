// ---- CONFIG: set this to your Worker URL ----
const BACKEND_URL = 'https://trakstar-backend.krb52.workers.dev/'; // TODO change

function showModal(title, message) {
  if (typeof createModal === 'function') {
    const p = document.createElement('pre');
    p.style.whiteSpace = 'pre-wrap';
    p.textContent = message;
    createModal(title, [p], null);
  } else {
    alert(`${title}\n\n${message}`);
  }
}

async function fetchJSON(url, opts = {}) {
  const res = await fetch(url, { ...opts, credentials: 'omit' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function openMenuLink(label, fn) {
  const el = document.getElementById(label);
  if (el) el.onclick = fn;
}

// ---- Plaid Link flow ----
async function connectBank() {
  try {
    // 1) Ask backend for a link_token
    const resp = await fetchJSON(`${BACKEND_URL}/plaid/create_link_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'default' })
    });
    const linkToken = resp.link_token;
    if (!linkToken) throw new Error('No link_token from backend');

    // 2) Initialize Plaid Link
    const handler = window.Plaid.create({
      token: linkToken,
      onSuccess: async (public_token /*, metadata */) => {
        try {
          // 3) Exchange for access_token (stored server-side in KV)
          await fetchJSON(`${BACKEND_URL}/plaid/exchange_public_token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ public_token, userId: 'default' })
          });
          localStorage.setItem('bankLinked', 'true');
          showModal('Bank Connected', 'Your bank is linked. You can now fetch balance and transactions.');
        } catch (e) {
          showModal('Error Saving Token', e.message);
        }
      },
      onExit: (err /*, metadata */) => {
        if (err) showModal('Plaid Exit', `Code: ${err.error_code}\n${err.error_message || ''}`);
      }
    });
    handler.open();
  } catch (e) {
    showModal('Connect Bank Failed', e.message);
  }
}

// ---- Use your backend to get data ----
async function onFetchBalance() {
  try {
    const data = await fetchJSON(`${BACKEND_URL}/bank/balance?user=default`);
    const balance = (typeof data.balance === 'number')
      ? `$${Number(data.balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : JSON.stringify(data);
    showModal('Bank Balance', `Current balance: ${balance}`);
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
    const lines = (data.transactions || []).slice(0, 20).map(t =>
      `${t.date} • ${t.name || t.merchant_name || t.description || 'txn'} • ${t.amount}`
    );
    showModal('Recent Transactions', lines.length ? lines.join('\n') : 'No transactions returned.');
  } catch (e) {
    showModal('Bank Error', `Could not fetch transactions. ${e.message}`);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  openMenuLink('connect-bank', connectBank);
  openMenuLink('fetch-balance', onFetchBalance);
  openMenuLink('fetch-transactions', onFetchTransactions);
});
