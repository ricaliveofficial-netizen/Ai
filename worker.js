// ==============================
// FULL PRODUCTION-READY WORKER
// Supports: 
//  - Local: Docker sandbox
//  - Render: python3 fallback (no Docker)
// ==============================

const { Low, JSONFile } = require("lowdb");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs").promises;

const adapter = new JSONFile("db.json");
const db = new (require("lowdb").Low)(adapter);

// ==============================
// Helper: Run inside LOCAL docker sandbox
// ==============================
async function runWithDocker(projectId) {
  const projectPath = path.join(__dirname, "projects", projectId);

  return new Promise((resolve, reject) => {
    const p = spawn(
      "docker",
      [
        "run",
        "--rm",
        "--network",
        "none",
        "--memory",
        "128m",
        "--cpus",
        "0.5",
        "-v",
        `${projectPath}:/work`,
        "-w",
        "/work",
        "python:3.11",
        "python",
        "main.py",
      ],
      { timeout: 15000 }
    );

    let out = "";
    let err = "";

    p.stdout.on("data", (d) => (out += d.toString()));
    p.stderr.on("data", (d) => (err += d.toString()));

    p.on("close", (code) => resolve({ code, out, err }));
    p.on("error", (e) => reject(e));
  });
}

// ==============================
// Helper: Run on Render (no Docker)
// ==============================
async function runWithNativePython(projectId) {
  const projectPath = path.join(__dirname, "projects", projectId);
  return new Promise((resolve) => {
    const p = spawn("python3", ["main.py"], { cwd: projectPath });

    let out = "";
    let err = "";

    p.stdout.on("data", (d) => (out += d.toString()));
    p.stderr.on("data", (d) => (err += d.toString()));

    p.on("close", (code) => resolve({ code, out, err }));
  });
}

// ==============================
// Main runner: auto-select docker / native
// ==============================
async function runInSandbox(projectId) {
  const projectPath = path.join(__dirname, "projects", projectId);
  const mainFile = path.join(projectPath, "main.py");

  // Check entry
  try {
    await fs.access(mainFile);
  } catch {
    return { code: 2, out: "", err: "Error: main.py not found in project" };
  }

  const isRender = process.env.NODE_ENV === "production";

  // Render (no docker)
  if (isRender) {
    console.log("Worker: Running in Render fallback mode (python3)");
    return await runWithNativePython(projectId);
  }

  // Local docker mode
  console.log("Worker: Running in LOCAL docker sandbox");
  return await runWithDocker(projectId);
}

// ==============================
// Process ONE queued task
// ==============================
async function processOnce() {
  await db.read();
  db.data = db.data || { tasks: [], projects: [] };

  const task = db.data.tasks.find((t) => t.status === "queued");
  if (!task) return;

  task.status = "in-progress";
  task.startedAt = Date.now();
  await db.write();

  try {
    const result = await runInSandbox(task.projectId);

    task.result = result;
    task.finishedAt = Date.now();

    if (result.code === 0) {
      task.status = "done";
    } else {
      task.status = "failed";
    }
  } catch (e) {
    task.attempts = (task.attempts || 0) + 1;
    task.lastError = e.message;

    if (task.attempts >= 3) task.status = "failed";
    else task.status = "queued";
  }

  await db.write();
}

// ==============================
// Worker Loop
// ==============================
setInterval(() => {
  processOnce().catch(console.error);
}, 2000);

console.log("🔥 Worker started → watching tasks every 2 seconds...");