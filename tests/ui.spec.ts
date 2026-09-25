import { test, expect } from '@playwright/test';
import { ADMIN_USERNAME, ADMIN_PASSWORD } from './helpers';

test.describe('browser flows', () => {
  test('public display renders without login', async ({ page }) => {
    await page.goto('/#/display');
    await expect(page.getByText(/Nå betjenes|Now serving/)).toBeVisible();
  });

  test('kiosk page refuses to run on a device that is not activated', async ({ page }) => {
    await page.goto('/#/kiosk');
    await expect(page.getByText(/Denne enheten er ikke en kiosk|This device is not a kiosk/)).toBeVisible();
  });

  test('admin logs in, activates a kiosk (and is signed out), then a ticket is drawn', async ({ page }) => {
    await page.goto('/#/login');
    await page.locator('input[autocomplete="username"]').fill(ADMIN_USERNAME);
    await page.locator('input[autocomplete="current-password"]').fill(ADMIN_PASSWORD);
    await page.locator('form button[type="submit"]').click();
    await expect(page.getByText(/Operatør \/ Admin|Operator \/ Admin/)).toBeVisible();

    await page.goto('/#/kiosk');
    await page.getByRole('button', { name: /Aktiver kiosk|Activate kiosk/ }).click();
    await expect(page.getByText(/Velg tjeneste|Choose a service/)).toBeVisible();

    // The admin session is gone from this device; only the device token remains
    const storage = await page.evaluate(() => ({
      token: localStorage.getItem('qflow_token'),
      device: localStorage.getItem('qflow_device_token'),
    }));
    expect(storage.token).toBeNull();
    expect(storage.device).toMatch(/^[a-f0-9]{64}$/);

    await page.getByRole('button', { name: /Kundeservice/ }).first().click();
    await expect(page.getByText(/Ditt nummer|Your number/)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=/^K\\d{3}$/')).toBeVisible();
  });
});
