const express = require('express');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');
const initSqlJs = require('sql.js');

const app     = express();
const PORT    = 3000;
const DB_FILE = process.env.DB_PATH || path.join(__dirname, 'scores.db');

app.use(cors());
app.use(express.json());

// ── Database bootstrap ───────────────────────────────────────────────────────

let db;

async function initDb() {
  const SQL = await initSqlJs();

  // Load existing file or create fresh
  if (fs.existsSync(DB_FILE)) {
    const data = fs.readFileSync(DB_FILE);
    db = new SQL.Database(data);
    console.log('Loaded existing database from', DB_FILE);
  } else {
    db = new SQL.Database();
    console.log('Created new database');
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS scores (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL,
      score      INTEGER NOT NULL,
      created_at TEXT    NOT NULL
    )
  `);

  saveDb(); // persist the schema immediately on first run
}

// Flush in-memory DB to disk after every write
function saveDb() {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  const data = db.export();
  fs.writeFileSync(DB_FILE, Buffer.from(data));
}

// ── Routes ───────────────────────────────────────────────────────────────────

// GET /scores  — fetch top 20 scores
app.get('/scores', (req, res) => {
  try {
    const result = db.exec(
      'SELECT id, name, score, created_at FROM scores ORDER BY score DESC LIMIT 20'
    );
    const rows = result.length
      ? result[0].values.map(([id, name, score, created_at]) => ({ id, name, score, created_at }))
      : [];
    res.json(rows);
  } catch (err) {
    console.error('GET /scores error:', err);
    res.status(500).json({ error: 'Failed to fetch scores' });
  }
});

// POST /scores  — save a new score  { name, score }
app.post('/scores', (req, res) => {
  const { name, score } = req.body;

  if (!name || typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ error: 'name is required' });
  }
  if (typeof score !== 'number' || score < 0 || !Number.isFinite(score)) {
    return res.status(400).json({ error: 'score must be a non-negative number' });
  }

  try {
    db.run(
      'INSERT INTO scores (name, score, created_at) VALUES (?, ?, ?)',
      [name.trim().slice(0, 50), Math.floor(score), new Date().toISOString()]
    );
    saveDb();

    // Return the inserted row
    const result = db.exec('SELECT last_insert_rowid() AS id');
    const id     = result[0].values[0][0];
    res.status(201).json({ id, name: name.trim(), score: Math.floor(score) });
  } catch (err) {
    console.error('POST /scores error:', err);
    res.status(500).json({ error: 'Failed to save score' });
  }
});

// DELETE /scores/:id  — remove a specific score
app.delete('/scores/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

  try {
    db.run('DELETE FROM scores WHERE id = ?', [id]);
    saveDb();
    res.json({ deleted: id });
  } catch (err) {
    console.error('DELETE /scores error:', err);
    res.status(500).json({ error: 'Failed to delete score' });
  }
});

// DELETE /scores  — wipe all scores
app.delete('/scores', (req, res) => {
  try {
    db.run('DELETE FROM scores');
    saveDb();
    res.json({ cleared: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear scores' });
  }
});

// ── Start ────────────────────────────────────────────────────────────────────

initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`\nTetris score API running at http://localhost:${PORT}`);
    console.log('  GET    /scores       — top 20 scores');
    console.log('  POST   /scores       — save { name, score }');
    console.log('  DELETE /scores/:id   — delete one score');
    console.log('  DELETE /scores       — clear all scores\n');
  });
});
