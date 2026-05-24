const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn, execSync } = require('child_process');
const vm = require('vm');

const app = express();
const PORT = 3001;
const OLLAMA_HOST = '127.0.0.1';
const OLLAMA_PORT = 11434;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 1. LIST MODELS
app.get('/api/models', (req, res) => {
  const ollama = spawn('ollama', ['list'], { shell: true });
  let output = '';
  let error = '';
  ollama.stdout.on('data', (data) => { output += data.toString(); });
  ollama.stderr.on('data', (data) => { error += data.toString(); });
  ollama.on('close', (code) => {
    if (code !== 0) return res.json({ models: [], error: error || 'Ollama not running' });
    const lines = output.trim().split('\n').filter(l => l.trim());
    const models = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(/\s+/);
      if (parts.length >= 1) models.push(parts[0]);
    }
    res.json({ models });
  });
});

// 2. CHAT (streaming)
app.post('/api/chat', (req, res) => {
  const { model, messages } = req.body;
  if (!model || !messages) return res.status(400).json({ error: 'Model and messages required' });

  const payload = JSON.stringify({ model, messages, stream: true });
  const options = {
    hostname: OLLAMA_HOST, port: OLLAMA_PORT, path: '/api/chat',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
  };

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const reqOllama = http.request(options, (ollamaRes) => {
    ollamaRes.on('data', (chunk) => {
      const lines = chunk.toString().split('\n').filter(l => l.trim());
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.message && parsed.message.content)
            res.write(`data: ${JSON.stringify({ content: parsed.message.content })}\n\n`);
          if (parsed.done) { res.write(`data: ${JSON.stringify({ done: true })}\n\n`); res.end(); }
        } catch (e) {}
      }
    });
    ollamaRes.on('error', (err) => {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    });
  });
  reqOllama.on('error', (err) => {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  });
  reqOllama.write(payload);
  reqOllama.end();
});

// 3. EXECUTE (sandboxed)
app.post('/api/execute', (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Code is required' });

  try {
    const sandbox = {
      console: {
        logs: [],
        log: (...args) => sandbox.console.logs.push(args.map(String).join(' ')),
        error: (...args) => sandbox.console.logs.push('ERROR: ' + args.map(String).join(' ')),
        warn: (...args) => sandbox.console.logs.push('WARN: ' + args.map(String).join(' ')),
      },
      setTimeout: (fn) => { if (typeof fn === 'function') try { fn(); } catch(e) {} },
      Math, JSON, Date, Array, Object, String, Number, Boolean, RegExp, Map, Set,
      Promise, parseInt, parseFloat, isNaN, isFinite,
    };

    const context = vm.createContext(sandbox);
    const startTime = Date.now();
    new vm.Script(code).runInContext(context, { timeout: 5000 });
    const endTime = Date.now();

    let result = sandbox.console.logs.join('\n');
    if (!result && code.trim()) {
      try {
        const evalResult = new vm.Script(code).runInContext(context, { timeout: 5000 });
        if (evalResult !== undefined) result = String(evalResult);
      } catch (e) { result = sandbox.console.logs.join('\n'); }
    }

    res.json({ output: result || '(no output)', executionTime: endTime - startTime });
  } catch (err) {
    res.json({ output: `ERROR: ${err.message}`, executionTime: 0 });
  }
});

// 4. GENERATE PROJECT
app.post('/api/generate', (req, res) => {
  const { model, prompt } = req.body;
  if (!model || !prompt) return res.status(400).json({ error: 'Model and prompt required' });

  const systemPrompt = {
    role: 'system',
    content: `You are an expert web developer. Generate a complete website with HTML, CSS, and JavaScript.

Output your response with three code blocks:
\`\`\`html
... your HTML code here ...
\`\`\`
\`\`\`css
... your CSS code here ...
\`\`\`
\`\`\`js
... your JavaScript code here ...
\`\`\`

Make the website beautiful, functional, and complete. Include at minimum:
- A valid HTML document with a <style> tag is fine, but also output CSS separately
- Styled with modern CSS (dark theme, responsive)
- Interactive JavaScript functionality

The HTML should include <link rel="stylesheet" href="style.css"> and <script src="app.js"></script>.`
  };

  const payload = JSON.stringify({
    model,
    messages: [systemPrompt, { role: 'user', content: prompt }],
    stream: false
  });

  const options = {
    hostname: OLLAMA_HOST, port: OLLAMA_PORT, path: '/api/chat',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
  };

  const reqOllama = http.request(options, (ollamaRes) => {
    let data = '';
    ollamaRes.on('data', (chunk) => { data += chunk.toString(); });
    ollamaRes.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        const content = parsed.message?.content || '';

        const htmlMatch = content.match(/```html\s*([\s\S]*?)```/);
        const cssMatch = content.match(/```css\s*([\s\S]*?)```/);
        const jsMatch = content.match(/```js\s*([\s\S]*?)```/);

        const html = htmlMatch ? htmlMatch[1].trim() : '';
        const css = cssMatch ? cssMatch[1].trim() : '';
        const js = jsMatch ? jsMatch[1].trim() : '';

        res.json({ html, css, js, fullContent: content });
      } catch (err) {
        res.status(500).json({ error: 'Failed to parse AI response: ' + err.message });
      }
    });
  });
  reqOllama.on('error', (err) => {
    res.status(500).json({ error: 'Ollama request failed: ' + err.message });
  });
  reqOllama.write(payload);
  reqOllama.end();
});
// ===== PROJECTS DIRECTORY =====
const PROJECTS_DIR = path.join(__dirname, 'projects');
if (!fs.existsSync(PROJECTS_DIR)) fs.mkdirSync(PROJECTS_DIR, { recursive: true });

