import { test, expect } from "@playwright/test";


function uniqueUsername() {
  return `mob_${Date.now().toString(36)}`;
}

test.describe("Mobile screenshots", () => {
  test("capture all pages for visual review", async ({ page }, testInfo) => {
    // Skip on desktop — only useful for mobile viewports
    if (!testInfo.project.name.startsWith("mobile")) {
      test.skip();
      return;
    }
    const device = testInfo.project.name;
    const username = uniqueUsername();
    const password = "testpass123!";

    // ── Home page (logged out) ───────────────────────────────────────
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: `screenshots/${device}/01-home.png`,
      fullPage: true,
    });

    // ── Leaderboard (empty) ──────────────────────────────────────────
    await page.goto("/leaderboard");
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: `screenshots/${device}/02-leaderboard.png`,
      fullPage: true,
    });

    // ── Game page (logged out) ───────────────────────────────────────
    await page.goto("/play");
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: `screenshots/${device}/03-game-logged-out.png`,
      fullPage: true,
    });

    // ── Register modal ──────────────────────────────────────────────
    await page.click("#registerBtn");
    await expect(page.locator("#registerModal")).toHaveClass(/is-active/);
    await page.screenshot({
      path: `screenshots/${device}/04-register-modal.png`,
      fullPage: true,
    });

    // ── Fill registration ───────────────────────────────────────────
    await page.fill("#registerUsernameInput", username);
    await page.fill("#registerPasswordInput", password);
    await page.fill("#registerPasswordConfirm", password);
    await page.click("#usernameRegisterButton");
    await expect(page.locator("#usernameRegisterStep2")).not.toHaveClass(
      /is-hidden/,
      { timeout: 10_000 }
    );
    await page.screenshot({
      path: `screenshots/${device}/05-recovery-key.png`,
      fullPage: true,
    });

    // ── Complete registration ───────────────────────────────────────
    await page.click("#usernameRegisterComplete");
    await expect(page.locator("#userInfoArea")).not.toHaveClass(/is-hidden/, {
      timeout: 10_000,
    });

    // ── Game page (logged in) ───────────────────────────────────────
    await page.screenshot({
      path: `screenshots/${device}/06-game-logged-in.png`,
      fullPage: true,
    });

    // ── Payment modal ───────────────────────────────────────────────
    await page.click("#startGameBtn");
    await expect(page.locator("#paymentModal")).toBeVisible({
      timeout: 15_000,
    });
    // Wait a moment for QR code to render
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: `screenshots/${device}/07-payment-modal.png`,
      fullPage: true,
    });

    // ── Game running ────────────────────────────────────────────────
    await expect(page.locator(".game-container")).toBeVisible({
      timeout: 30_000,
    });
    // Let a few frames render
    await page.waitForTimeout(2000);
    await page.screenshot({
      path: `screenshots/${device}/08-game-running.png`,
      fullPage: true,
    });

    // ── Login modal (for review) ────────────────────────────────────
    // Open in a new context to see it logged out
    const loginPage = await page.context().newPage();
    await loginPage.goto("http://127.0.0.1:8901/");
    await loginPage.waitForLoadState("networkidle");
    await loginPage.click("#startLoginBtn");
    await expect(loginPage.locator("#loginModal")).toHaveClass(/is-active/);
    await loginPage.screenshot({
      path: `screenshots/${device}/09-login-modal.png`,
      fullPage: true,
    });
    await loginPage.close();
  });
});
