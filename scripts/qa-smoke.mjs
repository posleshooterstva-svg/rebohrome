import { promises as fs } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.QA_BASE_URL || "http://127.0.0.1:3003";
const outputDir = path.join(process.cwd(), "tmp-qa-v9");

const artifacts = [];
const consoleIssues = [];
const pageErrors = [];
const requestFailures = [];
const summary = [];

function stamp(step, detail) {
  summary.push({ step, detail, at: new Date().toISOString() });
  console.log(`[qa] ${step}: ${detail}`);
}

function sanitize(name) {
  return name.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase();
}

async function ensureDir() {
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });
}

async function saveScreenshot(page, name, fullPage = true) {
  const filePath = path.join(outputDir, `${sanitize(name)}.png`);
  await page.screenshot({ path: filePath, fullPage });
  artifacts.push(filePath);
}

async function saveJson(name, data) {
  const filePath = path.join(outputDir, `${sanitize(name)}.json`);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
  artifacts.push(filePath);
}

async function shortPause(page, ms = 300) {
  await page.waitForTimeout(ms);
}

async function acceptCookies(page) {
  const button = page.getByRole("button", { name: "Accept" });
  if (await button.isVisible().catch(() => false)) {
    await button.click();
    await shortPause(page, 200);
    return;
  }

  await shortPause(page, 350);

  if (await button.isVisible().catch(() => false)) {
    await button.click();
    await shortPause(page, 200);
  }
}

async function goto(page, route, marker, screenshotName) {
  await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded" });
  await acceptCookies(page);
  if (marker) {
    await page.getByText(marker, { exact: false }).first().waitFor({ timeout: 15000 });
  }
  if (screenshotName) {
    await saveScreenshot(page, screenshotName);
  }
}

async function fillIfVisible(locator, value) {
  if (await locator.isVisible().catch(() => false)) {
    await locator.fill(value);
  }
}

async function clickIfVisible(locator) {
  if (await locator.isVisible().catch(() => false)) {
    await locator.click();
    return true;
  }
  return false;
}

function shouldIgnoreRequestFailure(request) {
  const errorText = request.failure()?.errorText ?? "";
  return errorText.includes("net::ERR_ABORTED");
}

async function registerUser(page, user) {
  await goto(page, "/register", "Create collector account", "register-page");
  await page.getByLabel(/^Username$/).fill(user.username);
  await page.getByLabel(/^Telegram username$/).fill(user.telegramUsername);
  await page.getByLabel(/^Password$/).fill(user.password);
  await page.getByLabel("Confirm password").fill(user.password);
  await Promise.all([
    page.waitForURL(/\/dashboard$/, { timeout: 20000 }),
    page.getByRole("button", { name: "Create account" }).click(),
  ]);
  stamp("register", user.username);
}

async function updateSettings(page, user) {
  await goto(page, "/dashboard/settings", "Account profile", "settings-before-save");
  const inputs = page.getByRole("textbox");
  await inputs.nth(0).fill(user.fullName);
  await inputs.nth(1).fill(user.telegramUsername);
  await inputs.nth(2).fill(user.telegramId);
  await inputs.nth(3).fill(user.walletAddress);
  await Promise.all([
    page.waitForURL(/saved=1/, { timeout: 20000 }),
    page.getByRole("button", { name: "Save settings" }).click(),
  ]);
  await page.getByText("Profile updated successfully.", { exact: false }).waitFor();
  stamp("settings", "profile saved");
}

async function openProfileMenu(page) {
  const button = page.getByRole("button", { name: /Balance/i }).first();
  await button.click();
  await page.getByText("Current Balance", { exact: false }).waitFor({ timeout: 10000 });
}

async function verifyRegularUserAdminBlock(page) {
  await page.goto(`${baseUrl}/admin`, { waitUntil: "domcontentloaded" });
  await acceptCookies(page);
  const unauthorized =
    (await page.getByText("Admin Dashboard", { exact: false }).count()) === 0;
  if (!unauthorized) {
    throw new Error("Regular user unexpectedly accessed admin dashboard.");
  }
  await saveScreenshot(page, "regular-user-admin-block");
  stamp("rbac", "regular user blocked from /admin");
}

