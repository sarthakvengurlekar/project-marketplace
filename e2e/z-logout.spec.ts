import { test, expect } from '@playwright/test'

// This file is intentionally named z-logout so it runs last.
// Logging out revokes the Supabase session — if this ran earlier it would
// invalidate the shared auth state and break every subsequent test.

test('can log out', async ({ page }) => {
  await page.goto('/profile')
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
  await page.getByRole('button', { name: /sign out|log out/i }).click()
  await expect(page).toHaveURL(/\/login/, { timeout: 8000 })
})
