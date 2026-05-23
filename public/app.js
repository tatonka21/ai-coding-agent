// ============================================
// AI Coding Agent - Frontend Application
// ============================================

// ===== STATE =====
const files = {
  'index.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="style.css">
  <title>AI Built App</title>
</head>
<body>
  <div id="app-root">
    <h1>Welcome to AI Coding Agent</h1>
    <p>Start building your web app!</p>
    <button id="clickBtn">Click Me</button>
    <p id="output"></p>
  </div>
  <script src="app.js"><\/script>
</body>
</html>`,
  'style.css': `/* Default Styles */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: 'Segoe UI', Tahoma, sans-serif;
  background: linear-gradient(135deg, #0f0c29, #302b63, #24243e);
  color: #e0e0e0;
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
}

#app-root {
  text-align: center;
  padding: 40px;
  background: rgba(255,255,255,0.05);
  border-radius: 16px;
  backdrop-filter: blur(10px);
  box-shadow: 0 8px 32px rgba(0,0,0,0.3);
}

h1 {
  font-size: 2.5rem;
  margin-bottom: 16px;
  background: linear-gradient(90deg, #667eea, #764ba2);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

p {
  font-size: 1.1rem;
  margin-bottom: 20px;
  color: #b0b0b0;
}

button {
  background: linear-gradient(90deg, #667eea, #764ba2);
  color: white;
  border: none;
  padding: 12px 32px;
  border-radius: 8px;
  font-size: 16px;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}

button:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 20px rgba(102, 126, 234, 0.4);
}

#output {
  margin-top: 20px;
  font-size: 1.2rem;
  min-height: 30px;
}`,
  'app.js': `// Default App Script
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('clickBtn');
  const output = document.getElementById('output');
  
  if (btn && output) {
    btn.addEventListener('click', () => {
      output.textContent = '🎉 Hello from AI Coding Agent!';
    });
  }
});`
};

let currentFile = 'index.html';
let editor = null;
let chatHistory = [];
let isStreaming = false;
let previewTimeout;

// ===== MONACO EDITOR SETUP =====
function initEditor() {
  require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' } });

  require(['vs/editor/editor.main'], function () {
    // Define custom dark theme
    monaco.editor.defineTheme('codingAgentDark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
        { token: 'keyword', foreground: '569CD6' },
        { token: 'string', foreground: 'CE9178' },
        { token: 'number', foreground: 'B5CEA8' },
        { token: 'tag', foreground: '569CD6' },
        { token: 'attribute.name', foreground: '9CDCFE' },
        { token: 'attribute.value', foreground: 'CE9178' },
        { token: 'delimiter', foreground: '808080' },
      ],
      colors: {
        'editor.background': '#0a0e1a',
        'editor.foreground': '#d4d4d4',
        'editor.lineHighlightBackground': '#1a1f2e',
        'editor.selectionBackground': '#264f78',
        'editor.inactiveSelectionBackground': '#3a3d41',
        'editorCursor.foreground': '#569CD6',
        'editorLineNumber.foreground': '#858585',
        'editorLineNumber.activeForeground': '#c6c6c6',
        'editor.selectionHighlightBackground': '#add6ff26',
        'editorBracketMatch.background': '#0d3a58',
        'editorBracketMatch.border': '#569CD6',
      }
    });

    // Get language from file extension
    function getLanguage(filename) {
      if (filename.endsWith('.html')) return 'html';
      if (filename.endsWith('.css')) return 'css';
      if (filename.endsWith('.js')) return 'javascript';
      return 'plaintext';
    }

    // Create editor
    editor = monaco.editor.create(document.getElementById('editor-container'), {
      value: files[currentFile],
      language: getLanguage(currentFile),
      theme: 'codingAgentDark',
      fontSize: 14,
      fontFamily: "'Consolas', 'Courier New', monospace",
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      automaticLayout: true,
      tabSize: 2,
      wordWrap: 'on',
      lineNumbers: 'on',
      renderWhitespace: 'selection',
      bracketPairColorization: { enabled: true },
      padding: { top: 8 },
    });

    // Listen for changes
    editor.onDidChangeModelContent(() => {
      files[currentFile] = editor.getValue();
      debouncedPreview();
    });

    // Init preview
    updatePreview();
  });
}
function switchFile(filename) {
  if (editor) {
    files[currentFile] = editor.getValue();
  }

  currentFile = filename;

  // Update tab UI
  document.querySelectorAll('.file-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.file === filename);
  });

  // Update editor
  if (editor) {
    const lang = filename.endsWith('.html') ? 'html'
      : filename.endsWith('.css') ? 'css'
      : 'javascript';
    const model = editor.getModel();
    monaco.editor.setModelLanguage(model, lang);
    editor.setValue(files[filename]);
  }
}

// ===== LIVE PREVIEW =====
function updatePreview() {
  const html = files['index.html'];
  const css = files['style.css'];
  const js = files['app.js'];

  // Inject CSS and JS into the HTML for preview
  let previewHtml = html;

  // Replace external references with inline content
  // Inject CSS before closing </head>
  if (css) {
    const cssInjection = '<style>\n' + css + '\n</style>\n';
    previewHtml = previewHtml.replace('</head>', cssInjection + '</head>');
  }

  // Inject JS before closing </body>
  if (js) {
    const jsInjection = '<script>\n' + js + '\n<\/script>\n';
    previewHtml = previewHtml.replace('</body>', jsInjection + '</body>');
  }

  const frame = document.getElementById('preview-frame');
  if (frame) {
    frame.srcdoc = previewHtml;
  }
}

// Debounce preview updates
function debouncedPreview() {
  clearTimeout(previewTimeout);
  previewTimeout = setTimeout(updatePreview, 300);
}

// ===== AI CHAT =====

function formatMessage(text) {
  // Escape HTML first
  let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Replace code blocks with syntax highlighting
  html = html.replace(/```(\w*)\s*([\s\S]*?)```/g, (match, lang, code) => {
    const langClass = lang ? ` class="language-${lang}"` : '';
    return `<pre><code${langClass}>${code.trim()}</code></pre>`;
  });

  // Replace inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Replace newlines with <br>
  html = html.replace(/\n/g, '<br>');

  return html;
}

function addMessage(role, content) {
  const messagesDiv = document.getElementById('chatMessages');
  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${role}`;

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.innerHTML = formatMessage(content);

  msgDiv.appendChild(bubble);
  messagesDiv.appendChild(msgDiv);

  // Scroll to bottom
  messagesDiv.scrollTop = messagesDiv.scrollHeight;

  return { div: msgDiv, bubble };
}

