const form = document.getElementById('newForm');
const formError = document.getElementById('formError');
const boardError = document.getElementById('boardError');
let editingId = null;
let draggedCard = null;
let dropBefore = null;
let saving = false;
let stories = [];
let detailId = null;
const detail = document.getElementById('storyDetail');

function dateLabel(value) {
  return value ? new Date(value).toLocaleString('et-EE') : 'Teadmata (varasem story)';
}

function hasFilters() {
  return Boolean(document.getElementById('search').value.trim() || document.getElementById('filterStatus').value || document.getElementById('filterPoints').value);
}

function openDetail(story) {
  detailId = story.id;
  document.getElementById('detailHeading').textContent = `Story #${story.id}`;
  const card = buildCard(story, true);
  document.getElementById('detailContent').replaceChildren(card);
  if (!detail.open) detail.showModal();
}
document.getElementById('closeDetail').addEventListener('click', () => detail.close());
detail.addEventListener('close', () => { detailId = null; });

async function api(path, method = 'GET', body) {
  const response = await fetch(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(data.errors ? data.errors.join('\n') : data.error || 'Salvestamine ebaõnnestus');
  return data;
}

// User-provided content is text, never interpreted as HTML.
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function resetForm() {
  editingId = null;
  form.reset();
  document.getElementById('formHeading').textContent = 'Lisa uus story';
  document.getElementById('addBtn').textContent = 'Lisa story';
  document.getElementById('cancelEdit').hidden = true;
  formError.textContent = '';
}

function editStory(story) {
  if (detail.open) detail.close();
  editingId = story.id;
  for (const field of ['title', 'description', 'points', 'status']) document.getElementById(field).value = story[field];
  document.getElementById('acceptance').value = story.acceptanceCriteria.join('\n');
  document.getElementById('formHeading').textContent = `Muuda story #${story.id}`;
  document.getElementById('addBtn').textContent = 'Salvesta muudatused';
  document.getElementById('cancelEdit').hidden = false;
  formError.textContent = '';
  document.getElementById('title').focus();
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function mutate(action) {
  if (saving) return;
  saving = true;
  boardError.textContent = '';
  document.querySelectorAll('button').forEach(button => { button.disabled = true; });
  try {
    await action();
  } catch (error) {
    boardError.textContent = error.message || 'Ühendus serveriga ebaõnnestus. Proovi uuesti.';
  } finally {
    // Restore persisted order even if a request failed or the drag was cancelled.
    try { await load(); } catch (error) { boardError.textContent = error.message; }
    saving = false;
    document.querySelectorAll('button').forEach(button => { button.disabled = false; });
  }
}

function buildCard(story, inDetail = false) {
  const card = element('article', undefined, 'card');
  card.draggable = !inDetail && !hasFilters();
  card.dataset.id = story.id;
  card.dataset.status = story.status;
  card.setAttribute('aria-label', `Story #${story.id}: ${story.title}`);
  card.append(element('strong', story.title), element('div', `#${story.id} · ${story.points} punkti · ${story.status}`, 'meta'));
  if (story.description) card.append(element('p', story.description));
  const criteria = element('ul', undefined, 'acceptance');
  story.acceptanceCriteria.forEach(text => criteria.append(element('li', text)));
  card.append(criteria);
  const dates = element('div', undefined, 'story-dates meta');
  for (const [label, value] of [['Loodud', story.createdAt], ['Muudetud', story.updatedAt]]) {
    const row = element('div', label + ': ');
    const time = element('time', dateLabel(value));
    if (value) time.dateTime = value;
    row.append(time);
    dates.append(row);
  }
  card.append(dates);

  const actions = element('div', undefined, 'card-actions');
  if (!inDetail) {
    const view = element('button', 'Detailid');
    view.type = 'button';
    view.addEventListener('click', () => openDetail(story));
    actions.append(view);
  }
  const edit = element('button', 'Muuda');
  edit.type = 'button';
  edit.addEventListener('click', () => editStory(story));
  const remove = element('button', 'Kustuta');
  remove.type = 'button';
  remove.addEventListener('click', () => {
    if (!confirm(`Kustutada story #${story.id}?`)) return;
    mutate(async () => {
      await api(`/api/stories/${story.id}`, 'DELETE');
      if (editingId === story.id) resetForm();
    });
  });
  actions.append(edit, remove);
  card.append(actions);

  const comments = element('div', undefined, 'comments');
  story.comments.forEach(comment => {
    const row = element('p', comment.text);
    const time = element('time', new Date(comment.createdAt).toLocaleString('et-EE'));
    time.dateTime = comment.createdAt;
    row.append(time);
    const removeComment = element('button', 'Kustuta kommentaar');
    removeComment.type = 'button';
    removeComment.addEventListener('click', () => {
      if (!confirm('Kustutada see kommentaar?')) return;
      mutate(() => api(`/api/stories/${story.id}/comments/${comment.id}`, 'DELETE'));
    });
    row.append(removeComment);
    comments.append(row);
  });
  const commentForm = element('form', undefined, 'comment-form');
  const input = element('input');
  input.placeholder = 'Lisa kommentaar';
  input.setAttribute('aria-label', `Kommentaar story #${story.id}`);
  const submit = element('button', 'Lisa kommentaar');
  submit.type = 'submit';
  commentForm.append(input, submit);
  commentForm.addEventListener('submit', event => {
    event.preventDefault();
    if (!input.value.trim()) { boardError.textContent = 'Kommentaar ei tohi olla tühi'; return; }
    mutate(() => api(`/api/stories/${story.id}/comments`, 'POST', { text: input.value.trim() }));
  });
  card.append(comments, commentForm);
  card.addEventListener('dragstart', event => {
    if (saving || inDetail || hasFilters() || event.target.closest('input,button,textarea,select')) { event.preventDefault(); return; }
    draggedCard = card;
    event.dataTransfer.setData('text/plain', String(story.id));
    event.dataTransfer.effectAllowed = 'move';
    card.classList.add('dragging');
  });
  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    draggedCard = null;
    document.querySelectorAll('.drop-before, .drop-end').forEach(node => node.classList.remove('drop-before', 'drop-end'));
    if (!saving) load().catch(error => { boardError.textContent = error.message; });
  });
  return card;
}

