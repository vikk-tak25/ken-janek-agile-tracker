const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agile-tracker-test-'));
process.env.DATA_DIR = directory;
const app = require('../server');
let server;
let base;
const story = { title: 'Test story', description: 'Description', points: 3, status: 'todo', acceptanceCriteria: ['One condition'] };

async function start() {
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
}
async function stop() {
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
async function request(route, method = 'GET', body) {
  const response = await fetch(base + route, {
    method, headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, body: response.status === 204 ? null : await response.json() };
}
before(start);
after(async () => { await stop(); fs.rmSync(directory, { recursive: true, force: true }); });

test('CRUD, comments, status and disk persistence across server restart', async () => {
  assert.equal((await fetch(base)).status, 200);
  const created = await request('/api/stories', 'POST', story);
  assert.equal(created.status, 201);
  const route = `/api/stories/${created.body.id}`;
  assert.equal((await request(route)).body.description, story.description);
  const comment = await request(route + '/comments', 'POST', { text: 'Comment' });
  assert.equal(comment.status, 201);
  assert.ok(Number.isFinite(Date.parse(comment.body.createdAt)));
  assert.equal((await request(route, 'PUT', { ...story, title: 'Edited', points: 0 })).status, 200);
  assert.equal((await request(route + '/status', 'PATCH', { status: 'done' })).body.status, 'done');
  await stop();
  await start();
  const persisted = (await request(route)).body;
  assert.equal(persisted.title, 'Edited');
  assert.equal(persisted.points, 0);
  assert.equal(persisted.comments[0].text, 'Comment');
  assert.equal(persisted.status, 'done');
  assert.equal((await request(route, 'DELETE')).status, 204);
  assert.equal((await request(route)).status, 404);
});

test('POST and PUT reject invalid points, status and acceptance criteria without changing data', async () => {
  const created = await request('/api/stories', 'POST', story);
  const invalid = [
    ...[-1, 1.5, '', null, '3abc', '3', Number.MAX_SAFE_INTEGER + 1].map(points => ({ points })),
    { points: undefined }, { status: 'invalid' }, { status: '' }, { status: null },
    { acceptanceCriteria: [] }, { acceptanceCriteria: [''] }, { acceptanceCriteria: ['  '] },
    { acceptanceCriteria: [null] }, { acceptanceCriteria: ['valid', 2] },
    { title: ' ' }, { title: {} }, { description: [] }, { priority: -1 }
  ];
  const count = (await request('/api/stories')).body.length;
  for (const change of invalid) {
    for (const [method, route] of [['POST', '/api/stories'], ['PUT', `/api/stories/${created.body.id}`]]) {
      const result = await request(route, method, { ...story, ...change });
      assert.equal(result.status, 400, `${method}: ${JSON.stringify(change)}`);
      assert.ok(result.body.errors.length);
    }
  }
  assert.equal((await request('/api/stories')).body.length, count);
  assert.equal((await request(`/api/stories/${created.body.id}`)).body.points, 3);
  assert.equal((await request(`/api/stories/${created.body.id}/comments`, 'POST', { text: {} })).status, 400);
  assert.equal((await request(`/api/stories/${created.body.id}/status`, 'PATCH', { status: 'invalid' })).status, 400);
});

test('backlog reordering persists and rejects duplicate, missing and non-backlog IDs', async () => {
  const all = (await request('/api/stories')).body;
  const order = all.filter(item => item.status === 'todo').map(item => item.id).reverse();
  assert.equal((await request('/api/stories/reorder', 'PATCH', { order })).status, 200);
  await stop();
  await start();
  const readOrder = async () => (await request('/api/stories')).body.filter(item => item.status === 'todo').map(item => item.id);
  assert.deepEqual(await readOrder(), order);
  const doing = all.find(item => item.status === 'doing').id;
  for (const invalid of [order.slice(1), [...order, order[0]], [...order.slice(1), doing], [...order.slice(1), 99999], order.map(String)]) {
    assert.equal((await request('/api/stories/reorder', 'PATCH', { order: invalid })).status, 400);
    assert.deepEqual(await readOrder(), order);
  }
  await request(`/api/stories/${doing}/status`, 'PATCH', { status: 'todo' });
  assert.deepEqual(await readOrder(), [...order, doing]);
});

test('malformed JSON and missing resources return appropriate JSON errors', async () => {
  const malformed = await fetch(base + '/api/stories', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' });
  assert.equal(malformed.status, 400);
  assert.ok((await malformed.json()).error);
  assert.equal((await request('/api/missing')).status, 404);
  assert.equal((await request('/api/stories/999999', 'PUT', story)).status, 404);
  assert.equal((await request('/api/stories/999999', 'DELETE')).status, 404);
});

test('timestamps and comment deletion persist, IDs are never reused', async () => {
  const created = await request('/api/stories', 'POST', story);
  const route = `/api/stories/${created.body.id}`;
  assert.ok(Number.isFinite(Date.parse(created.body.createdAt)));
  assert.equal(created.body.createdAt, created.body.updatedAt);
  await new Promise(resolve => setTimeout(resolve, 5));
  const edited = await request(route, 'PUT', { ...story, title: 'New title', createdAt: 'fake' });
  assert.equal(edited.body.createdAt, created.body.createdAt);
  assert.ok(edited.body.updatedAt > created.body.updatedAt);
  const first = await request(route + '/comments', 'POST', { text: 'First' });
  assert.equal((await request(route + '/comments/' + first.body.id, 'DELETE')).status, 204);
  assert.equal((await request(route + '/comments/' + first.body.id, 'DELETE')).status, 404);
  const second = await request(route + '/comments', 'POST', { text: 'Second' });
  assert.ok(second.body.id > first.body.id);
  await stop();
  await start();
  const persisted = (await request(route)).body;
  assert.equal(persisted.createdAt, created.body.createdAt);
  assert.deepEqual(persisted.comments.map(comment => comment.text), ['Second']);
  assert.ok(persisted.updatedAt >= edited.body.updatedAt);
  assert.equal((await request('/api/stories/999999/comments/1', 'DELETE')).status, 404);
});

test('legacy timestamps are marked unknown without losing existing data', async () => {
  const file = path.join(directory, 'stories.json');
  const db = JSON.parse(fs.readFileSync(file, 'utf8'));
  const existing = db.stories[0];
  delete existing.createdAt;
  delete existing.updatedAt;
  delete existing.lastCommentId;
  fs.writeFileSync(file, JSON.stringify(db));
  const migrated = (await request(`/api/stories/${existing.id}`)).body;
  assert.equal(migrated.createdAt, null);
  assert.equal(migrated.updatedAt, null);
  assert.equal(migrated.title, existing.title);
  assert.deepEqual(migrated.comments, existing.comments);
});
