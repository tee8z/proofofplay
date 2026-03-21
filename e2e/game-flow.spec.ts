import { test, expect } from "@playwright/test";

// Generate a unique username per test run
function uniqueUsername() {
  return `test_${Date.now().toString(36)}`;
}

/** Register a new user via the username flow on the current page. */
async function registerUser(
  page: import("@playwright/test").Page,
  username: string,
  password: string
) {
  // Click "Sign Up" in the navbar
  await page.click("#registerBtn");
  await expect(page.locator("#registerModal")).toHaveClass(/is-active/);

  // Fill username registration form (username tab is active by default)
  await page.fill("#registerUsernameInput", username);
  await page.fill("#registerPasswordInput", password);
  await page.fill("#registerPasswordConfirm", password);
  await page.click("#usernameRegisterButton");

  // Wait for step 2 (recovery key display)
  await expect(page.locator("#usernameRegisterStep2")).not.toHaveClass(
    /is-hidden/,
    { timeout: 10_000 }
  );

  // Click "I have saved my recovery key" to continue
  await page.click("#usernameRegisterComplete");

  // Wait for auth to complete — nav shows username
  await expect(page.locator("#userInfoArea")).not.toHaveClass(/is-hidden/, {
    timeout: 10_000,
  });
  await expect(page.locator("#usernameDisplay")).toHaveText(username);
}

test.describe("Onboarding flow", () => {
  test("register → pay → game starts", async ({ page }) => {
    const username = uniqueUsername();

    // Go directly to the game page and register from there
    // (avoids full page reload that loses username auth session)
    await page.goto("/play");
    await expect(page.locator("#startGameBtn")).toBeVisible({
      timeout: 10_000,
    });

    await registerUser(page, username, "testpass123!");

    // Start game → payment flow
    await page.click("#startGameBtn");

    // Payment modal should appear (stub provider creates a fake invoice)
    await expect(page.locator("#paymentModal")).toBeVisible({
      timeout: 15_000,
    });

    // The stub auto-settles: the payment poller finds "paid" on its
    // first check. Wait for the game container to become visible.
    await expect(page.locator(".game-container")).toBeVisible({
      timeout: 30_000,
    });

    // Game canvas should be rendering
    await expect(page.locator("#gameCanvas")).toBeVisible();

    // HUD should show initial state
    await expect(page.locator("#score")).toHaveText("0");
    await expect(page.locator("#level")).toHaveText("1");
  });
});

test.describe("Full game cycle", () => {
  test("play through to game over → score on leaderboard", async ({
    page,
  }) => {
    const username = uniqueUsername();

    await page.goto("/play");
    await expect(page.locator("#startGameBtn")).toBeVisible({
      timeout: 10_000,
    });

    await registerUser(page, username, "testpass123!");

    // Start game and wait for payment to auto-settle
    await page.click("#startGameBtn");
    await expect(page.locator(".game-container")).toBeVisible({
      timeout: 30_000,
    });

    // Thrust into asteroids to die quickly
    await page.keyboard.down("ArrowUp");
    await page.keyboard.down("ArrowLeft");

    // Wait for game over
    await expect(page.locator("#game-over-dialog")).toBeVisible({
      timeout: 120_000,
    });

    // Verify a score was displayed
    const finalScore = await page.locator("#final-score").textContent();
    expect(finalScore).toBeTruthy();
    expect(parseInt(finalScore || "0", 10)).toBeGreaterThanOrEqual(0);

    // Navigate to leaderboard and verify username appears
    await page.goto("/leaderboard");
    await expect(page.locator(".leaderboard-table")).toBeVisible({
      timeout: 10_000,
    });

    const leaderboardText = await page
      .locator(".leaderboard-table")
      .textContent();
    expect(leaderboardText).toContain(username);
  });
});
