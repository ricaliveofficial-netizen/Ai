// server.js (সম্ভবত আপনার আগের সার্ভারের উপরে যোগ করুন বা রিপ্লেস করুন সংশ্লিষ্ট অংশগুলো)
const express = require('express');
const bodyParser = require('body-parser');
const { Low, JSONFile } = require('lowdb');
const { nanoid } = require('nanoid');
const path = require('path');
const fs = require('fs').promises;
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

const adapter = new JSONFile('db.json');
const db = new Low(adapter);
(async()=>{ await db.read(); db.data = db.data || { projects: [], tasks: [] }; await db.write(); })();

// Create empty project (no files)
app.post('/api/projects', async (req, res) => {
  const { name } = req.body;
  await db.read();
  const id = nanoid();
  const project = { id, name, files: [], createdAt: Date.now() };
  db.data.projects.push(project);
  await db.write();
  const dir = path.join(__dirname,'projects', id);
  await fs.mkdir(dir, { recursive: true });
  res.json(project);
});

// List projects
app.get('/api/projects', async (req,res)=>{ await db.read(); res.json(db.data.projects); });

// Get project + files metadata
app.get('/api/projects/:id', async (req,res)=>{
  await db.read();
  const p = db.data.projects.find(x=>x.id===req.params.id);
  if(!p) return res.status(404).json({error:'not found'});
  res.json(p);
});

// Create or update a file in project
app.post('/api/projects/:id/files', async (req,res)=>{
  const projectId = req.params.id;
  const { path: filepath, content } = req.body; // filepath like "main.py" or "src/app.js"
  if (!filepath) return res.status(400).json({error:'missing path'});

  await db.read();
  const p = db.data.projects.find(x=>x.id===projectId);
  if(!p) return res.status(404).json({error:'project not found'});

  // update metadata in DB
  const existing = p.files.find(f=>f.path === filepath);
  if(!existing) p.files.push({ path: filepath, createdAt: Date.now(), updatedAt: Date.now() });
  else existing.updatedAt = Date.now();
  await db.write();

  // write to disk
  const dir = path.join(__dirname,'projects', projectId);
  await fs.mkdir(path.dirname(path.join(dir, filepath)), { recursive: true });
  await fs.writeFile(path.join(dir, filepath), content || '', 'utf8');

  res.json({ ok:true, path: filepath });
});

// Get file content
app.get('/api/projects/:id/files/:filePath(*)', async (req,res)=>{
  const projectId = req.params.id;
  const filePath = req.params.filePath;
  const fileOnDisk = path.join(__dirname,'projects', projectId, filePath);
  try {
    const content = await fs.readFile(fileOnDisk, 'utf8');
    res.json({ path: filePath, content });
  } catch(e) {
    res.status(404).json({ error: 'file not found' });
  }
});

// Run endpoint queues a task (unchanged)
app.post('/api/projects/:id/run', async (req,res)=>{
  const projectId = req.params.id;
  await db.read();
  const t = { id: nanoid(), projectId, type:'run', status:'queued', createdAt:Date.now(), attempts:0 };
  db.data.tasks.push(t);
  await db.write();
  res.json(t);
});

// tasks
app.get('/api/tasks', async (req,res)=>{ await db.read(); res.json(db.data.tasks); });

const PORT = 3000;
app.listen(PORT, ()=> console.log('Server running on', PORT));