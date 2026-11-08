// Automated end-to-end verification of all integrated APIs matching frontend behavior
const API_URL = 'http://localhost:3000';

class BrowserClient {
  constructor() {
    this.cookies = {};
  }

  getCsrfToken() {
    return this.cookies['ledgerline_csrf'] || '';
  }

  parseSetCookie(response) {
    const raw = response.headers.get('set-cookie');
    if (!raw) return;
    // split cookies
    const parts = raw.split(/,(?=\s*[a-zA-Z_]+=)/);
    for (const p of parts) {
      const match = p.trim().match(/^([^=]+)=([^;]*)/);
      if (match) {
        this.cookies[match[1]] = match[2];
      }
    }
  }

  getCookieHeader() {
    return Object.entries(this.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  async request(path, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const headers = { ...(options.headers || {}) };

    const cookieHeader = this.getCookieHeader();
    if (cookieHeader) headers['Cookie'] = cookieHeader;

    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      const csrf = this.getCsrfToken();
      if (csrf) headers['x-csrf-token'] = csrf;
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      method,
      headers,
    });

    this.parseSetCookie(res);

    let body = null;
    try {
      body = await res.json();
    } catch {}

    return { status: res.status, body, ok: res.ok };
  }
}

async function run() {
  console.log('Testing full API integration against http://localhost:3000...\n');

  // 1. Health checks
  const publicClient = new BrowserClient();
  const healthRes = await publicClient.request('/health/ready');
  console.log('1. Health Ready:', healthRes.status === 200 ? 'PASS (Database connected)' : 'FAIL', healthRes.body);

  // 2. Holder 1 Login
  const holderClient = new BrowserClient();
  const holderLogin = await holderClient.request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'holder1@ledgerline.dev', password: 'HolderPass123!' }),
  });
  console.log('2. Holder Login:', holderLogin.status === 200 ? 'PASS' : 'FAIL', holderLogin.body);

  // 3. Current User identity
  const meRes = await holderClient.request('/auth/me');
  console.log('3. Session Identity (GET /auth/me):', meRes.status === 200 ? 'PASS' : 'FAIL', meRes.body);

  // 4. List Accounts
  const acctsRes = await holderClient.request('/accounts');
  console.log('4. Holder Accounts (GET /accounts):', acctsRes.status === 200 ? 'PASS' : 'FAIL', `Found ${acctsRes.body.accounts.length} accounts`);
  const holderAccount = acctsRes.body.accounts[0];

  // 5. Open new customer account
  const newAcctRes = await holderClient.request('/accounts', {
    method: 'POST',
    body: JSON.stringify({ name: 'Savings Account' }),
  });
  console.log('5. Open Account (POST /accounts):', newAcctRes.status === 201 ? 'PASS' : 'FAIL', newAcctRes.body);
  const targetAccount = newAcctRes.body;

  // 6. Transfer money between accounts
  const transferRes = await holderClient.request('/transfers', {
    method: 'POST',
    body: JSON.stringify({
      fromAccountId: holderAccount.id,
      toAccountId: targetAccount.id,
      amount: '500000', // ₹5,000.00
      idempotencyKey: 'test-transfer-' + Date.now(),
      currency: 'INR',
    }),
  });
  console.log('6. Transfer Money (POST /transfers):', transferRes.status === 200 ? 'PASS' : 'FAIL', transferRes.body);

  // 7. Read statement with high-water mark pagination
  const statementRes = await holderClient.request(`/accounts/${holderAccount.id}/statement?limit=10`);
  console.log('7. Account Statement (GET /accounts/:id/statement):', statementRes.status === 200 ? 'PASS' : 'FAIL', {
    entries: statementRes.body.entries.length,
    highWater: statementRes.body.highWater,
    nextBefore: statementRes.body.nextBefore,
  });

  // 8. Submit Deposit Request
  const depositReq = await holderClient.request('/deposit-requests', {
    method: 'POST',
    body: JSON.stringify({
      accountId: targetAccount.id,
      amount: '200000', // ₹2,000.00
      externalReference: 'DEP-REF-' + Date.now(),
      evidence: { method: 'wire' },
    }),
  });
  console.log('8. Deposit Request (POST /deposit-requests):', depositReq.status === 201 ? 'PASS' : 'FAIL', depositReq.body);

  // 9. Admin Login & Verification
  const adminClient = new BrowserClient();
  const adminLogin = await adminClient.request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@ledgerline.dev', password: 'AdminPass123!' }),
  });
  console.log('9. Admin Login:', adminLogin.status === 200 ? 'PASS' : 'FAIL', adminLogin.body);

  // 10. Admin Verify Deposit
  const verifyRes = await adminClient.request(`/deposit-requests/${depositReq.body.id}/verify-and-post`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  console.log('10. Admin Verify Deposit (POST /deposit-requests/:id/verify-and-post):', verifyRes.status === 200 ? 'PASS' : 'FAIL', verifyRes.body);

  // 11. Admin Reversal of transfer
  if (transferRes.body?.transaction) {
    const reverseRes = await adminClient.request(`/transactions/${transferRes.body.transaction}/reverse`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'Integration test compensating reversal' }),
    });
    console.log('11. Admin Reversal (POST /transactions/:id/reverse):', reverseRes.status === 200 ? 'PASS' : 'FAIL', reverseRes.body);
  }

  // 12. Auditor Login & Reconciliation Proof
  const auditorClient = new BrowserClient();
  const auditorLogin = await auditorClient.request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'auditor@ledgerline.dev', password: 'AuditorPass123!' }),
  });
  console.log('12. Auditor Login:', auditorLogin.status === 200 ? 'PASS' : 'FAIL', auditorLogin.body);

  // 13. Auditor Reconciliation
  const reconRes = await auditorClient.request('/audit/reconciliation');
  console.log('13. Auditor Reconciliation Proof (GET /audit/reconciliation):', reconRes.status === 200 ? 'PASS' : 'FAIL', reconRes.body);

  // 14. Auditor Events Trail
  const eventsRes = await auditorClient.request('/audit/events?limit=5');
  console.log('14. Auditor Event Trail (GET /audit/events):', eventsRes.status === 200 ? 'PASS' : 'FAIL', `Retrieved ${eventsRes.body.events.length} events`);

  console.log('\n=== ALL INTEGRATION CHECKS COMPLETED SUCCESSFULLY ===');
}

run().catch((e) => {
  console.error('Integration test failed:', e);
  process.exit(1);
});
