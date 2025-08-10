<!-- bank.js -->
<script>
/**
 * Minimal “Bank” client. Points at your private backend.
 * After you deploy the Cloudflare Worker, set BACKEND_URL to that URL.
 */
const BACKEND_URL = 'https://YOUR_WORKER_SUBDOMAIN.workers.dev'; // <-- CHANGE THIS AFTER BACKEND DEPLOYS

function showModal(title, message) {
  // Reuse your app's modal if available; otherwise fall back to alert
  if (typeof createModal === 'function') {
    const p = document.createElement('p');
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

async function onFetchBalance() {
  try {
    const data = await fetchJSON(`${BACKEND_URL}/bank/balance`);
    const balance = (typeof data.balance === 'number')
      ? `$${Number(data.balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : JSON.stringify(data);
    showModal('Bank Balance', `Current balance: ${balance}`);
  } catch (e) {
    showModal('Bank Error', `Could not fetch balance. ${e.message}`);
  }
}

async function onFetchTransactions() {
  const from = prompt('Transactions FROM date (YYYY-MM-DD)? Leave blank for default.');
  const to   = prompt('Transactions TO date (YYYY-MM-DD)? Leave blank for default.');
  try {
    const q = new URLSearchParams();
    if (from) q.set('from', from);
    if (to)   q.set('to', to);
    const data = await fetchJSON(`${BACKEND_URL}/bank/transactions?${q.toString()}`);
    const lines = (data.transactions || []).slice(0, 20).map(t =>
      `${t.date} • ${t.description || t.name || 'txn'} • ${t.amount}`
    );
    showModal('Recent Transactions', lines.length ? lines.join('\n') : 'No transactions returned.');
  } catch (e) {
    showModal('Bank Error', `Could not fetch transactions. ${e.message}`);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const b1 = document.getElementById('fetch-balance');
  const b2 = document.getElementById('fetch-transactions');
  if (b1) b1.onclick = onFetchBalance;
  if (b2) b2.onclick = onFetchTransactions;
});
</script>
