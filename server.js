import express from "express";
import cors from "cors";
import sqlite3 from "sqlite3";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "murmur-dev-secret";

const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new sqlite3.Database(path.join(dataDir, "murmur.db"));

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

function runSql(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) return reject(err);
      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function getSql(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function allSql(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function createToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: "7d" });
}

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: "Authentication required" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

function initDb() {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        mood TEXT NOT NULL,
        text TEXT NOT NULL,
        privacy TEXT NOT NULL DEFAULT 'private',
        share_with TEXT DEFAULT '[]',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS contacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);
  });
}

app.get("/api/health", (_, res) => {
  res.json({ ok: true, message: "Murmur API is running" });
});

app.post("/api/register", async (req, res) => {
  const { name, email, password } = req.body || {};

  if (!name || !email || !password) {
    return res.status(400).json({ message: "Name, email, and password are required" });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  if (password.length < 6) {
    return res.status(400).json({ message: "Password must be at least 6 characters" });
  }

  try {
    const existingUser = await getSql("SELECT id FROM users WHERE email = ?", [normalizedEmail]);
    if (existingUser) {
      return res.status(409).json({ message: "An account with that email already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await runSql(
      "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
      [name.trim(), normalizedEmail, passwordHash]
    );

    const user = await getSql("SELECT id, name, email, created_at FROM users WHERE id = ?", [result.id]);
    const token = createToken(user);

    res.status(201).json({ token, user });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ message: "Could not create account" });
  }
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  try {
    const user = await getSql("SELECT * FROM users WHERE email = ?", [String(email).trim().toLowerCase()]);
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const safeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      created_at: user.created_at
    };

    const token = createToken(safeUser);
    res.json({ token, user: safeUser });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Could not log in" });
  }
});

app.get("/api/me", requireAuth, async (req, res) => {
  try {
    const user = await getSql("SELECT id, name, email, created_at FROM users WHERE id = ?", [req.user.id]);
    res.json({ user });
  } catch (error) {
    res.status(500).json({ message: "Could not fetch profile" });
  }
});

app.get("/api/entries", requireAuth, async (req, res) => {
  try {
    const moodFilter = req.query.mood;
    let sql = "SELECT * FROM entries WHERE user_id = ? ORDER BY created_at DESC";
    const params = [req.user.id];

    if (moodFilter && moodFilter !== "all") {
      sql = "SELECT * FROM entries WHERE user_id = ? AND mood = ? ORDER BY created_at DESC";
      params.push(moodFilter);
    }

    const rows = await allSql(sql, params);
    const entries = rows.map((entry) => ({
      ...entry,
      share_with: JSON.parse(entry.share_with || "[]")
    }));

    res.json({ entries });
  } catch (error) {
    console.error("Fetch entries error:", error);
    res.status(500).json({ message: "Could not fetch entries" });
  }
});

app.post("/api/entries", requireAuth, async (req, res) => {
  const { mood, text, privacy, share_with = [] } = req.body || {};

  if (!mood || !text || !String(text).trim()) {
    return res.status(400).json({ message: "Mood and text are required" });
  }

  try {
    const trimmedText = String(text).trim();
    const privateMode = privacy === "shared" ? "shared" : "private";

    const result = await runSql(
      "INSERT INTO entries (user_id, mood, text, privacy, share_with) VALUES (?, ?, ?, ?, ?)",
      [req.user.id, mood, trimmedText, privateMode, JSON.stringify(Array.isArray(share_with) ? share_with : [])]
    );

    const entry = await getSql("SELECT * FROM entries WHERE id = ?", [result.id]);
    res.status(201).json({
      entry: {
        ...entry,
        share_with: JSON.parse(entry.share_with || "[]")
      }
    });
  } catch (error) {
    console.error("Create entry error:", error);
    res.status(500).json({ message: "Could not save murmur" });
  }
});

app.get("/api/contacts", requireAuth, async (req, res) => {
  try {
    const contacts = await allSql("SELECT * FROM contacts WHERE user_id = ? ORDER BY created_at DESC", [req.user.id]);
    res.json({ contacts });
  } catch (error) {
    res.status(500).json({ message: "Could not fetch contacts" });
  }
});

app.post("/api/contacts", requireAuth, async (req, res) => {
  const { name, email } = req.body || {};

  if (!name || !email) {
    return res.status(400).json({ message: "Contact name and email are required" });
  }

  try {
    const result = await runSql(
      "INSERT INTO contacts (user_id, name, email) VALUES (?, ?, ?)",
      [req.user.id, String(name).trim(), String(email).trim().toLowerCase()]
    );

    const contact = await getSql("SELECT * FROM contacts WHERE id = ?", [result.id]);
    res.status(201).json({ contact });
  } catch (error) {
    console.error("Create contact error:", error);
    res.status(500).json({ message: "Could not add contact" });
  }
});

app.get("/api/recap", requireAuth, async (req, res) => {
  try {
    const rows = await allSql(
      `SELECT * FROM entries WHERE user_id = ? AND created_at >= datetime('now', '-6 days') ORDER BY created_at DESC`,
      [req.user.id]
    );

    const entries = rows.map((entry) => ({
      ...entry,
      share_with: JSON.parse(entry.share_with || "[]")
    }));

    const moodCounts = entries.reduce((counts, entry) => {
      counts[entry.mood] = (counts[entry.mood] || 0) + 1;
      return counts;
    }, {});

    const topMood = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0];
    const sharedCount = entries.filter((entry) => entry.privacy === "shared").length;

    const dayLabels = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - index));
      return {
        key: date.toISOString().slice(0, 10),
        label: date.toLocaleDateString("en-US", { weekday: "short" })
      };
    });

    const dayCounts = dayLabels.map((day) => ({
      ...day,
      count: entries.filter((entry) => entry.created_at.startsWith(day.key)).length
    }));

    res.json({
      total: entries.length,
      shared: sharedCount,
      topMood: topMood ? { mood: topMood[0], count: topMood[1] } : null,
      dayCounts
    });
  } catch (error) {
    console.error("Recap error:", error);
    res.status(500).json({ message: "Could not generate recap" });
  }
});

app.get("/api/export", requireAuth, async (req, res) => {
  const type = (req.query.type || "json").toLowerCase();

  try {
    const entries = await allSql("SELECT * FROM entries WHERE user_id = ? ORDER BY created_at DESC", [req.user.id]);
    const data = entries.map((entry) => ({
      ...entry,
      share_with: JSON.parse(entry.share_with || "[]")
    }));

    if (type === "csv") {
      const rows = [
        ["id", "mood", "text", "privacy", "share_with", "created_at"],
        ...data.map((entry) => [
          entry.id,
          entry.mood,
          `"${String(entry.text).replace(/"/g, '""')}"`,
          entry.privacy,
          JSON.stringify(entry.share_with),
          entry.created_at
        ])
      ];

      const csv = rows.map((row) => row.join(",")).join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=murmur-export.csv");
      return res.send(csv);
    }

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", "attachment; filename=murmur-export.json");
    return res.send(JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Export error:", error);
    res.status(500).json({ message: "Could not export entries" });
  }
});

app.get("*", (_, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

initDb();

app.listen(PORT, () => {
  console.log(`Murmur server running at http://localhost:${PORT}`);
});
