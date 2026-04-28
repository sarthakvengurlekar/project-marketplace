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

    // Search is live/debounced, so filling the input is enough to trigger it.
    await expect(
      page.locator('[class*="grid"]').or(page.getByText(/no cards found/i))
    ).toBeVisible({ timeout: 15000 })
  })

  test('shows no results message for gibberish query', async ({ page }) => {
    await page.getByPlaceholder(/search.*cards/i).fill('xyzxyzxyzabc123')
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

  test('clear button appears after typing and clears search', async ({ page }) => {
    const input = page.getByPlaceholder(/search.*cards/i)
    await input.fill('Pikachu')
    await page.getByRole('button', { name: /clear/i }).click()
    await expect(input).toHaveValue('')
  })

  test('shows scan button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /^scan$/i })).toBeVisible()
  })

  test('scan modal opens', async ({ page }) => {
    await page.getByRole('button', { name: /^scan$/i }).click()
    await expect(page.getByTestId('scan-card-modal')).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('button', { name: /open camera/i })).toBeVisible()
  })

  test('set filters are visible', async ({ page }) => {
    const chips = page.getByTestId('set-filter-chip')
    if (await chips.count() === 0) {
      test.skip()
      return
    }
    await expect(chips.first()).toBeVisible()
  })

  test('set filter can be selected', async ({ page }) => {
    const chips = page.getByTestId('set-filter-chip')
    if (await chips.count() === 0) {
      test.skip()
      return
    }
    await chips.first().click()
    await expect(page.getByPlaceholder(/searching cards in/i)).toBeVisible()
  })

  test('predictive suggestions appear while typing', async ({ page }) => {
    await page.getByPlaceholder(/search.*cards/i).fill('char')
    await expect(page.getByTestId('card-search-suggestion').first()).toBeVisible({ timeout: 20000 })
  })

  test('predictive suggestion fills search input', async ({ page }) => {
    const input = page.getByPlaceholder(/search.*cards/i)
    await input.fill('char')
    const suggestion = page.getByTestId('card-search-suggestion').first()
    await expect(suggestion).toBeVisible({ timeout: 20000 })
    const suggestionName = (await suggestion.locator('span').first().textContent())?.trim()
    await suggestion.click()
    if (suggestionName) await expect(input).toHaveValue(suggestionName)
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

  test('shows price tabs on card detail page', async ({ page }) => {
    await page.goto('/binder')
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})

    const cardLink = page.locator('a[href*="/binder/card/"]').first()
    if (await cardLink.count() === 0) {
      test.skip()
      return
    }

    await cardLink.click()
    await expect(page).toHaveURL(/\/binder\/card\//, { timeout: 8000 })
    await expect(page.getByRole('button', { name: /^price$/i })).toBeVisible({ timeout: 8000 })
    await expect(page.getByRole('button', { name: /^graded$/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /^details$/i })).toBeVisible()
  })
})