function showTypingIndicator() {
  const messagesDiv = document.getElementById('chatMessages');
  const indicator = document.createElement('div');
  indicator.className = 'message ai typing-wrapper';
  indicator.id = 'typingIndicator';

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';

  indicator.appendChild(bubble);
  messagesDiv.appendChild(indicator);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function hideTypingIndicator() {
  const indicator = document.getElementById('typingIndicator');
  if (indicator) indicator.remove();
}

async function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const message = input.value.trim();
  if (!message || isStreaming) return;

  input.value = '';
  isStreaming = true;

  // Add user message to chat
  addMessage('user', message);

  // Show typing indicator
  showTypingIndicator();

  // Add to history
  chatHistory.push({ role: 'user', content: message });

  const model = document.getElementById('modelSelect').value;

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [
        { role: 'system', content: 'You are a helpful AI coding assistant. Help the user write code.' },
        ...chatHistory
      ]})
    });

    hideTypingIndicator();

    // Create AI message container
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message ai';

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    msgDiv.appendChild(bubble);

    const messagesDiv = document.getElementById('chatMessages');
    messagesDiv.appendChild(msgDiv);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(l => l.trim());

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.content) {
              fullContent += data.content;
              bubble.innerHTML = formatMessage(fullContent);
              messagesDiv.scrollTop = messagesDiv.scrollHeight;
            }
            if (data.done) break;
          } catch (e) {}
        }
      }
    }

    chatHistory.push({ role: 'assistant', content: fullContent });
  } catch (err) {
    hideTypingIndicator();
    addMessage('ai', '⚠️ Error: Failed to connect to AI. Is Ollama running?');
  }

  isStreaming = false;
}

