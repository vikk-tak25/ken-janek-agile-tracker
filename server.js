const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const DATA_DIR = path.join(__dirname, 'data');
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
  }
}

function readDB() {
  ensureData();
  const raw = fs.readFileSync(DB_FILE, 'utf8');
  return JSON.parse(raw);
}

function writeDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function validateStoryPayload(payload) {
  const errors = [];
  if (!payload.title || String(payload.title).trim() === '') errors.push('Pealkiri ei tohi olla tühi');
  if (payload.points === undefined || payload.points === null || String(payload.points).trim() === '') errors.push('Punktid ei tohi olla tühjad');
  if (!Number.isInteger(payload.points)) errors.push('Punktid peavad olema täisarv');
  if (payload.points < 0) errors.push('Punktid ei tohi olla negatiivsed');
  if (!payload.acceptanceCriteria || !Array.isArray(payload.acceptanceCriteria) || payload.acceptanceCriteria.length === 0) errors.push('Vähemalt üks vastuvõtutingimus on nõutud');
  return errors;
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
  const priority = payload.priority || (db.stories.length + 1);
  const story = {
    id,
    title: payload.title,
    description: payload.description || '',
    status: payload.status || 'todo',
    points: payload.points,
    priority,
    acceptanceCriteria: payload.acceptanceCriteria,
    comments: []
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
  existing.title = payload.title;
  existing.description = payload.description || '';
  existing.points = payload.points;
  existing.acceptanceCriteria = payload.acceptanceCriteria;
  existing.priority = payload.priority || existing.priority;
  existing.status = payload.status || existing.status;
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
  const { status } = req.body;
  if (!['todo','doing','done'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const db = readDB();
  const s = db.stories.find(x=>x.id===id);
  if (!s) return res.status(404).json({ error: 'Story not found' });
  s.status = status;
  writeDB(db);
  res.json(s);
});

app.patch('/api/stories/reorder', (req, res) => {
  // expects { order: [id1,id2,...] }
  const { order } = req.body;
  if (!Array.isArray(order)) return res.status(400).json({ error: 'Order array required' });
  const db = readDB();
  // update priority based on array index
  order.forEach((id, idx) => {
    const s = db.stories.find(x=>x.id===id);
    if (s) s.priority = idx + 1;
  });
  writeDB(db);
  res.json({ ok: true });
});

app.post('/api/stories/:id/comments', (req, res) => {
  const id = Number(req.params.id);
  const { text } = req.body;
  if (!text || String(text).trim()==='') return res.status(400).json({ error: 'Comment text required' });
  const db = readDB();
  const s = db.stories.find(x=>x.id===id);
  if (!s) return res.status(404).json({ error: 'Story not found' });
  const commentId = (s.comments.length? (s.comments[s.comments.length-1].id||0):0) + 1;
  const createdAt = new Date().toISOString();
  const comment = { id: commentId, text, createdAt };
  s.comments.push(comment);
  writeDB(db);
  res.status(201).json(comment);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server running on port', PORT));
