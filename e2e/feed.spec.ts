import { test, expect } from '@playwright/test'

test.describe('feed', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/feed')
    // Wait for the loading spinner to disappear
    await page.waitForFunction(
      () => !document.querySelector('[style*="animate"]'),
      { timeout: 15000 }
    ).catch(() => {})
  })

  test('loads the feed page without redirecting to login', async ({ page }) => {
    await expect(page).toHaveURL(/\/feed/)
    await expect(page).not.toHaveURL(/\/login/)
  })

  test('shows bottom navigation', async ({ page }) => {
    await expect(page.getByRole('link', { name: /feed/i }).first()).toBeVisible({ timeout: 8000 })
    await expect(page.getByRole('link', { name: /binder/i }).first()).toBeVisible()
  })

  test('shows either seller cards or empty state', async ({ page }) => {
    // Feed either shows seller cards or a "no sellers" / empty state message
    await expect(
      page.getByTestId('seller-card').first()
        .or(page.getByTestId('feed-empty-state'))
    ).toBeVisible({ timeout: 10000 })
  })

  test('shows country filter control', async ({ page }) => {
    const countryFilter = page.getByTestId('country-filter')
    await expect(countryFilter).toBeVisible({ timeout: 8000 })

    await expect(page.getByTestId('country-filter-in')).toBeVisible()
    await expect(page.getByTestId('country-filter-uae')).toBeVisible()
    await expect(page.getByTestId('country-filter-both')).toBeVisible()

    await page.getByTestId('country-filter-uae').click()
    await expect(page.getByTestId('country-filter-uae')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('seller-card').first().or(page.getByTestId('feed-empty-state'))).toBeVisible()

    await page.getByTestId('country-filter-both').click()
    await expect(page.getByTestId('country-filter-both')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('seller-card').first().or(page.getByTestId('feed-empty-state'))).toBeVisible()
  })

  test('seller card shows username', async ({ page }) => {
    const sellerCard = page.locator('img[alt*="avatar"], img[alt*="user"]').first()
    const hasSellerCards = await sellerCard.count() > 0

    if (hasSellerCards) {
      // Username should appear somewhere on the page
      await expect(page.locator('h2, h3, p').filter({ hasText: /@|^[a-z0-9_]+$/i }).first())
        .toBeVisible({ timeout: 8000 })
    } else {
      test.skip() // No sellers in test account's feed
    }
  })
})