async function load() {
  stories = await api('/api/stories');
  renderBoard();
  if (detail.open) {
    const story = stories.find(item => item.id === detailId);
    if (story) openDetail(story);
    else detail.close();
  }
}

function renderBoard() {
  const query = document.getElementById('search').value.trim().toLocaleLowerCase('et');
  const selectedStatus = document.getElementById('filterStatus').value;
  const points = document.getElementById('filterPoints').value;
  const visible = stories.filter(story =>
    (!query || `${story.id} ${story.title} ${story.description}`.toLocaleLowerCase('et').includes(query)) &&
    (!selectedStatus || story.status === selectedStatus) &&
    (!points || story.points === Number(points))
  );
  document.getElementById('filterSummary').textContent = `Näidatud ${visible.length} / ${stories.length} story’t.` + (hasFilters() ? ' Lohistamiseks tühjenda filtrid; staatust saab muuta nupuga Muuda.' : '');
  for (const status of ['todo', 'doing', 'done']) {
    const list = document.getElementById(`${status}List`);
    const items = visible.filter(story => story.status === status);
    list.replaceChildren(...items.map(story => buildCard(story)));
    if (!items.length) list.append(element('p', 'Ühtegi story’t ei ole.', 'empty-state'));
    const column = list.parentElement;
    let total = column.querySelector('.column-total');
    if (!total) { total = element('p', undefined, 'column-total'); column.append(total); }
    const allPoints = stories.filter(story => story.status === status).reduce((sum, story) => sum + story.points, 0);
    const visiblePoints = items.reduce((sum, story) => sum + story.points, 0);
    total.textContent = hasFilters() ? `Nähtavad: ${visiblePoints} punkti · Veerus kokku: ${allPoints} punkti` : `Kokku: ${allPoints} punkti`;
  }
}

for (const id of ['search', 'filterStatus', 'filterPoints']) document.getElementById(id).addEventListener('input', renderBoard);
document.getElementById('clearFilters').addEventListener('click', () => {
  for (const id of ['search', 'filterStatus', 'filterPoints']) document.getElementById(id).value = '';
  renderBoard();
});

// Keep card geometry stable during dragging; move it only on drop.
document.querySelectorAll('.col').forEach(column => {
  column.addEventListener('dragover', event => {
    if (!draggedCard || saving) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const list = column.querySelector('.list');
    dropBefore = Array.from(list.querySelectorAll('.card')).find(card => {
      if (card === draggedCard) return false;
      const rect = card.getBoundingClientRect();
      return event.clientY < rect.top + rect.height / 2;
    });
    document.querySelectorAll('.drop-before, .drop-end').forEach(node => node.classList.remove('drop-before', 'drop-end'));
    if (dropBefore) dropBefore.classList.add('drop-before');
    else list.classList.add('drop-end');
  });
  column.addEventListener('drop', event => {
    if (!draggedCard || saving) return;
    event.preventDefault();
    const id = Number(draggedCard.dataset.id);
    const previousStatus = draggedCard.dataset.status;
    const status = column.dataset.status;
    column.querySelector('.list').insertBefore(draggedCard, dropBefore || null);
    const order = Array.from(document.querySelectorAll('#todoList .card'), card => Number(card.dataset.id));
    mutate(async () => {
      if (previousStatus !== status) await api(`/api/stories/${id}/status`, 'PATCH', { status });
      if (status === 'todo') await api('/api/stories/reorder', 'PATCH', { order });
    });
  });
});

document.getElementById('cancelEdit').addEventListener('click', resetForm);
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (saving) return;
  formError.textContent = '';
  const rawPoints = document.getElementById('points').value.trim();
  if (!/^\d+$/.test(rawPoints) || !Number.isSafeInteger(Number(rawPoints))) {
    formError.textContent = 'Punktid peavad olema null või positiivne täisarv. Väli ei tohi olla tühi.';
    return;
  }
  const payload = {
    title: document.getElementById('title').value.trim(),
    description: document.getElementById('description').value.trim(),
    points: Number(rawPoints),
    status: document.getElementById('status').value,
    acceptanceCriteria: document.getElementById('acceptance').value.split('\n').map(text => text.trim()).filter(Boolean)
  };
  await mutate(async () => {
    try {
      await api(editingId === null ? '/api/stories' : `/api/stories/${editingId}`, editingId === null ? 'POST' : 'PUT', payload);
      resetForm();
    } catch (error) { formError.textContent = error.message; }
  });
});

load().catch(error => { boardError.textContent = error.message; });
