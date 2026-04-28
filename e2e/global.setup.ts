import { test as setup } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const AUTH_FILE = path.join(__dirname, '.auth/user.json')

setup('authenticate', async ({ page }) => {
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true })

  const browserErrors: string[] = []
  page.on('console', msg => {
    if (msg.type() === 'error') browserErrors.push(msg.text())
  })
  page.on('pageerror', error => browserErrors.push(error.message))
  page.on('requestfailed', request => {
    const url = request.url()
    if (url.includes('supabase') || url.includes('/auth/')) {
      browserErrors.push(`${request.method()} ${url} failed: ${request.failure()?.errorText ?? 'unknown error'}`)
    }
  })

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
  const emailInput = page.getByPlaceholder('you@example.com')
  const passwordInput = page.getByPlaceholder('••••••••')
  const signInButton = page.getByRole('button', { name: /sign in/i })

  const loginError = page.getByTestId('login-error')

  await emailInput.fill(email)
  await expectSoftValue(emailInput, email)
  await passwordInput.fill(password)
  await passwordInput.press('Enter')

  // Wait for redirect away from /login — confirms auth succeeded.
  // If Supabase rejects the login, fail with the visible login message instead.
  const result = await Promise.race([
    page.waitForURL(/\/(feed|binder|profile|matches)/, { timeout: 20_000 }).then(() => 'redirected' as const),
    loginError.waitFor({ state: 'visible', timeout: 20_000 }).then(() => 'error' as const),
  ]).catch(() => 'timeout' as const)

  if (result === 'error') {
    throw new Error(`Login failed: ${await loginError.textContent()}`)
  }

  if (result !== 'redirected') {
    const currentUrl = page.url()
    const buttonText = await signInButton.textContent().catch(() => 'missing sign-in button')
    const enteredEmail = await emailInput.inputValue().catch(() => '')
    throw new Error([
      'Login did not finish before timeout.',
      `Current URL: ${currentUrl}`,
      `Email field: ${enteredEmail || '(empty)'}`,
      `Button text: ${buttonText?.trim() || '(empty)'}`,
      browserErrors.length ? `Browser errors: ${browserErrors.join(' | ')}` : 'Browser errors: none captured',
    ].join('\n'))
  }

  await page.context().storageState({ path: AUTH_FILE })
})

async function expectSoftValue(locator: { inputValue: () => Promise<string> }, expected: string) {
  const actual = await locator.inputValue()
  if (actual !== expected) throw new Error('Failed to fill login email field')
}
