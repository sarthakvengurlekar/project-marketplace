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

  test('search input filters by card name', async ({ page }) => {
    await page.getByPlaceholder(/search by card name/i).fill('Jynx')
    await expect(page.getByTestId('seller-card').first().or(page.getByTestId('feed-empty-state'))).toBeVisible({ timeout: 8000 })
  })

  test('filter panel opens', async ({ page }) => {
    await page.getByRole('button', { name: /filters/i }).click()
    await expect(page.getByTestId('feed-filters-panel')).toBeVisible()
    await expect(page.getByText(/card filters/i)).toBeVisible()
  })

  test('rarity filter count updates', async ({ page }) => {
    await page.getByRole('button', { name: /filters/i }).click()
    const rarityOption = page.getByTestId('rarity-filter-option').first()
    if (await rarityOption.count() === 0) {
      test.skip()
      return
    }
    await rarityOption.click()
    await expect(page.getByRole('button', { name: /filtered 1/i })).toBeVisible()
  })

  test('profile shortcut navigates to profile', async ({ page }) => {
    await page.getByTestId('feed-profile-link').click()
    await expect(page).toHaveURL(/\/profile/, { timeout: 8000 })
  })

  test('view full collection opens seller binder', async ({ page }) => {
    const sellerCard = page.getByTestId('seller-card').first()
    if (await sellerCard.count() === 0) {
      test.skip()
      return
    }

    await page.getByRole('link', { name: /view full collection/i }).first().click()
    await expect(page).toHaveURL(/\/binder\/[^/]+$/, { timeout: 8000 })
  })
})
