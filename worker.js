import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import { spawn } from "child_process";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// DB
const adapter = new JSONFile("db.json");
const db = new Low(adapter);

async function initDB() {
  await db.read();
  if (!db.data) {
    db.data = { projects: [], tasks: [] };
    await db.write();
  }
}
await initDB();

// Render-safe python runner
async function runPython(projectId) {
  const projectPath = path.join(__dirname, "projects", projectId);
  const main = path.join(projectPath, "main.py");

  try {
    await fs.access(main);
  } catch {
    return { code: 2, out: "", err: "main.py missing" };
  }

  return new Promise((resolve) => {
    const p = spawn("python3", ["main.py"], { cwd: projectPath });

    let out = "";
    let err = "";

    p.stdout.on("data", d => out += d);
    p.stderr.on("data", d => err += d);

    p.on("close", code => resolve({ code, out, err }));
  });
}

async function processTask() {
  await db.read();
  const t = db.data.tasks.find(x => x.status === "queued");
  if (!t) return;

  t.status = "running";
  await db.write();

  const result = await runPython(t.projectId);

  t.status = result.code === 0 ? "done" : "failed";
  t.result = result;
  t.finishedAt = Date.now();

  await db.write();
}

setInterval(processTask, 1500);
console.log("Worker Running…");
