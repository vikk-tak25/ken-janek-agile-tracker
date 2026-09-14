const { test, expect } = require('@playwright/test');
const path = require('node:path');

test('create, validate, edit, comment, reorder with mouse, reload, move and delete', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#todoList .card')).toHaveCount(2);
  await page.getByLabel('Pealkiri', { exact: true }).fill('Brauseri test');
  await page.getByLabel('Kirjeldus', { exact: true }).fill('Muudetav kirjeldus');
  await page.getByLabel('Vastuvõtutingimused (iga rida eraldi)').fill('Esimene tingimus');
  for (const invalid of ['1.5', '3abc', '-1', '']) {
    await page.getByLabel('Punktid', { exact: true }).fill(invalid);
    await page.getByRole('button', { name: 'Lisa story', exact: true }).click();
    await expect(page.locator('#formError')).toContainText('täisarv');
    await expect(page.locator('#todoList .card')).toHaveCount(2);
  }
  await page.getByLabel('Punktid', { exact: true }).fill('0');
  await page.getByRole('button', { name: 'Lisa story', exact: true }).click();
  const card = page.locator('.card').filter({ hasText: 'Brauseri test' });
  await expect(card).toHaveCount(1);
  await card.getByRole('button', { name: 'Muuda', exact: true }).click();
  await expect(page.getByLabel('Kirjeldus', { exact: true })).toHaveValue('Muudetav kirjeldus');
  await page.getByLabel('Pealkiri', { exact: true }).fill('Brauseri test muudetud');
  await page.getByLabel('Kirjeldus', { exact: true }).fill('Uus kirjeldus');
  await page.getByLabel('Punktid', { exact: true }).fill('8');
  await page.getByLabel('Vastuvõtutingimused (iga rida eraldi)').fill('Muudetud tingimus\nTeine tingimus');
  await page.getByRole('button', { name: 'Salvesta muudatused' }).click();
  await expect(card).toContainText('Uus kirjeldus');
  await expect(card).toContainText('8 punkti');
  await card.getByPlaceholder('Lisa kommentaar').fill('<b>Kommentaar tekstina</b>');
  await card.getByRole('button', { name: 'Lisa kommentaar', exact: true }).click();
  await expect(card.locator('.comments')).toContainText('<b>Kommentaar tekstina</b>');
  await expect(card.locator('.comments b')).toHaveCount(0);
  await expect(card.locator('.comments time')).toHaveAttribute('datetime', /T/);

  const id = await card.getAttribute('data-id');
  const first = page.locator('#todoList .card').first();
  await card.dragTo(first, { sourcePosition: { x: 10, y: 10 }, targetPosition: { x: 25, y: 10 } });
  await expect(page.locator('#todoList .card').first()).toHaveAttribute('data-id', id);
  await page.reload();
  await expect(page.locator('#todoList .card').first()).toHaveAttribute('data-id', id);
  const last = page.locator('#todoList .card').last();
  const box = await last.boundingBox();
  await card.dragTo(last, { sourcePosition: { x: 10, y: 10 }, targetPosition: { x: 25, y: box.height - 5 } });
  await expect(page.locator('#todoList .card').last()).toHaveAttribute('data-id', id);
  await page.reload();
  await expect(page.locator('#todoList .card').last()).toHaveAttribute('data-id', id);

  await card.dragTo(page.locator('#doneList'), { sourcePosition: { x: 10, y: 10 } });
  await expect(page.locator('#doneList .card')).toHaveAttribute('data-id', id);
  await page.reload();
  await expect(page.locator('#doneList .card')).toHaveAttribute('data-id', id);
  await page.screenshot({ path: path.join(__dirname, '../docs/kanban.png'), fullPage: true });
  await card.getByRole('button', { name: 'Muuda', exact: true }).click();
  await page.getByRole('combobox', { name: 'Staatus', exact: true }).selectOption('doing');
  await page.getByRole('button', { name: 'Salvesta muudatused' }).click();
  await expect(page.locator('#doingList').locator(`[data-id="${id}"]`)).toHaveCount(1);
  page.once('dialog', dialog => dialog.accept());
  await card.getByRole('button', { name: 'Kustuta', exact: true }).click();
  await expect(card).toHaveCount(0);
  await expect(page.locator('#boardError')).toBeEmpty();
  expect(errors).toEqual([]);
});

test('mobile form and board fit viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('#todoList .card').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});


test('search, combined filters, totals, details and comment deletion', async ({ page, request }) => {
  const created = await request.post('/api/stories', { data: {
    title: 'Otsitav lisavõimalus', description: 'Eriline kirjeldus', points: 13,
    status: 'done', acceptanceCriteria: ['Detailis nähtav tingimus']
  } });
  const story = await created.json();
  await request.post(`/api/stories/${story.id}/comments`, { data: { text: 'Eemaldatav kommentaar' } });
  await page.goto('/');
  await expect(page.locator('[data-status="done"] .column-total')).toHaveText('Kokku: 13 punkti');
  await page.getByLabel('Otsi story’sid').fill('ERILINE');
  await expect(page.locator('.board .card')).toHaveCount(1);
  await expect(page.locator('.board .card')).toHaveAttribute('draggable', 'false');
  await page.getByRole('combobox', { name: 'Filtreeri staatuse järgi' }).selectOption('todo');
  await expect(page.locator('.board .card')).toHaveCount(0);
  await expect(page.locator('[data-status="done"] .column-total')).toHaveText('Nähtavad: 0 punkti · Veerus kokku: 13 punkti');
  await page.getByRole('combobox', { name: 'Filtreeri staatuse järgi' }).selectOption('done');
  await page.getByLabel('Filtreeri punktide järgi').fill('3');
  await expect(page.locator('.board .card')).toHaveCount(0);
  await page.getByLabel('Filtreeri punktide järgi').fill('13');
  await expect(page.locator('.board .card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Detailid', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Eriline kirjeldus');
  await expect(dialog).toContainText('Detailis nähtav tingimus');
  await expect(dialog.locator('.story-dates')).toContainText('Loodud:');
  await expect(dialog.locator('.story-dates time').first()).toHaveAttribute('datetime', story.createdAt);
  await expect(dialog).toContainText('Eemaldatav kommentaar');
  page.once('dialog', prompt => prompt.accept());
  await dialog.getByRole('button', { name: 'Kustuta kommentaar', exact: true }).click();
  await expect(dialog).not.toContainText('Eemaldatav kommentaar');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'Tühjenda filtrid' }).click();
  await expect(page.locator('.board .card')).toHaveCount(4);
  await expect(page.locator('.board .card').first()).toHaveAttribute('draggable', 'true');
  await page.reload();
  await expect(page.locator('.board')).not.toContainText('Eemaldatav kommentaar');
  await page.locator(`.board [data-id="${story.id}"]`).getByRole('button', { name: 'Detailid' }).click();
  await dialog.getByRole('button', { name: 'Muuda', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByLabel('Punktid', { exact: true }).fill('5');
  await page.getByRole('button', { name: 'Salvesta muudatused' }).click();
  await expect(page.locator('[data-status="done"] .column-total')).toHaveText('Kokku: 5 punkti');
  await page.screenshot({ path: path.join(__dirname, '../docs/kanban.png'), fullPage: true });
  await page.locator(`.board [data-id="${story.id}"]`).getByRole('button', { name: 'Detailid' }).click();
  await page.screenshot({ path: path.join(__dirname, '../docs/detail.png'), fullPage: true });
  await request.delete(`/api/stories/${story.id}`);
});
