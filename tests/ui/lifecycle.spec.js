import { test, expect } from '@playwright/test';

test('web search closes with Escape and carousel autoplay pauses on hover', async ({ page }) => {
  const failures = [];
  page.on('pageerror', (error) => failures.push(error.message));
  await page.clock.install();
  await page.goto('http://127.0.0.1:5175');
  const hero = page.getByTestId('hero-carousel');
  await expect(hero).toBeVisible();
  const active = hero.locator('.hero-slide.is-active h1');
  const first = await active.textContent();
  await page.clock.fastForward(6500);
  await expect(active).not.toHaveText(first);
  await hero.hover();
  const paused = await active.textContent();
  await page.clock.fastForward(13000);
  await expect(active).toHaveText(paused);
  await page.getByTestId('header-search-open').click();
  await expect(page.getByTestId('search-modal')).toBeVisible();
  await page.getByPlaceholder('Tên phim, thể loại hoặc thành phố...').fill('Hà Nội');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('search-modal')).toHaveCount(0);
  await expect(page.locator('.site-header')).toBeVisible();
  expect(failures).toEqual([]);
});

test('stored demo session survives reload and synchronizes with another tab', async ({ page, context }) => {
  await page.goto('http://127.0.0.1:5175/dang-nhap');
  await page.getByRole('button', { name: 'Dùng thử với tài khoản Minh Anh' }).click();
  await expect(page).toHaveURL('http://127.0.0.1:5175/');
  await page.reload();
  await expect(page.getByRole('link', { name: 'Minh Anh', exact: true })).toBeVisible();
  const other = await context.newPage();
  await other.goto('http://127.0.0.1:5175');
  await expect(other.getByRole('link', { name: 'Minh Anh', exact: true })).toBeVisible();
  await page.evaluate(() => window.localStorage.removeItem('marumo_member_user'));
  await expect(other.getByRole('link', { name: 'Minh Anh', exact: true })).toHaveCount(0);
});

test('quick-ticket cinema choice resets after cross-tab preference changes away and back', async ({ page, context }) => {
  await page.goto('http://127.0.0.1:5175');
  const cinema = page.getByTestId('quick-ticket-cinema');
  const ids = await cinema.locator('option').evaluateAll((options) => options.map((option) => option.value));
  const initial = await cinema.inputValue();
  const manual = ids.find((id) => id !== initial);
  await cinema.selectOption(manual);
  const other = await context.newPage();
  await other.goto('http://127.0.0.1:5175');
  const alternate = ids.find((id) => id !== initial && id !== manual);
  await other.evaluate((id) => window.localStorage.setItem('marumo_preferred_cinema', JSON.stringify(id)), alternate);
  await expect(cinema).toHaveValue(alternate);
  await other.evaluate((id) => window.localStorage.setItem('marumo_preferred_cinema', JSON.stringify(id)), initial);
  await expect(cinema).toHaveValue(initial);
});

test('admin filter retains typing focus and modal Escape listeners clean up', async ({ page }) => {
  const failures = [];
  page.on('pageerror', (error) => failures.push(error.message));
  await page.goto('http://127.0.0.1:5173/movies');
  const search = page.getByPlaceholder('Search title, genre, or director...');
  await search.click();
  await search.pressSequentially('midnight');
  await expect(search).toHaveValue('midnight');
  await expect(search).toBeFocused();
  await page.getByRole('button', { name: 'Add Movie', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Add New Movie' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Add New Movie' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Add Movie', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Add New Movie' })).toBeVisible();
  await page.keyboard.press('Escape');
  await search.fill('orbital');
  await expect(search).toHaveValue('orbital');
  expect(failures).toEqual([]);
});

test('booking hold expires and releases the selected seats without an effect hook', async ({ page }) => {
  const failures = [];
  page.on('pageerror', (error) => failures.push(error.message));
  await page.clock.install();
  await page.goto('http://127.0.0.1:5175/booking/velvet-syndicate');
  await page.getByRole('button', { name: 'Chọn ghế', exact: true }).click();
  const seat = page.getByRole('button', { name: /Ghế .*còn trống/ }).first();
  await seat.click();
  await page.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
  await expect(page.locator('.hold-timer')).toBeVisible();
  await page.clock.fastForward(7 * 60 * 1000 + 1000);
  await expect(page.getByText('Đã hết 7 phút giữ ghế. Vui lòng chọn lại suất chiếu và ghế.')).toBeVisible();
  await expect(page.locator('.hold-timer')).toHaveCount(0);
  expect(failures).toEqual([]);
});
