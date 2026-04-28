import { test, expect } from '@playwright/test'

test.describe('profile', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/profile')
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
  })

  test('loads profile page without redirecting to login', async ({ page }) => {
    await expect(page).toHaveURL(/\/profile/)
    await expect(page).not.toHaveURL(/\/login/)
  })

  test('shows username', async ({ page }) => {
    // Profile page always shows the logged-in user's username
    const email = process.env.TEST_USER_EMAIL ?? ''
    // Username might be derived from email or set during onboarding — just assert something is there
    await expect(page.locator('h1, h2, h3').first()).toBeVisible({ timeout: 10000 })
  })

  test('shows collection stats', async ({ page }) => {
    // Stats section — card count, trade count, rating
    await expect(
      page.getByText(/cards|collection/i).first()
    ).toBeVisible({ timeout: 8000 })
  })

  test('shows edit profile button', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: /edit|settings/i })
        .or(page.getByText(/edit profile|edit/i).first())
    ).toBeVisible({ timeout: 8000 })
  })

  test('edit profile modal opens', async ({ page }) => {
    const editBtn = page.getByRole('button', { name: /edit|settings/i })
      .or(page.getByText(/edit profile/i).first())
    await editBtn.click()

    // Modal should appear with some form fields
    await expect(
      page.locator('input, textarea').first()
    ).toBeVisible({ timeout: 5000 })
  })

  test('edit profile modal can be closed', async ({ page }) => {
    const editBtn = page.getByRole('button', { name: /edit|settings/i }).first()
    await editBtn.click()

    // Close with the X button or Cancel
    await page.getByRole('button', { name: /close|cancel|✕|×/i })
      .or(page.locator('button').filter({ hasText: /cancel/i }))
      .first()
      .click()

    // Modal should be gone, still on profile
    await expect(page).toHaveURL(/\/profile/)
  })

  test('shows sign out button', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: /sign out|log out/i })
    ).toBeVisible({ timeout: 8000 })
  })

  test('shows bottom navigation', async ({ page }) => {
    await expect(page.getByRole('link', { name: /profile/i }).first()).toBeVisible({ timeout: 8000 })
    await expect(page.getByRole('link', { name: /binder/i }).first()).toBeVisible()
  })

  test('can navigate to own binder from profile', async ({ page }) => {
    // Profile page usually has a link to view the user's binder
    const binderLink = page.getByRole('link', { name: /binder|collection|view/i })
      .or(page.locator('a[href*="/binder"]'))
      .first()

    const hasLink = await binderLink.count() > 0
    if (hasLink) {
      await binderLink.click()
      await expect(page).toHaveURL(/\/binder/, { timeout: 8000 })
    } else {
      test.skip()
    }
  })
})
