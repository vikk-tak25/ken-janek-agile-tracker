const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'stories.json');

function ensureData() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ lastId: 4, stories: [
      {
        "id": 1,
        "title": "Kasutajana tahan lisada uue story, et saaksin tööülesande backlogi panna.",
        "description": "Vormist saab lisada uue story",
        "status": "todo",
        "points": 3,
        "priority": 1,
        "acceptanceCriteria": ["Vormis saab sisestada pealkirja.", "Vormis saab sisestada kirjelduse."],
        "comments": []
      },
      {
        "id": 2,
        "title": "Kasutajana tahan muuta story staatust, et näidata töö edenemist.",
        "description": "Staatus muutmine",
        "status": "doing",
        "points": 5,
        "priority": 2,
        "acceptanceCriteria": ["Story staatust saab muuta."],
        "comments": []
      },
      {
        "id": 3,
        "title": "Kasutajana tahan lisada story juurde kommentaare, et arutelu oleks story juures nähtav.",
        "description": "Kommentaarid",
        "status": "todo",
        "points": 3,
        "priority": 3,
        "acceptanceCriteria": ["Kommentaari saab sisestada."],
        "comments": []
      }
    ] }, null, 2));
    return true;
  }
}

function readDB() {
  const initialized = ensureData();
  const raw = fs.readFileSync(DB_FILE, 'utf8');
  const db = JSON.parse(raw);
  // Older stories have no known creation date: keep that fact explicit.
  let migrated = false;
  for (const story of db.stories) {
    if (story.createdAt === undefined) { story.createdAt = initialized ? new Date().toISOString() : null; migrated = true; }
    if (story.updatedAt === undefined) { story.updatedAt = story.createdAt; migrated = true; }
    if (story.lastCommentId === undefined) {
      story.lastCommentId = Math.max(0, ...story.comments.map(comment => comment.id));
      migrated = true;
    }
  }
  if (migrated) writeDB(db);
  return db;
}

function writeDB(db) {
  const temporaryFile = DB_FILE + '.tmp';
  fs.writeFileSync(temporaryFile, JSON.stringify(db, null, 2));
  fs.renameSync(temporaryFile, DB_FILE);
}

function validateStoryPayload(payload) {
  const errors = [];
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return ['Story peab olema JSON-objekt'];
  if (typeof payload.title !== 'string' || payload.title.trim() === '') errors.push('Pealkiri ei tohi olla tühi');
  if (payload.description !== undefined && typeof payload.description !== 'string') errors.push('Kirjeldus peab olema tekst');
  if (payload.points === undefined || payload.points === null || String(payload.points).trim() === '') errors.push('Punktid ei tohi olla tühjad');
  if (!Number.isSafeInteger(payload.points)) errors.push('Punktid peavad olema täisarv');
  if (payload.points < 0) errors.push('Punktid ei tohi olla negatiivsed');
  if (!Array.isArray(payload.acceptanceCriteria) || payload.acceptanceCriteria.length === 0 || payload.acceptanceCriteria.some(item => typeof item !== 'string' || !item.trim())) errors.push('Vähemalt üks mittetühi vastuvõtutingimus on nõutud; iga tingimus peab olema tekst');
  if (payload.status !== undefined && !['todo', 'doing', 'done'].includes(payload.status)) errors.push('Staatus peab olema todo, doing või done');
  if (payload.priority !== undefined && (!Number.isSafeInteger(payload.priority) || payload.priority < 1)) errors.push('Prioriteet peab olema positiivne täisarv');
  return errors;
}

function nextPriority(db) {
  return Math.max(0, ...db.stories.map(story => story.priority || 0)) + 1;
}

app.get('/api/stories', (req, res) => {
  const db = readDB();
  // sort by priority asc
  db.stories.sort((a,b)=> (a.priority||0)-(b.priority||0));
  res.json(db.stories);
});

app.get('/api/stories/:id', (req, res) => {
  const db = readDB();
  const id = Number(req.params.id);
  const s = db.stories.find(x=>x.id===id);
  if (!s) return res.status(404).json({ error: 'Story not found' });
  res.json(s);
});

app.post('/api/stories', (req, res) => {
  const payload = req.body;
  const errors = validateStoryPayload(payload);
  if (errors.length) return res.status(400).json({ errors });
  const db = readDB();
  const id = (db.lastId || 0) + 1;
  db.lastId = id;
  const priority = payload.priority ?? nextPriority(db);
  const now = new Date().toISOString();
  const story = {
    id,
    title: payload.title.trim(),
    description: payload.description || '',
    status: payload.status || 'todo',
    points: payload.points,
    priority,
    acceptanceCriteria: payload.acceptanceCriteria.map(item => item.trim()),
    comments: [],
    lastCommentId: 0,
    createdAt: now,
    updatedAt: now
  };
  db.stories.push(story);
  writeDB(db);
  res.status(201).json(story);
});

