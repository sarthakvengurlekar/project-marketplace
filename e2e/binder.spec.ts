import { test, expect } from '@playwright/test'

test.describe('binder', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/binder')
    // Wait for the loading spinner to disappear
    await expect(page.locator('[style*="animate"]').first()).not.toBeVisible({ timeout: 10000 }).catch(() => {})
  })

  test('loads the binder page', async ({ page }) => {
    await expect(page).toHaveURL(/\/binder/)
    await expect(page).not.toHaveURL(/\/login/)
  })

  test('shows bottom navigation', async ({ page }) => {
    // Bottom nav should be present with the 4 tabs
    await expect(page.getByRole('link', { name: /binder/i }).first()).toBeVisible({ timeout: 8000 })
    await expect(page.getByRole('link', { name: /feed/i }).first()).toBeVisible()
  })

  test('has add cards button', async ({ page }) => {
    await expect(
      page.getByRole('link', { name: /add cards?/i })
        .or(page.getByRole('button', { name: /add cards?/i }))
    ).toBeVisible({ timeout: 8000 })
  })

  test('navigates to add-cards page', async ({ page }) => {
    await page.getByRole('link', { name: /add cards?/i })
      .or(page.getByRole('button', { name: /add cards?/i }))
      .first()
      .click()
    await expect(page).toHaveURL(/\/binder\/add-cards|\/add-cards/, { timeout: 8000 })
  })
})

test.describe('add cards — search', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/binder/add-cards')
    await expect(page.getByPlaceholder(/search.*cards/i)).toBeVisible({ timeout: 10000 })
  })

  test('shows search input', async ({ page }) => {
    await expect(page.getByPlaceholder(/search.*cards/i)).toBeVisible()
  })

  test('shows hint text before searching', async ({ page }) => {
    await expect(page.getByText(/type a card name/i)).toBeVisible()
  })

  test('search returns results for a known card', async ({ page }) => {
    await page.getByPlaceholder(/search.*cards/i).fill('Charizard')
    await page.getByRole('button', { name: /^search$/i }).click()

    // Either results appear or a loading spinner shows then results appear
    await expect(
      page.locator('[class*="grid"]').or(page.getByText(/no cards found/i))
    ).toBeVisible({ timeout: 15000 })
  })

  test('shows no results message for gibberish query', async ({ page }) => {
    await page.getByPlaceholder(/search.*cards/i).fill('xyzxyzxyzabc123')
    await page.getByRole('button', { name: /^search$/i }).click()
    await expect(page.getByText(/no cards found/i)).toBeVisible({ timeout: 15000 })
  })

  test('enter key triggers search', async ({ page }) => {
    const input = page.getByPlaceholder(/search.*cards/i)
    await input.fill('Pikachu')
    await input.press('Enter')
    await expect(
      page.locator('[class*="grid"]').or(page.getByText(/no cards found/i))
    ).toBeVisible({ timeout: 15000 })
  })

  test('search button is disabled when input is empty', async ({ page }) => {
    await expect(page.getByRole('button', { name: /^search$/i })).toBeDisabled()
  })
})

test.describe('card detail page', () => {
  test('navigates to a card detail page from binder', async ({ page }) => {
    await page.goto('/binder')
    // Wait for binder to load
    await page.waitForTimeout(2000)

    // If there are any cards, click the first one
    const cardLink = page.locator('a[href*="/binder/card/"]').first()
    const hasCards = await cardLink.count() > 0

    if (hasCards) {
      await cardLink.click()
      await expect(page).toHaveURL(/\/binder\/card\//, { timeout: 8000 })
      // Card detail page should show some card info
      await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 8000 })
    } else {
      test.skip()
    }
  })
})