async function runDeposit(page, user) {
  await page.goto(`${baseUrl}/dashboard/deposit`, { waitUntil: "domcontentloaded" });
  await acceptCookies(page);
  await page.getByRole("heading", { name: "Deposit" }).waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: "Add Funds" }).waitFor({ timeout: 15000 });
  await saveScreenshot(page, "deposit-page");
  await page.getByRole("button", { name: /1,?000/i }).click();
  await page.getByRole("button", { name: /Credit Card/i }).first().click();
  await page.getByRole("button", { name: /Stripe Pay/i }).click();
  await fillIfVisible(page.getByLabel("Cardholder"), user.fullName);
  await fillIfVisible(page.getByLabel("Card Number"), "4242 4242 4242 4242");
  await fillIfVisible(page.getByLabel("Expiration"), "12/28");
  await fillIfVisible(page.getByLabel("CVV"), "424");
  await fillIfVisible(page.getByLabel("Billing Country"), "United States");
  await page.getByRole("button", { name: "Add Funds" }).click();
  await page.getByText("Deposit Receipt", { exact: false }).waitFor({ timeout: 20000 });
  await saveScreenshot(page, "deposit-receipt", false);
  await page.getByText("$1,000.00", { exact: false }).first().waitFor({ timeout: 10000 });
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("Current Balance", { exact: false }).first().waitFor();
  stamp("deposit", "successful top-up");
}

async function addFirstAvailableProductToCart(page) {
  await goto(page, "/marketplace", "Marketplace", "marketplace");
  const addButton = page.locator('button:has-text("Add to cart"):not([disabled])').first();
  await addButton.waitFor({ timeout: 15000 });
  await addButton.click();
  stamp("cart", "added first available product");
}

async function tweakCartQuantity(page) {
  await goto(page, "/cart", "Cart", "cart-before-checkout");
  const plusButton = page.getByRole("button", { name: "+" }).first();
  const minusButton = page.getByRole("button", { name: "-" }).first();
  if (await plusButton.isEnabled()) {
    await plusButton.click();
    await shortPause(page);
    await minusButton.click();
    await shortPause(page);
    stamp("cart", "quantity increase/decrease verified");
    return;
  }

  stamp("cart", "stock cap respected for single-stock item");
}

async function openCheckout(page) {
  const checkoutLink = page.getByRole("link", { name: "Continue to checkout" });
  await checkoutLink.waitFor({ timeout: 15000 });
  await checkoutLink.click();
  await page.waitForURL(/\/checkout$/, { timeout: 15000 });
  await page.getByText("Order Summary", { exact: false }).waitFor();
}

async function completeDirectPurchase(page, user) {
  await openCheckout(page);
  await page.getByRole("button", { name: /Credit Card/i }).first().click();
  await page.getByRole("button", { name: /Stripe Pay/i }).click();
  await fillIfVisible(page.getByLabel("Cardholder Name"), user.fullName);
  await fillIfVisible(page.getByLabel("Card Number"), "4242 4242 4242 4242");
  await fillIfVisible(page.getByLabel("Expiration"), "12/28");
  await fillIfVisible(page.getByLabel("CVV"), "424");
  await fillIfVisible(page.getByLabel("Billing Country"), "United States");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Confirm purchase" }).click();
  await page.getByText("Purchase Receipt", { exact: false }).waitFor({ timeout: 22000 });
  await saveScreenshot(page, "purchase-receipt", false);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/\/success\?order=/, { timeout: 20000 });
  await saveScreenshot(page, "purchase-success");
  stamp("purchase", "direct card purchase successful");
}

async function completeDeclinedThenBalanceRetry(page, user) {
  await addFirstAvailableProductToCart(page);
  await goto(page, "/cart", "Cart", "cart-before-decline");
  await shortPause(page, 1500);
  await openCheckout(page);
  await page.getByRole("button", { name: /Credit Card/i }).first().click();
  await page.getByRole("button", { name: /OnlinePay/i }).click();
  await fillIfVisible(page.getByLabel("Cardholder Name"), user.fullName);
  await fillIfVisible(page.getByLabel("Card Number"), "4242 4242 4242 0000");
  await fillIfVisible(page.getByLabel("Expiration"), "12/28");
  await fillIfVisible(page.getByLabel("CVV"), "424");
  await fillIfVisible(page.getByLabel("Billing Country"), "United States");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Confirm purchase" }).click();
  await page.waitForURL(/\/checkout\/declined\?order=/, { timeout: 20000 });
  await saveScreenshot(page, "checkout-declined");
  stamp("purchase", "declined route reached");

  await page.getByRole("link", { name: "Return to Cart" }).click();
  await page.waitForURL(/\/cart$/, { timeout: 15000 });
  await page.getByText("Order Summary", { exact: false }).waitFor();
  await page.getByRole("link", { name: "Continue to checkout" }).click();
  await page.waitForURL(/\/checkout$/, { timeout: 15000 });
  await page.getByText("Order Summary", { exact: false }).waitFor();
  await page.getByRole("button", { name: /Archive Balance/i }).first().click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Confirm purchase" }).click();
  await page.getByText("Purchase Receipt", { exact: false }).waitFor({ timeout: 22000 });
  await saveScreenshot(page, "balance-retry-receipt", false);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/\/success\?order=/, { timeout: 20000 });
  stamp("purchase", "balance retry successful after decline");
}

