import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import { nanoid } from "nanoid";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";

// dirname fix
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Express config
const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static("public"));

// DB setup
const adapter = new JSONFile("db.json");
const db = new Low(adapter);

// Fix: Prevent "missing default data" error
async function initDB() {
  await db.read();
  if (!db.data) {
    db.data = { projects: [], tasks: [] };
    await db.write();
  }
}
await initDB();


// Create project
app.post("/api/projects", async (req, res) => {
  const { name } = req.body;
  await db.read();

  const id = nanoid();
  const project = {
    id,
    name,
    files: [],
    createdAt: Date.now()
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
  const project = db.data.projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: "not found" });
  res.json(project);
});

// Save file
app.post("/api/projects/:id/files", async (req, res) => {
  const projectId = req.params.id;
  const { path: filepath, content } = req.body;

  await db.read();
  const project = db.data.projects.find(p => p.id === projectId);

  if (!project) return res.status(404).json({ error: "project not found" });

  const exists = project.files.find(f => f.path === filepath);

  if (!exists) {
    project.files.push({
      path: filepath,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
  } else {
    exists.updatedAt = Date.now();
  }

  await db.write();

  const dir = path.join(__dirname, "projects", projectId);
  await fs.mkdir(path.dirname(path.join(dir, filepath)), { recursive: true });
  await fs.writeFile(path.join(dir, filepath), content || "", "utf8");

  res.json({ ok: true });
});

// Read file
app.get("/api/projects/:id/files/:fp(*)", async (req, res) => {
  const fp = req.params.fp;
  const target = path.join(__dirname, "projects", req.params.id, fp);

  try {
    const content = await fs.readFile(target, "utf8");
    res.json({ path: fp, content });
  } catch {
    res.status(404).json({ error: "file not found" });
  }
});

// Queue run task
app.post("/api/projects/:id/run", async (req, res) => {
  await db.read();

  const task = {
    id: nanoid(),
    projectId: req.params.id,
    status: "queued",
    createdAt: Date.now(),
    attempts: 0
  };

  db.data.tasks.push(task);
  await db.write();
  res.json(task);
});

// List tasks
app.get("/api/tasks", async (req, res) => {
  await db.read();
  res.json(db.data.tasks);
});

// Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("SERVER RUNNING ON PORT", PORT));
