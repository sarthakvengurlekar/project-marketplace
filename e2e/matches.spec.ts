import { test, expect } from '@playwright/test'

test.describe('matches', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/matches')
    // Wait for loading to finish
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
  })

  test('loads the matches page without redirecting to login', async ({ page }) => {
    await expect(page).toHaveURL(/\/matches/)
    await expect(page).not.toHaveURL(/\/login/)
  })

  test('shows tab filters', async ({ page }) => {
    // Matches page has CHATBOX / PENDING / DONE tabs
    await expect(page.getByRole('button', { name: /chatbox|messages/i })
      .or(page.getByText(/chatbox|messages/i)).first()
    ).toBeVisible({ timeout: 8000 })

    await expect(page.getByRole('button', { name: /pending/i })
      .or(page.getByText(/pending/i)).first()
    ).toBeVisible()

    await expect(page.getByRole('button', { name: /done|completed/i })
      .or(page.getByText(/done|completed/i)).first()
    ).toBeVisible()
  })

  test('tab switching works', async ({ page }) => {
    const pendingTab = page.getByRole('button', { name: /pending/i })
      .or(page.getByText(/pending/i).first())
    await pendingTab.click()
    // After clicking, either matches appear or empty state — no crash
    await expect(page).toHaveURL(/\/matches/)

    const doneTab = page.getByRole('button', { name: /done|completed/i })
      .or(page.getByText(/done|completed/i).first())
    await doneTab.click()
    await expect(page).toHaveURL(/\/matches/)
  })

  test('shows empty state or match list', async ({ page }) => {
    await expect(
      page.getByTestId('match-list-item').first()
        .or(page.getByTestId('matches-empty-state'))
    ).toBeVisible({ timeout: 10000 })
  })

  test('clicking a match navigates to match detail', async ({ page }) => {
    const matchLink = page.getByTestId('match-list-item').first()
    const hasMatches = await matchLink.count() > 0

    if (hasMatches) {
      await matchLink.click()
      await expect(page).toHaveURL(/\/matches\/[^/]+$/, { timeout: 8000 })
    } else {
      test.skip()
    }
  })
})

test.describe('match detail / chat', () => {
  test('shows message input on active match', async ({ page }) => {
    await page.goto('/matches')
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})

    // Only run if an active (CHATBOX) match exists
    const chatboxTab = page.getByRole('button', { name: /chatbox|messages/i })
      .or(page.getByText(/chatbox/i).first())
    await chatboxTab.click()

    const matchLink = page.locator('a[href*="/matches/"]').first()
    const hasMatches = await matchLink.count() > 0

    if (!hasMatches) {
      test.skip()
      return
    }

    await matchLink.click()
    await expect(page).toHaveURL(/\/matches\/[^/]+$/)

    // Active match should have a message input
    await expect(
      page.getByPlaceholder(/message|type here/i)
        .or(page.locator('textarea, input[type="text"]').last())
    ).toBeVisible({ timeout: 8000 })
  })
})