async function verifyCollection(page) {
  await goto(page, "/dashboard/collection", "Owned Collection", "collection");
  const emptyState = page.getByText("Your vault is empty.", { exact: false });
  if (await emptyState.isVisible().catch(() => false)) {
    throw new Error("Collection remained empty after successful purchases.");
  }
  stamp("collection", "owned cards present");
}

async function createWithdrawal(page) {
  await goto(page, "/withdraw", "Withdrawal Summary", "withdraw-page");
  await page.getByLabel("Withdrawal Amount").fill("500");
  await page.getByLabel("USDT BEP20 Wallet").fill(
    "0x7b56aeed47fdBfDAf7b8f580d7F2C1Fa8c79919",
  );
  await page.getByRole("button", { name: "Create Withdrawal Request" }).click();
  const success = page.getByText("Withdrawal request created:", { exact: false });
  await success.waitFor({ timeout: 15000 });
  const successText = await success.textContent();
  const match = successText?.match(/WDR-[A-Z0-9-]+/i);
  if (!match) {
    throw new Error("Withdrawal request id not found in success banner.");
  }
  const requestId = match[0];
  await saveScreenshot(page, "withdraw-success");
  stamp("withdraw", requestId);
  return requestId;
}

async function logoutViaProfile(page) {
  await goto(page, "/", "Collect rare galactic cards", "home-authenticated");
  await openProfileMenu(page);
  await Promise.all([
    page.waitForURL(/\/$/, { timeout: 15000 }),
    page.getByRole("button", { name: "Logout" }).click(),
  ]);
  stamp("logout", "regular user logged out");
}

async function loginAdmin(page) {
  await goto(page, "/login", "Welcome back", "login-page");
  await page.getByLabel(/^Username$/).fill("monohrome_admin");
  await page.getByLabel(/^Password$/).fill("123123nrrN!!");
  await Promise.all([
    page.waitForURL(/\/admin$/, { timeout: 20000 }),
    page.getByRole("button", { name: "Sign in" }).click(),
  ]);
  await saveScreenshot(page, "admin-dashboard");
  stamp("admin", "admin login successful");
}

async function createAdminProduct(page, suffix) {
  await goto(page, "/admin/upload", "Card Uploads", "admin-upload");
  const title = `QA Chronicle ${suffix}`;
  await page.locator('input[name="title"]').fill(title);
  await page.locator('select[name="rarity"]').selectOption("Epic");
  await page.locator('select[name="shape"]').selectOption("halo");
  await page.locator('input[name="price"]').fill("88");
  await page.locator('input[name="stock"]').fill("5");
  await page.locator('input[name="collection"]').fill("QA Collection");
  await page.locator('input[name="category"]').fill("QA Archive");
  await page.locator('input[name="edition"]').fill(`QA-${suffix}`);
  await page.locator('input[name="tagline"]').fill("Quality assurance collectible.");
  await page.locator('textarea[name="description"]').fill(
    "A production QA collectible used to verify admin publishing and storefront sync.",
  );
  await page.locator('textarea[name="deliveryDigital"]').fill(
    "Instant archive delivery after secure purchase.",
  );
  await page.locator('textarea[name="deliveryPhysical"]').fill(
    "Serialized physical shipment packed in protective archive casing.",
  );
  await page.getByRole("button", { name: "Publish card" }).click();
  await page.waitForURL(/\/admin\/products\?created=1/, { timeout: 20000 });
  await page.getByText(title, { exact: false }).waitFor({ timeout: 15000 });
  await saveScreenshot(page, "admin-products-created");
  stamp("admin", `product created: ${title}`);
}

async function verifyWithdrawalInAdmin(page, requestId) {
  await goto(page, "/admin/users", "Withdrawal Requests", "admin-users");
  const row = page
    .getByText(requestId, { exact: false })
    .first()
    .locator('xpath=ancestor::div[.//select[@name="status"]][1]');
  await row.waitFor({ timeout: 15000 });
  await row.locator('input[name="adminNote"]').fill("QA reviewed");
  await row.locator('select[name="status"]').selectOption("approved");
  await row.getByRole("button", { name: "Save update" }).click();
  await page.waitForURL(/withdrawalUpdated=1/, { timeout: 20000 });
  await page.getByText("Withdrawal request updated successfully.", { exact: false }).waitFor();
  await saveScreenshot(page, "admin-withdrawals-updated");
  stamp("admin", `withdrawal updated: ${requestId}`);
}

