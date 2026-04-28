import { test, expect } from '@playwright/test'

// ── Unauthenticated tests — override stored auth state ─────────────────────────
test.describe('unauthenticated', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('redirects protected routes to /login', async ({ page }) => {
    for (const route of ['/feed', '/binder', '/matches', '/profile']) {
      await page.goto(route)
      await expect(page).toHaveURL(/\/login/, { timeout: 8000 })
    }
  })

  test('shows login page at /login', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: /projecttrading/i })).toBeVisible()
    await expect(page.getByPlaceholder('you@example.com')).toBeVisible()
    await expect(page.getByPlaceholder('••••••••')).toBeVisible()
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
  })

  test('shows error on invalid credentials', async ({ page }) => {
    await page.goto('/login')
    await page.getByPlaceholder('you@example.com').fill('notareal@user.com')
    await page.getByPlaceholder('••••••••').fill('wrongpassword')
    await page.getByRole('button', { name: /sign in/i }).click()
    // Supabase returns "Invalid login credentials" or similar
    await expect(page.locator('div').filter({ hasText: /invalid|credentials|incorrect/i }).first()).toBeVisible({ timeout: 8000 })
  })

  test('shows signup page at /signup', async ({ page }) => {
    await page.goto('/signup')
    await expect(page.getByRole('heading', { name: /projecttrading/i })).toBeVisible()
    await expect(page.getByPlaceholder('you@example.com')).toBeVisible()
  })

  test('signup validates password mismatch', async ({ page }) => {
    await page.goto('/signup')
    await page.getByPlaceholder('you@example.com').fill('test@example.com')
    // Fill both password fields — find them by type since placeholders match "••••••••"
    const pwFields = page.locator('input[type="password"]')
    await pwFields.nth(0).fill('password123')
    await pwFields.nth(1).fill('different456')
    await page.getByRole('button', { name: /sign up|create/i }).click()
    await expect(page.getByText(/passwords do not match/i)).toBeVisible()
  })

  test('signup validates password too short', async ({ page }) => {
    await page.goto('/signup')
    await page.getByPlaceholder('you@example.com').fill('test@example.com')
    const pwFields = page.locator('input[type="password"]')
    await pwFields.nth(0).fill('abc')
    await pwFields.nth(1).fill('abc')
    await page.getByRole('button', { name: /sign up|create/i }).click()
    await expect(page.getByText(/at least 6 characters/i)).toBeVisible()
  })

  test('signup has link to login', async ({ page }) => {
    await page.goto('/signup')
    await page.getByRole('link', { name: /sign in|log in/i }).click()
    await expect(page).toHaveURL(/\/login/)
  })

  test('login has link to signup', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('link', { name: /sign up/i }).click()
    await expect(page).toHaveURL(/\/signup/)
  })

  test('login page navigates to forgot password', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('link', { name: /forgot password/i }).click()
    await expect(page).toHaveURL(/\/forgot-password/)
  })

  test('forgot password page renders reset form', async ({ page }) => {
    await page.goto('/forgot-password')
    await expect(page.getByRole('heading', { name: /projecttrading/i })).toBeVisible()
    await expect(page.getByText(/reset your password/i)).toBeVisible()
    await expect(page.getByPlaceholder('you@example.com')).toBeVisible()
    await expect(page.getByRole('button', { name: /send reset link/i })).toBeVisible()
  })

  test('forgot password back link returns to login', async ({ page }) => {
    await page.goto('/forgot-password')
    await page.getByRole('link', { name: /back to sign in/i }).click()
    await expect(page).toHaveURL(/\/login/)
  })
})

// ── Authenticated tests — already logged in ────────────────────────────────────
test.describe('authenticated', () => {
  test('visiting /login redirects to /feed', async ({ page }) => {
    await page.goto('/login')
    await expect(page).toHaveURL(/\/feed/, { timeout: 8000 })
  })

  test('visiting /signup redirects to /feed', async ({ page }) => {
    await page.goto('/signup')
    await expect(page).toHaveURL(/\/feed/, { timeout: 8000 })
  })

})
