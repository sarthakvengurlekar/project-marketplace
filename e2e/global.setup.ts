import { test as setup } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const AUTH_FILE = path.join(__dirname, '.auth/user.json')

setup('authenticate', async ({ page }) => {
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true })

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

  const loginError = page.getByTestId('login-error')

  // Wait for redirect away from /login — confirms auth succeeded.
  // If Supabase rejects the login, fail with the visible login message instead
  // of timing out on the URL assertion.
  await Promise.race([
    page.waitForURL(/\/(feed|binder|profile|matches)/, { timeout: 20_000 }),
    loginError.waitFor({ state: 'visible', timeout: 20_000 }).then(async () => {
      throw new Error(`Login failed: ${await loginError.textContent()}`)
    }),
  ])

  await page.context().storageState({ path: AUTH_FILE })
})