async function verifyLegalPages(page) {
  const routes = [
    ["/privacy-policy", "Privacy Policy", "legal-privacy"],
    ["/terms", "Terms of Service", "legal-terms"],
    ["/refund-policy", "Refund & Shipping Policy", "legal-refund"],
    ["/compliance", "Compliance", "legal-compliance"],
    ["/contact", "Support Email", "legal-contact"],
  ];

  for (const [route, marker, shot] of routes) {
    await goto(page, route, marker, shot);
  }

  stamp("legal", "all legal routes rendered");
}

async function main() {
  await ensureDir();
  const suffix = `${Date.now()}`.slice(-6);
  const user = {
    username: `qauser${suffix}`,
    telegramUsername: `@qa${suffix}`,
    password: "VaultPass123!!",
    fullName: `QA User ${suffix}`,
    telegramId: `${90000000 + Number(suffix)}`,
    walletAddress: "0xBep20VaultWallet123456789",
  };

  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext({
      acceptDownloads: true,
      viewport: { width: 1440, height: 1100 },
    });
    const page = await context.newPage();

    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleIssues.push(message.text());
      }
    });
    page.on("pageerror", (error) => {
      pageErrors.push(error.message);
    });
    page.on("requestfailed", (request) => {
      if (shouldIgnoreRequestFailure(request)) {
        return;
      }

      requestFailures.push(`${request.method()} ${request.url()} -> ${request.failure()?.errorText ?? "failed"}`);
    });

    await goto(page, "/", "Collect rare galactic cards", "home");
    await openProfileMenu(page).catch(() => null);
    await clickIfVisible(page.getByText("Current Balance", { exact: false }));
    await saveScreenshot(page, "home-dropdown", false).catch(() => null);
    await page.mouse.click(20, 20);
    await shortPause(page, 200);

    await verifyLegalPages(page);
    await registerUser(page, user);
    await verifyRegularUserAdminBlock(page);
    await updateSettings(page, user);
    await goto(page, "/", "Collect rare galactic cards", "home-authenticated-dropdown-ready");
    await openProfileMenu(page);
    await saveScreenshot(page, "profile-dropdown-open", false);
    await page.mouse.click(20, 20);
    await shortPause(page, 200);
    await runDeposit(page, user);
    await addFirstAvailableProductToCart(page);
    await tweakCartQuantity(page);
    await completeDirectPurchase(page, user);
    await completeDeclinedThenBalanceRetry(page, user);
    await verifyCollection(page);
    const requestId = await createWithdrawal(page);
    await logoutViaProfile(page);
    await context.close();

    const adminContext = await browser.newContext({
      acceptDownloads: true,
      viewport: { width: 1440, height: 1100 },
    });
    const adminPage = await adminContext.newPage();
    adminPage.on("console", (message) => {
      if (message.type() === "error") {
        consoleIssues.push(`[admin] ${message.text()}`);
      }
    });
    adminPage.on("pageerror", (error) => {
      pageErrors.push(`[admin] ${error.message}`);
    });
    adminPage.on("requestfailed", (request) => {
      if (shouldIgnoreRequestFailure(request)) {
        return;
      }

      requestFailures.push(`[admin] ${request.method()} ${request.url()} -> ${request.failure()?.errorText ?? "failed"}`);
    });

    await loginAdmin(adminPage);
    await createAdminProduct(adminPage, suffix);
    await verifyWithdrawalInAdmin(adminPage, requestId);
    await adminContext.close();
  } finally {
    await browser.close();
  }

  await saveJson("qa-summary", {
    baseUrl,
    summary,
    consoleIssues,
    pageErrors,
    requestFailures,
    artifacts,
  });

  if (consoleIssues.length || pageErrors.length || requestFailures.length) {
    const lines = [
      ...consoleIssues.map((entry) => `console: ${entry}`),
      ...pageErrors.map((entry) => `pageerror: ${entry}`),
      ...requestFailures.map((entry) => `requestfailed: ${entry}`),
    ];
    throw new Error(`QA detected runtime issues:\n${lines.join("\n")}`);
  }

  console.log(`[qa] completed successfully. Artifacts saved to ${outputDir}`);
}

main().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
});
