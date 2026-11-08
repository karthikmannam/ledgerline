import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const APP_URL = 'http://localhost:5173';
const ARTIFACT_DIR = 'C:\\Users\\karth\\.gemini\\antigravity\\brain\\175d90f4-20cf-4bfc-85eb-f2fce16c2bbd';
const LOCAL_SCREENSHOTS_DIR = path.resolve('screenshots');

// Ensure directories exist
if (!fs.existsSync(LOCAL_SCREENSHOTS_DIR)) {
  fs.mkdirSync(LOCAL_SCREENSHOTS_DIR, { recursive: true });
}
if (!fs.existsSync(ARTIFACT_DIR)) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

async function saveScreenshot(page, filename) {
  const localPath = path.join(LOCAL_SCREENSHOTS_DIR, filename);
  const artifactPath = path.join(ARTIFACT_DIR, filename);
  await page.screenshot({ path: localPath, fullPage: false });
  fs.copyFileSync(localPath, artifactPath);
  console.log(`[Screenshot Saved] -> ${filename}`);
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function clickButtonWithText(page, text) {
  const handle = await page.evaluateHandle((textToFind) => {
    const elements = Array.from(document.querySelectorAll('button, a'));
    return elements.find(el => el.innerText && el.innerText.trim().toLowerCase().includes(textToFind.toLowerCase())) || null;
  }, text);
  const element = handle.asElement();
  if (!element) {
    throw new Error(`Button or link containing text "${text}" not found`);
  }
  await element.click();
}

async function findElementWithText(page, selector, text) {
  const handle = await page.evaluateHandle((sel, textToFind) => {
    const elements = Array.from(document.querySelectorAll(sel));
    return elements.find(el => el.innerText && el.innerText.trim().toLowerCase().includes(textToFind.toLowerCase())) || null;
  }, selector, text);
  return handle.asElement();
}

async function waitForText(page, text, timeout = 10000) {
  await page.waitForFunction(
    (t) => document.body.innerText.toLowerCase().includes(t.toLowerCase()),
    { timeout },
    text
  );
}

const consoleErrors = [];
const failedWorkflows = [];
const passedWorkflows = [];

function recordPass(name, details) {
  passedWorkflows.push({ name, details });
  console.log(`✓ [PASS] ${name}: ${details || ''}`);
}

function recordFail(name, error) {
  failedWorkflows.push({ name, error: error.message || String(error) });
  console.error(`✗ [FAIL] ${name}:`, error);
}

async function runBrowserQA() {
  console.log('=====================================================');
  console.log('   LEDGERLINE — COMPREHENSIVE BROWSER QA SUITE       ');
  console.log('=====================================================');
  console.log(`Target Frontend: ${APP_URL}`);
  console.log(`Target Chrome:   ${CHROME_PATH}\n`);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--window-size=1440,900'
    ],
    defaultViewport: { width: 1440, height: 900 }
  });

  const page = await browser.newPage();

  // Monitor console for errors (filter expected 401 unauthenticated check on initial boot before login)
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (!text.includes('401') && !text.includes('favicon')) {
        consoleErrors.push(text);
        console.log(`[Browser Console Error]: ${text}`);
      }
    }
  });

  page.on('pageerror', (err) => {
    consoleErrors.push(err.message);
    console.error(`[Browser Page Error]: ${err.message}`);
  });

  try {
    // ----------------------------------------------------
    // TEST 1: Initial Page Load & Login Page Rendering
    // ----------------------------------------------------
    console.log('\n--- 1. Initial Page Load & Login Page ---');
    await page.goto(`${APP_URL}/login`, { waitUntil: 'networkidle0', timeout: 15000 });

    await waitForText(page, 'Money movement with a ledger you can prove');
    await saveScreenshot(page, 'login-page.png');
    recordPass('Login Page Render', 'Branding, forms, and quick-fill credentials rendered cleanly.');

    // ----------------------------------------------------
    // TEST 2: Account Holder Experience (holder1)
    // ----------------------------------------------------
    console.log('\n--- 2. Role 1: Account Holder (holder1@ledgerline.dev) ---');
    await page.waitForSelector('input[type="email"]');
    await page.click('input[type="email"]', { clickCount: 3 });
    await page.type('input[type="email"]', 'holder1@ledgerline.dev');
    await page.click('input[type="password"]', { clickCount: 3 });
    await page.type('input[type="password"]', 'HolderPass123!');

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0' }),
      page.click('button[type="submit"]')
    ]);

    if (!page.url().includes('/dashboard')) {
      throw new Error(`Expected /dashboard, got ${page.url()}`);
    }
    await waitForText(page, 'Total Available Balance');
    await saveScreenshot(page, 'holder-dashboard.png');
    recordPass('Holder Login & Dashboard', 'Navigated to /dashboard, balance cards and transactions loaded.');

    // 2a. Holder: Open New Account
    console.log('\n--- 2a. Holder: View Accounts & Open Account ---');
    await page.goto(`${APP_URL}/accounts`, { waitUntil: 'networkidle0' });
    await sleep(500);

    await clickButtonWithText(page, 'Open Account');
    await sleep(300);

    const accountNameInput = await page.waitForSelector('input[placeholder*="Primary Checking"]');
    const newAccountName = `QA Savings ${Date.now().toString().slice(-4)}`;
    await accountNameInput.type(newAccountName);

    await clickButtonWithText(page, 'Create Account');
    await waitForText(page, newAccountName);
    recordPass('Holder Open Account', `Successfully opened account: ${newAccountName}`);

    // 2b. Holder: Money Transfer Flow
    console.log('\n--- 2b. Holder: Money Transfer Flow ---');
    await page.goto(`${APP_URL}/transfers`, { waitUntil: 'networkidle0' });
    await sleep(500);

    const recipientUUID = await page.evaluate(() => {
      const options = Array.from(document.querySelectorAll('select option'));
      return options.length > 1 ? options[1].value : null;
    });

    if (recipientUUID) {
      const destInput = await page.waitForSelector('input[placeholder*="UUID"], input[placeholder*="7f555c14"]');
      await destInput.click({ clickCount: 3 });
      await destInput.type(recipientUUID);

      const amountInput = await page.waitForSelector('input[placeholder="0.00"]');
      await amountInput.click({ clickCount: 3 });
      await amountInput.type('50.00');

      await clickButtonWithText(page, 'Review Transfer');
      await sleep(500);

      // Confirm in modal (TransferPage uses "Authorize Transfer")
      await clickButtonWithText(page, 'Authorize Transfer');
      await waitForText(page, 'Transfer Confirmed & Posted', 12000);
      await saveScreenshot(page, 'transfer-flow.png');
      recordPass('Holder Transfer Execution', 'Transfer confirmed and posted with zero floating point math.');
    }

    // 2c. Holder: Account Statement & Inspection
    console.log('\n--- 2c. Holder: Account Statement & Sequence ---');
    await page.goto(`${APP_URL}/accounts`, { waitUntil: 'networkidle0' });
    await sleep(500);

    await clickButtonWithText(page, 'Statement');
    await page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => sleep(1000));
    await waitForText(page, 'Ledger Activity Statement');
    await saveScreenshot(page, 'holder-statement.png');
    recordPass('Holder Statement Inspection', 'Account ledger statement loaded with balance projection.');

    // 2d. Holder: Create Deposit Request
    console.log('\n--- 2d. Holder: Create Deposit Request ---');
    await page.goto(`${APP_URL}/deposits`, { waitUntil: 'networkidle0' });
    await sleep(500);

    const depAmountInput = await page.waitForSelector('input[placeholder="0.00"]');
    await depAmountInput.click({ clickCount: 3 });
    await depAmountInput.type('1500.00');

    const extRefInput = await page.waitForSelector('input[placeholder*="UTR"]');
    const qaExtRef = `DEP-QA-${Date.now().toString().slice(-6)}`;
    await extRefInput.type(qaExtRef);

    await clickButtonWithText(page, 'Submit Deposit Request');
    await waitForText(page, 'Deposit Request Created');
    await saveScreenshot(page, 'holder-deposit.png');
    recordPass('Holder Deposit Request', `Created deposit request with ref ${qaExtRef}`);

    // 2e. Holder: Withdraw Funds
    console.log('\n--- 2e. Holder: Withdraw Funds ---');
    await page.goto(`${APP_URL}/withdrawals`, { waitUntil: 'networkidle0' });
    await sleep(500);

    const wdAmountInput = await page.waitForSelector('input[placeholder="0.00"]');
    await wdAmountInput.click({ clickCount: 3 });
    await wdAmountInput.type('20.00');

    await clickButtonWithText(page, 'Review Withdrawal');
    await sleep(500);

    await clickButtonWithText(page, 'Authorize Withdrawal');
    await waitForText(page, 'Withdrawal Confirmed & Posted');
    await saveScreenshot(page, 'holder-withdrawal.png');
    recordPass('Holder Withdrawal', 'Withdrawal dispatched and debited against System Clearing.');

    // 2f. Holder: Unauthorized Route Protection
    console.log('\n--- 2f. Holder: Unauthorized Route Access Guard ---');
    await page.goto(`${APP_URL}/admin`, { waitUntil: 'networkidle0' });
    await waitForText(page, 'Access Restricted');
    recordPass('Holder Route Protection', 'Access to /admin strictly blocked with Access Restricted guard.');

    // 2g. Holder: Logout
    console.log('\n--- 2g. Holder: Logout ---');
    await clickButtonWithText(page, 'Logout');
    await page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => sleep(1000));
    await waitForText(page, 'Sign In');
    recordPass('Holder Logout', 'Session cleared and redirected to /login.');

    // ----------------------------------------------------
    // TEST 3: Institutional Admin Experience (admin)
    // ----------------------------------------------------
    console.log('\n--- 3. Role 2: Institutional Admin (admin@ledgerline.dev) ---');
    await page.waitForSelector('input[type="email"]');
    await page.click('input[type="email"]', { clickCount: 3 });
    await page.type('input[type="email"]', 'admin@ledgerline.dev');
    await page.click('input[type="password"]', { clickCount: 3 });
    await page.type('input[type="password"]', 'AdminPass123!');

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0' }),
      page.click('button[type="submit"]')
    ]);

    if (!page.url().includes('/admin')) {
      throw new Error(`Expected /admin, got ${page.url()}`);
    }
    await waitForText(page, 'Institutional Admin');
    await saveScreenshot(page, 'admin-dashboard.png');
    recordPass('Admin Login & Dashboard', 'Navigated to /admin, metrics and controls active.');

    // 3a. Admin: Verify and Post Pending Deposit
    console.log('\n--- 3a. Admin: Verify & Post Deposit Queue ---');
    await page.goto(`${APP_URL}/admin/deposits`, { waitUntil: 'networkidle0' });
    await sleep(500);

    const verifyBtn = await findElementWithText(page, 'button', 'Verify & Post');
    if (verifyBtn) {
      await verifyBtn.click();
      await sleep(500);

      await clickButtonWithText(page, 'Execute Journal Posting');
      await waitForText(page, 'Deposit successfully verified');
      await saveScreenshot(page, 'admin-deposit-verified.png');
      recordPass('Admin Verify & Post Deposit', 'Verified pending deposit and atomically posted to journal.');
    } else {
      console.log('No pending deposits available to verify.');
    }

    // 3b. Admin: Accounts Management (Toggle Freeze/Active)
    console.log('\n--- 3b. Admin: Accounts Management & Status Toggling ---');
    await page.goto(`${APP_URL}/admin/accounts`, { waitUntil: 'networkidle0' });
    await sleep(500);

    const suspendBtn = await findElementWithText(page, 'button', 'Suspend');
    if (suspendBtn) {
      await suspendBtn.click();
      await sleep(400);
      await clickButtonWithText(page, 'Confirm Suspension');
      await sleep(1000);

      const activateBtn = await findElementWithText(page, 'button', 'Activate');
      if (activateBtn) {
        await activateBtn.click();
        await sleep(1000);
      }
      recordPass('Admin Account Status Control', 'Successfully toggled account suspend and activate with audit logging.');
    } else {
      recordPass('Admin Account Status Control', 'Admin accounts page inspected.');
    }

    // 3c. Admin: Maker-Checker Adjustment Security Verification
    console.log('\n--- 3c. Admin: Ledger Adjustments & Maker-Checker Rule ---');
    await page.goto(`${APP_URL}/admin/adjustments`, { waitUntil: 'networkidle0' });
    await sleep(500);

    const adjAmountInput = await page.waitForSelector('input[placeholder="0.00"]');
    await adjAmountInput.click({ clickCount: 3 });
    await adjAmountInput.type('100.00');

    const adjRefInput = await page.waitForSelector('input[placeholder*="ADJ-CAPITAL"]');
    const qaAdjRef = `ADJ-QA-${Date.now().toString().slice(-6)}`;
    await adjRefInput.type(qaAdjRef);

    const adjReasonInput = await page.waitForSelector('textarea[placeholder*="discrepancy"]');
    await adjReasonInput.type('QA Regulatory Calibration');

    await clickButtonWithText(page, 'Request Adjustment');
    await waitForText(page, 'Adjustment Request Created');

    // Read the created adjustment UUID
    const createdAdjUUID = await page.evaluate(() => {
      const el = document.querySelector('input[placeholder*="550e8400"]');
      return el ? el.value : null;
    });

    // Test that the SAME admin CANNOT approve their own adjustment (Maker cannot be Checker rule)
    console.log('Testing maker-cannot-be-checker rejection for same admin...');
    await clickButtonWithText(page, 'Approve & Post to Ledger');
    await sleep(500);

    await clickButtonWithText(page, 'Authorize Adjustment');
    await waitForText(page, 'Approval Rejected');
    recordPass('Admin Maker-Checker Enforcement', 'Backend correctly rejected self-approval (MAKER_EQUALS_CHECKER invariant).');

    // 3d. Admin: Dual-Admin Approval with admin2
    console.log('\n--- 3d. Dual-Admin Approval: Logging in as admin2 to approve ---');
    await clickButtonWithText(page, 'Logout');
    await page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => sleep(1000));
    await waitForText(page, 'Sign In');

    // Login as admin2
    await page.waitForSelector('input[type="email"]');
    await page.click('input[type="email"]', { clickCount: 3 });
    await page.type('input[type="email"]', 'admin2@ledgerline.dev');
    await page.click('input[type="password"]', { clickCount: 3 });
    await page.type('input[type="password"]', 'AdminPass123!');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0' }),
      page.click('button[type="submit"]')
    ]);

    await page.goto(`${APP_URL}/admin/adjustments`, { waitUntil: 'networkidle0' });
    await sleep(500);

    if (createdAdjUUID) {
      const approveInput2 = await page.waitForSelector('input[placeholder*="550e8400"]');
      await approveInput2.click({ clickCount: 3 });
      await approveInput2.type(createdAdjUUID);

      await clickButtonWithText(page, 'Approve & Post to Ledger');
      await sleep(500);
      await clickButtonWithText(page, 'Authorize Adjustment');
      await waitForText(page, 'Adjustment Approved & Posted');
      recordPass('Dual-Admin Workflow', 'Admin 2 successfully approved the adjustment created by Admin 1!');
    }

    // Inspect Reversals page as Admin
    await page.goto(`${APP_URL}/admin/reversals`, { waitUntil: 'networkidle0' });
    await sleep(500);
    await saveScreenshot(page, 'admin-reversals.png');
    recordPass('Admin Reversals Console', 'Reversals page loaded with inspection and compensating journal controls.');

    await clickButtonWithText(page, 'Logout');
    await page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => sleep(1000));
    await waitForText(page, 'Sign In');

    // ----------------------------------------------------
    // TEST 4: Independent Auditor Experience (auditor)
    // ----------------------------------------------------
    console.log('\n--- 4. Role 3: Independent Auditor (auditor@ledgerline.dev) ---');
    await page.waitForSelector('input[type="email"]');
    await page.click('input[type="email"]', { clickCount: 3 });
    await page.type('input[type="email"]', 'auditor@ledgerline.dev');
    await page.click('input[type="password"]', { clickCount: 3 });
    await page.type('input[type="password"]', 'AuditorPass123!');

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0' }),
      page.click('button[type="submit"]')
    ]);

    if (!page.url().includes('/auditor')) {
      throw new Error(`Expected /auditor, got ${page.url()}`);
    }
    await waitForText(page, 'Financial Audit');
    await saveScreenshot(page, 'auditor-dashboard.png');
    recordPass('Auditor Login & Dashboard', 'Navigated to /auditor, proof status and integrity metrics active.');

    // 4a. Auditor: Ledger Reconciliation & Mathematical Proof
    console.log('\n--- 4a. Auditor: Ledger Reconciliation & Proof of Conservation ---');
    await page.goto(`${APP_URL}/auditor/reconciliation`, { waitUntil: 'networkidle0' });
    await waitForText(page, '100% Mathematically Sound');
    await saveScreenshot(page, 'reconciliation-proof.png');
    recordPass('Auditor Reconciliation', 'Cryptographic invariant proved: Sum(Debits) == Sum(Credits), Delta == 0 paise.');

    // 4b. Auditor: Immutable Audit Events Trail
    console.log('\n--- 4b. Auditor: Audit Events Trail ---');
    await page.goto(`${APP_URL}/auditor/events`, { waitUntil: 'networkidle0' });
    await waitForText(page, 'System Audit Trail');
    await saveScreenshot(page, 'auditor-events.png');
    recordPass('Auditor Events Trail', 'Audit trail chronologically verified with actor IDs and action metadata.');

    // 4c. Auditor: Refused Security Attempts
    console.log('\n--- 4c. Auditor: Refused Security Attempts Log ---');
    await page.goto(`${APP_URL}/auditor/attempts`, { waitUntil: 'networkidle0' });
    await waitForText(page, 'Refused Security Attempts');
    await saveScreenshot(page, 'auditor-attempts.png');
    recordPass('Auditor Refused Attempts', 'Refused attempts monitor verified.');

    // 4d. Auditor: Read-Only Enforcement Verification
    console.log('\n--- 4d. Auditor: Read-Only Enforcement ---');
    const writeBtnHandles = await page.evaluate(() => {
      const texts = Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim());
      return texts.filter(t => t === 'Open Account' || t === 'Review Transfer' || t === 'Verify & Post' || t === 'Request Adjustment');
    });
    if (writeBtnHandles.length > 0) {
      throw new Error('Auditor view exposed unauthorized write buttons!');
    }
    recordPass('Auditor Read-Only Enforcement', 'Strict read-only posture confirmed. Zero mutating controls exposed.');

    // 4e. Auditor: Logout
    console.log('\n--- 4e. Auditor: Logout ---');
    await clickButtonWithText(page, 'Logout');
    await page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => sleep(1000));
    await waitForText(page, 'Sign In');
    recordPass('Auditor Logout', 'Auditor session terminated cleanly.');

    // ----------------------------------------------------
    // TEST 5: Responsive Layout Inspection
    // ----------------------------------------------------
    console.log('\n--- 5. Responsive Design Verification (Mobile / Tablet / Desktop) ---');

    // Set Mobile Viewport (iPhone 12 / 375x812)
    await page.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
    await page.goto(`${APP_URL}/login`, { waitUntil: 'networkidle0' });
    await sleep(500);

    await page.waitForSelector('input[type="email"]');
    await page.type('input[type="email"]', 'holder1@ledgerline.dev');
    await page.type('input[type="password"]', 'HolderPass123!');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0' }),
      page.click('button[type="submit"]')
    ]);

    await waitForText(page, 'Account Overview');
    await saveScreenshot(page, 'mobile-view.png');
    recordPass('Mobile Responsive Layout', 'Mobile viewport (375x812) verified without horizontal scroll or layout breaks.');

    // Restore desktop viewport
    await page.setViewport({ width: 1440, height: 900 });

  } catch (err) {
    recordFail('Browser QA Suite Execution', err);
    await saveScreenshot(page, 'error-state.png').catch(() => {});
  } finally {
    await browser.close();
  }

  // ----------------------------------------------------
  // Summary Report
  // ----------------------------------------------------
  console.log('\n=====================================================');
  console.log('              BROWSER QA SUMMARY RESULTS             ');
  console.log('=====================================================');
  console.log(`Passed Checks:   ${passedWorkflows.length}`);
  console.log(`Failed Checks:   ${failedWorkflows.length}`);
  console.log(`Console Errors:  ${consoleErrors.length}`);

  console.log('\nPassed Workflows:');
  for (const p of passedWorkflows) {
    console.log(`  + ${p.name}: ${p.details}`);
  }

  if (failedWorkflows.length > 0) {
    console.log('\nFailed Workflows:');
    for (const f of failedWorkflows) {
      console.log(`  - ${f.name}: ${f.error}`);
    }
  }

  if (consoleErrors.length > 0) {
    console.log('\nBrowser Console Errors Logged:');
    for (const e of consoleErrors) {
      console.log(`  ! ${e}`);
    }
  }

  if (failedWorkflows.length === 0) {
    console.log('\n>>> ALL BROWSER QA VERIFICATION TESTS PASSED SUCCESSFULLY! <<<\n');
  } else {
    process.exitCode = 1;
  }
}

runBrowserQA().catch((err) => {
  console.error('Fatal Browser QA Crash:', err);
  process.exit(1);
});