// ===== GIT INTEGRATION =====

// Git Status
app.post('/api/git/status', (req, res) => {
  try {
    const status = execSync('git status --short', { cwd: __dirname, encoding: 'utf8' }).trim();
    const branch = execSync('git branch --show-current', { cwd: __dirname, encoding: 'utf8' }).trim();
    const log = execSync('git log --oneline -10', { cwd: __dirname, encoding: 'utf8' }).trim();
    const ahead = execSync('git rev-list --count @{u}..HEAD -- 2>nul || echo 0', { cwd: __dirname, encoding: 'utf8' }).trim();
    res.json({ status, branch, log, ahead: parseInt(ahead) || 0 });
  } catch (e) {
    res.json({ status: '', branch: 'none', log: '', ahead: 0, error: 'Not a git repository or git not available' });
  }
});

// Git Commit
app.post('/api/git/commit', (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Commit message required' });
  try {
    execSync('git add -A', { cwd: __dirname, encoding: 'utf8' });
    execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { cwd: __dirname, encoding: 'utf8' });
    res.json({ success: true });
  } catch (e) {
    res.json({ error: e.message });
  }
});

// Git Push
app.post('/api/git/push', (req, res) => {
  try {
    const result = execSync('git push', { cwd: __dirname, encoding: 'utf8', timeout: 30000 }).trim();
    res.json({ success: true, output: result });
  } catch (e) {
    res.json({ error: e.stdout || e.message });
  }
});

// Git Log
app.post('/api/git/log', (req, res) => {
  try {
    const log = execSync('git log --oneline --graph --decorate -20', { cwd: __dirname, encoding: 'utf8' }).trim();
    res.json({ log });
  } catch (e) {
    res.json({ log: '', error: e.message });
  }
});

// ===== PROJECT MANAGEMENT =====

// Project Save
app.post('/api/project/save', (req, res) => {
  const { name, files } = req.body;
  if (!name || !files) return res.status(400).json({ error: 'Name and files required' });
  
  const projectDir = path.join(PROJECTS_DIR, name.replace(/[^a-zA-Z0-9-_]/g, '_'));
  if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir, { recursive: true });
  
  for (const [filename, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(projectDir, filename), content, 'utf8');
  }
  
  res.json({ success: true, path: projectDir });
});

// Project Load
app.post('/api/project/load', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  
  const projectDir = path.join(PROJECTS_DIR, name);
  if (!fs.existsSync(projectDir)) return res.status(404).json({ error: 'Project not found' });
  
  const files = {};
  const entries = fs.readdirSync(projectDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile()) {
      files[entry.name] = fs.readFileSync(path.join(projectDir, entry.name), 'utf8');
    }
  }
  
  res.json({ success: true, name, files });
});

// Project List
app.get('/api/project/list', (req, res) => {
  if (!fs.existsSync(PROJECTS_DIR)) return res.json({ projects: [] });
  const projects = fs.readdirSync(PROJECTS_DIR).filter(f => {
    return fs.statSync(path.join(PROJECTS_DIR, f)).isDirectory();
  });
  res.json({ projects });
});

// Export Files
app.post('/api/project/export', (req, res) => {
  const { files } = req.body;
  if (!files) return res.status(400).json({ error: 'Files required' });
  res.json({ success: true, files });
});

// PRE-WARM
function prewarmModel() {
  const preferredModel = 'qwen2.5-coder:7b';
  console.log('🔄 Pre-warming ' + preferredModel + '...');
  const payload = JSON.stringify({
    model: preferredModel,
    messages: [{ role: 'user', content: 'hello' }],
    stream: false
  });
  const options = {
    hostname: OLLAMA_HOST, port: OLLAMA_PORT, path: '/api/chat',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
  };
  const req = http.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => { console.log('✅ ' + preferredModel + ' ready!'); });
  });
  req.on('error', () => {});
  req.write(payload);
  req.end();
}

// START
app.listen(PORT, () => {
  console.log('🚀 AI Coding Agent running!');
  console.log('📍 http://localhost:' + PORT);
  setTimeout(prewarmModel, 1000);
});