import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import { nanoid } from "nanoid";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static("public"));

const adapter = new JSONFile("db.json");
const db = new Low(adapter);

async function initDB() {
  await db.read();
  db.data = db.data || { projects: [], tasks: [] };
  await db.write();
}
initDB();

// Create empty project
app.post("/api/projects", async (req, res) => {
  const { name } = req.body;

  await db.read();
  const id = nanoid();

  const project = {
    id,
    name,
    files: [],
    createdAt: Date.now(),
  };

  db.data.projects.push(project);
  await db.write();

  const dir = path.join(__dirname, "projects", id);
  await fs.mkdir(dir, { recursive: true });

  res.json(project);
});

// List projects
app.get("/api/projects", async (req, res) => {
  await db.read();
  res.json(db.data.projects);
});

// Get project
app.get("/api/projects/:id", async (req, res) => {
  await db.read();
  const p = db.data.projects.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: "not found" });
  res.json(p);
});

// Create / Update a file
app.post("/api/projects/:id/files", async (req, res) => {
  const projectId = req.params.id;
  const { path: filepath, content } = req.body;

  if (!filepath) return res.status(400).json({ error: "missing path" });

  await db.read();
  const p = db.data.projects.find((x) => x.id === projectId);

  if (!p) return res.status(404).json({ error: "project not found" });

  const existing = p.files.find((f) => f.path === filepath);

  if (!existing) {
    p.files.push({
      path: filepath,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  } else {
    existing.updatedAt = Date.now();
  }

  await db.write();

  const dir = path.join(__dirname, "projects", projectId);
  await fs.mkdir(path.dirname(path.join(dir, filepath)), { recursive: true });
  await fs.writeFile(path.join(dir, filepath), content || "", "utf8");

  res.json({ ok: true });
});

// Get file content
app.get("/api/projects/:id/files/:filePath(*)", async (req, res) => {
  const filePath = req.params.filePath;
  const file = path.join(__dirname, "projects", req.params.id, filePath);

  try {
    const content = await fs.readFile(file, "utf8");
    res.json({ path: filePath, content });
  } catch {
    res.status(404).json({ error: "file not found" });
  }
});

// Queue run
app.post("/api/projects/:id/run", async (req, res) => {
  const projectId = req.params.id;

  await db.read();
  const t = {
    id: nanoid(),
    projectId,
    type: "run",
    status: "queued",
    createdAt: Date.now(),
    attempts: 0,
  };

  db.data.tasks.push(t);
  await db.write();
  res.json(t);
});

// List tasks
app.get("/api/tasks", async (req, res) => {
  await db.read();
  res.json(db.data.tasks);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Server running on", PORT));
