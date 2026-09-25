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

test.describe('customer flows', () => {
  test('a phone draws a ticket, follows it and can cancel it', async ({ page }) => {
    await page.goto('/#/mobile/new');
    await page.getByRole('button', { name: /Levering/ }).first().click();
    await expect(page).toHaveURL(/#\/ticket\/[a-f0-9]+\?k=/);
    await expect(page.getByText(/^L\d{3}$/)).toBeVisible();

    // A reload keeps the ticket (link + local storage)
    await page.reload();
    await expect(page.getByText(/^L\d{3}$/)).toBeVisible();

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: /Avbestill|Cancel my ticket/ }).click();
    await expect(page.getByText(/kansellert|cancelled/i).first()).toBeVisible();
  });

  test('the operator panel calls the next ticket', async ({ page }) => {
    await page.goto('/#/login');
    await page.locator('input[autocomplete="username"]').fill(ADMIN_USERNAME);
    await page.locator('input[autocomplete="current-password"]').fill(ADMIN_PASSWORD);
    await page.locator('form button[type="submit"]').click();
    await expect(page.getByText(/Operatør \/ Admin|Operator \/ Admin/)).toBeVisible();
    await page.goto('/#/admin');
    await expect(page.getByRole('navigation')).toBeVisible();
    // Make sure there is something to call for the selected counter
    await page.goto('/#/mobile/new');
    await page.getByRole('button', { name: /Kundeservice/ }).first().click();
    await expect(page).toHaveURL(/#\/ticket\//);
    await page.goto('/#/admin');
    const callNext = page.getByRole('button', { name: /Kall inn neste|Call next|Fullfør og kall neste|Complete & call next/ }).first();
    await callNext.click();
    await expect(page.getByText(/Nå betjenes|Now serving/).first()).toBeVisible();
  });
});