// ===== BUILD PROJECT =====
async function buildProject() {
  const input = document.getElementById('buildPrompt');
  const prompt = input.value.trim();
  if (!prompt) return;

  const model = document.getElementById('modelSelect').value;
  const buildBtn = document.getElementById('buildBtn');
  buildBtn.textContent = '⏳ Building...';
  buildBtn.disabled = true;

  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt })
    });

    const data = await response.json();

    if (data.error) {
      addMessage('ai', '⚠️ ' + data.error);
      return;
    }

    // Update files with generated content
    if (data.html) files['index.html'] = data.html;
    if (data.css) files['style.css'] = data.css;
    if (data.js) files['app.js'] = data.js;

    // Switch to HTML tab if building fresh
    if (currentFile !== 'index.html') {
      switchFile('index.html');
    } else if (editor) {
      editor.setValue(files[currentFile]);
    }

    updatePreview();
    addMessage('ai', '✅ Project built successfully! Check the preview below.');

    // Show what was generated in chat
    const contentDiv = document.createElement('div');
    contentDiv.innerHTML = formatMessage(data.fullContent || '');
    // Just reference it
    addMessage('ai', 'The generated files have been loaded into the editor tabs above.');
  } catch (err) {
    addMessage('ai', '⚠️ Build failed: ' + err.message);
  } finally {
    buildBtn.textContent = '🤖 Build This';
    buildBtn.disabled = false;
  }
}

// ===== EXPORT PROJECT =====
function exportProject() {
  // Save current editor content
  if (editor) files[currentFile] = editor.getValue();

  const project = {
    name: 'AI-Generated Project',
    version: '1.0.0',
    files: {
      'index.html': files['index.html'],
      'style.css': files['style.css'],
      'app.js': files['app.js']
    },
    exportedAt: new Date().toISOString()
  };

  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ai-project.json';
  a.click();
  URL.revokeObjectURL(url);
}

// ===== LOAD MODELS =====
async function loadModels() {
  const select = document.getElementById('modelSelect');
  const status = document.getElementById('statusIndicator');

  try {
    status.className = 'status-loading';
    status.textContent = '● Loading...';

    const res = await fetch('/api/models');
    const data = await res.json();

    if (data.models && data.models.length > 0) {
      select.innerHTML = '';
      data.models.forEach(model => {
        const opt = document.createElement('option');
        opt.value = model;
        opt.textContent = model;
        select.appendChild(opt);
      });
      status.className = 'status-online';
      status.textContent = '● Online';
    } else {
      status.className = 'status-offline';
      status.textContent = '● Offline';
    }
  } catch (err) {
    status.className = 'status-offline';
    status.textContent = '● Offline';
  }
}

// ===== KEYBOARD SHORTCUTS =====
document.addEventListener('keydown', (e) => {
  // Ctrl+Enter: Run preview
  if (e.ctrlKey && e.key === 'Enter') {
    e.preventDefault();
    if (editor) files[currentFile] = editor.getValue();
    updatePreview();
  }
  // Ctrl+B: Build project
  if (e.ctrlKey && e.key === 'b') {
    e.preventDefault();
    buildProject();
  }
  // Enter in chat input (without shift): Send
  if (e.key === 'Enter' && !e.shiftKey) {
    const active = document.activeElement;
    if (active && active.id === 'chatInput') {
      e.preventDefault();
      sendChatMessage();
    }
  }
});

// ===== WINDOW RESIZE HANDLER =====
window.addEventListener('resize', () => {
  if (editor) editor.layout();
});

// ===== EVENT BINDING =====
document.addEventListener('DOMContentLoaded', () => {
  // Init editor
  initEditor();

  // Load available models
  loadModels();

  // File tab switching
  document.querySelectorAll('.file-tab').forEach(tab => {
    tab.addEventListener('click', () => switchFile(tab.dataset.file));
  });

  // Send chat message
  document.getElementById('sendChatBtn').addEventListener('click', sendChatMessage);

  // Run button (preview header)
  document.getElementById('runBtn').addEventListener('click', () => {
    if (editor) files[currentFile] = editor.getValue();
    updatePreview();
  });

  // Run button (footer)
  const runBtnFooter = document.getElementById('runBtnFooter');
  if (runBtnFooter) {
    runBtnFooter.addEventListener('click', () => {
      if (editor) files[currentFile] = editor.getValue();
      updatePreview();
    });
  }

  // Build button
  document.getElementById('buildBtn').addEventListener('click', buildProject);

  // Build prompt: Enter to build
  document.getElementById('buildPrompt').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      buildProject();
    }
  });

  // Export button
  document.getElementById('exportBtn').addEventListener('click', exportProject);
});