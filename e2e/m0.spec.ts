import { expect, test } from '@playwright/test';
import { fakeRead } from './helpers';

test('boots in browser mode and creates settings.json in the data dir', async ({ page }) => {
  await page.goto('/?nowelcome');
  await expect(page.locator('[data-loaded="true"]')).toBeAttached();
  const settings = JSON.parse(await fakeRead(page, '/data/settings.json'));
  expect(settings.theme.followOS).toBe(true);
});