app.put('/api/stories/:id', (req, res) => {
  const id = Number(req.params.id);
  const payload = req.body;
  const errors = validateStoryPayload(payload);
  if (errors.length) return res.status(400).json({ errors });
  const db = readDB();
  const idx = db.stories.findIndex(s=>s.id===id);
  if (idx===-1) return res.status(404).json({ error: 'Story not found' });
  const existing = db.stories[idx];
  existing.title = payload.title.trim();
  existing.description = payload.description || '';
  existing.points = payload.points;
  existing.acceptanceCriteria = payload.acceptanceCriteria.map(item => item.trim());
  if (payload.status === 'todo' && existing.status !== 'todo') existing.priority = nextPriority(db);
  existing.priority = payload.priority || existing.priority;
  existing.status = payload.status || existing.status;
  existing.updatedAt = new Date().toISOString();
  writeDB(db);
  res.json(existing);
});

app.delete('/api/stories/:id', (req, res) => {
  const id = Number(req.params.id);
  const db = readDB();
  const idx = db.stories.findIndex(s=>s.id===id);
  if (idx===-1) return res.status(404).json({ error: 'Story not found' });
  db.stories.splice(idx,1);
  writeDB(db);
  res.status(204).end();
});

app.patch('/api/stories/:id/status', (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body || {};
  if (!['todo','doing','done'].includes(status)) return res.status(400).json({ error: 'Staatus peab olema todo, doing või done' });
  const db = readDB();
  const s = db.stories.find(x=>x.id===id);
  if (!s) return res.status(404).json({ error: 'Story not found' });
  if (status === 'todo' && s.status !== 'todo') s.priority = nextPriority(db);
  s.status = status;
  s.updatedAt = new Date().toISOString();
  writeDB(db);
  res.json(s);
});

app.patch('/api/stories/reorder', (req, res) => {
  // expects { order: [id1,id2,...] }
  const { order } = req.body || {};
  if (!Array.isArray(order)) return res.status(400).json({ error: 'Järjekord peab olema ID-de massiiv' });
  const db = readDB();
  const backlog = db.stories.filter(story => story.status === 'todo');
  if (order.length !== backlog.length || new Set(order).size !== order.length || order.some(id => !Number.isSafeInteger(id) || !backlog.some(story => story.id === id))) {
    return res.status(400).json({ error: 'Järjekord peab sisaldama kõiki backlogi ID-sid täpselt üks kord. Laadi laud uuesti.' });
  }
  // update priority based on array index
  order.forEach((id, idx) => {
    const s = db.stories.find(x=>x.id===id);
    if (s && s.priority !== idx + 1) {
      s.priority = idx + 1;
      s.updatedAt = new Date().toISOString();
    }
  });
  writeDB(db);
  res.json({ ok: true });
});

app.post('/api/stories/:id/comments', (req, res) => {
  const id = Number(req.params.id);
  const { text } = req.body || {};
  if (typeof text !== 'string' || !text.trim()) return res.status(400).json({ error: 'Kommentaar peab olema mittetühi tekst' });
  const db = readDB();
  const s = db.stories.find(x=>x.id===id);
  if (!s) return res.status(404).json({ error: 'Story not found' });
  const commentId = s.lastCommentId + 1;
  s.lastCommentId = commentId;
  const createdAt = new Date().toISOString();
  const comment = { id: commentId, text: text.trim(), createdAt };
  s.comments.push(comment);
  s.updatedAt = createdAt;
  writeDB(db);
  res.status(201).json(comment);
});

app.delete('/api/stories/:id/comments/:commentId', (req, res) => {
  const db = readDB();
  const story = db.stories.find(item => item.id === Number(req.params.id));
  if (!story) return res.status(404).json({ error: 'Story not found' });
  const index = story.comments.findIndex(comment => comment.id === Number(req.params.commentId));
  if (index === -1) return res.status(404).json({ error: 'Kommentaari ei leitud' });
  story.comments.splice(index, 1);
  story.updatedAt = new Date().toISOString();
  writeDB(db);
  res.status(204).end();
});

app.use('/api', (req, res) => res.status(404).json({ error: 'API aadressi ei leitud' }));
app.use((error, req, res, next) => {
  if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Päringu sisu peab olema korrektne JSON' });
  if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Päringu sisu on liiga suur' });
  console.error(error);
  res.status(500).json({ error: 'Andmete töötlemine ebaõnnestus. Proovi uuesti.' });
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log('Server running on port', PORT));
}
module.exports = app;
