import { test as setup, expect } from '@playwright/test'
import path from 'path'

const AUTH_FILE = path.join(__dirname, '.auth/user.json')

setup('authenticate', async ({ page }) => {
  const email    = process.env.TEST_USER_EMAIL
  const password = process.env.TEST_USER_PASSWORD

  if (!email || !password) {
    throw new Error(
      'TEST_USER_EMAIL and TEST_USER_PASSWORD must be set in .env.test.local\n' +
      'Create a dedicated test account in your Supabase project and add:\n' +
      '  TEST_USER_EMAIL=test@example.com\n' +
      '  TEST_USER_PASSWORD=yourpassword'
    )
  }

  await page.goto('/login')
  await page.getByPlaceholder('you@example.com').fill(email)
  await page.getByPlaceholder('••••••••').fill(password)
  await page.getByRole('button', { name: /sign in/i }).click()

  // Wait for redirect away from /login — confirms auth succeeded
  await expect(page).toHaveURL(/\/(feed|binder|profile|matches)/, { timeout: 15000 })

  await page.context().storageState({ path: AUTH_FILE })
})
