// ============================================
// AI Coding Agent - Frontend Application
// 3-Panel Layout: Editor | Preview | Chat
// AI writes code directly to Monaco editor
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
let previewTimeout = null;
let attachedFileData = null; // { name, content } for file attachment
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

    // Listen for changes -> update files state + auto-preview
    editor.onDidChangeModelContent(() => {
      files[currentFile] = editor.getValue();
      debouncedPreview();
    });

    // Initial preview
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

  let previewHtml = html;

  if (css) {
    const cssInjection = '<style>\n' + css + '\n</style>\n';
    previewHtml = previewHtml.replace('</head>', cssInjection + '</head>');
  }

  if (js) {
    const jsInjection = '<script>\n' + js + '\n<\/script>\n';
    previewHtml = previewHtml.replace('</body>', jsInjection + '</body>');
  }

  const frame = document.getElementById('preview-frame');
  if (frame) {
    frame.srcdoc = previewHtml;
  }
}

function debouncedPreview() {
  clearTimeout(previewTimeout);
  previewTimeout = setTimeout(updatePreview, 300);
}
// ===== CHAT UTILITIES =====

function formatMessage(text) {
  let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  html = html.replace(/```(\w*)\s*([\s\S]*?)```/g, (match, lang, code) => {
    const langClass = lang ? ' class="language-' + lang + '"' : '';
    return '<pre><code' + langClass + '>' + code.trim() + '</code></pre>';
  });
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\n/g, '<br>');
  return html;
}

function addMessage(role, content) {
  const messagesDiv = document.getElementById('chatMessages');
  const msgDiv = document.createElement('div');
  msgDiv.className = 'message ' + role;

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.innerHTML = formatMessage(content);

  msgDiv.appendChild(bubble);
  messagesDiv.appendChild(msgDiv);
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
// ===== CODE EXTRACTION & EDITOR UPDATES =====

function parseCodeBlocksAndUpdateEditor(fullContent) {
  const patterns = [
    { lang: 'html', file: 'index.html', regex: /```html\s*([\s\S]*?)```/gi },
    { lang: 'css', file: 'style.css', regex: /```css\s*([\s\S]*?)```/gi },
    { lang: 'js', file: 'app.js', regex: /```(?:js|javascript)\s*([\s\S]*?)```/gi },
  ];

  let updatedFiles = [];
  let cleanedContent = fullContent;

  for (const pattern of patterns) {
    pattern.regex.lastIndex = 0;
    const match = pattern.regex.exec(fullContent);
    if (match) {
      const code = match[1].trim();
      if (code) {
        files[pattern.file] = code;
        updatedFiles.push(pattern.file);
        cleanedContent = cleanedContent.replace(match[0], '');
      }
    }
  }

  if (updatedFiles.length > 0) {
    if (editor && updatedFiles.includes(currentFile)) {
      editor.setValue(files[currentFile]);
    } else if (editor && updatedFiles.length > 0) {
      switchFile(updatedFiles[0]);
    }
    updatePreview();
    return { updated: true, updatedFiles: updatedFiles, cleanedContent: cleanedContent.trim() };
  }

  return { updated: false, updatedFiles: [], cleanedContent: fullContent };
}

async function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const message = input.value.trim();
  if (!message || isStreaming) return;

  let fullMessage = message;
  if (attachedFileData) {
    fullMessage = '[Attached file: ' + attachedFileData.name + ']\n```\n' + attachedFileData.content + '\n```\n\n' + message;
    clearAttachedFile();
  }

  input.value = '';
  isStreaming = true;

  addMessage('user', fullMessage);
  showTypingIndicator();
  chatHistory.push({ role: 'user', content: fullMessage });

  const model = document.getElementById('modelSelect').value;

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: 'You are an expert AI coding assistant that builds complete websites and web apps. Your PRIMARY job is to write code that goes DIRECTLY into the user\'s editor tabs.\n\nCRITICAL RULES:\n1. When the user asks you to build or modify something, ALWAYS output the COMPLETE code using these code blocks:\n   - ```html for HTML files (goes to index.html tab)\n   - ```css for CSS files (goes to style.css tab)\n   - ```js or ```javascript for JavaScript files (goes to app.js tab)\n2. NEVER just explain how to do something — WRITE THE CODE and output it in the code blocks.\n3. If you need to modify multiple files, output multiple code blocks (one for each file type).\n4. Always write COMPLETE, working code. Not snippets. Not examples. Full files.\n5. After the code blocks, you can add a brief explanation if needed, but the CODE comes FIRST.\n\nExample response format:\n```html\n<!DOCTYPE html>\n<html>\n...complete HTML...</html>\n```\n\n```css\n/* Complete CSS */\n```\n\n```js\n// Complete JavaScript\n```\n\nNow go build something amazing!' },
          ...chatHistory
        ]
      })
    });

    hideTypingIndicator();

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

    const result = parseCodeBlocksAndUpdateEditor(fullContent);

    if (result.updated) {
      const noticeDiv = document.createElement('div');
      noticeDiv.className = 'code-update-notice';
      noticeDiv.textContent = "🧙‍♂️ I've updated your code! Check the editor.";
      bubble.appendChild(noticeDiv);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
      chatHistory.push({ role: 'assistant', content: result.cleanedContent || '(Code was written to editor)' });
    } else {
      chatHistory.push({ role: 'assistant', content: fullContent });
    }
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

    const fullContent = data.fullContent || data.response || '';
    const result = parseCodeBlocksAndUpdateEditor(fullContent);

    if (result.updated) {
      addMessage('ai', '✅ Project built successfully! The code has been written to the editor tabs.');
      addMessage('ai', '📁 Updated: ' + result.updatedFiles.join(', '));
    } else if (data.html || data.css || data.js) {
      if (data.html) files['index.html'] = data.html;
      if (data.css) files['style.css'] = data.css;
      if (data.js) files['app.js'] = data.js;

      if (currentFile !== 'index.html') {
        switchFile('index.html');
      } else if (editor) {
        editor.setValue(files[currentFile]);
      }
      updatePreview();
      addMessage('ai', '✅ Project built successfully! Check the preview.');
    } else {
      addMessage('ai', fullContent || '⚠️ No code was generated. Please try a more specific prompt.');
    }
  } catch (err) {
    addMessage('ai', '⚠️ Build failed: ' + err.message);
  } finally {
    buildBtn.textContent = '🤖 Build This';
    buildBtn.disabled = false;
  }
}

// ===== FILE ATTACHMENT =====
function setupFileUpload() {
  const attachBtn = document.getElementById('attachBtn');
  
  attachBtn.addEventListener('click', () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.html,.css,.js,.txt,.json,.md,.png,.jpg,.jpeg,.gif,.svg';
    fileInput.multiple = false;
    
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      const reader = new FileReader();
      
      if (file.type.startsWith('image/')) {
        reader.onload = (event) => {
          const dataUrl = event.target.result;
          const markdown = '![' + file.name + '](' + dataUrl + ')';
          insertIntoChatInput(markdown);
          showFileBadge(file.name);
        };
        reader.readAsDataURL(file);
      } else {
        reader.onload = (event) => {
          const content = event.target.result;
          attachedFileData = { name: file.name, content: content };
          showFileBadge(file.name);
        };
        reader.readAsText(file);
      }
    });
    
    fileInput.click();
  });
}

function showFileBadge(fileName) {
  const existingBadge = document.querySelector('.file-attach-badge');
  if (existingBadge) existingBadge.remove();
  
  const inputArea = document.getElementById('chatInputArea');
  const badge = document.createElement('div');
  badge.className = 'file-attach-badge';
  badge.innerHTML = '📎 ' + escapeHtml(fileName) + ' <span class="remove-attach" title="Remove file">✕</span>';
  
  inputArea.insertBefore(badge, inputArea.querySelector('#chatInput'));
  
  badge.querySelector('.remove-attach').addEventListener('click', () => {
    badge.remove();
    attachedFileData = null;
  });
}

function clearAttachedFile() {
  attachedFileData = null;
  const badge = document.querySelector('.file-attach-badge');
  if (badge) badge.remove();
}

function insertIntoChatInput(text) {
  const input = document.getElementById('chatInput');
  const cursorPos = input.selectionStart;
  const before = input.value.substring(0, cursorPos);
  const after = input.value.substring(cursorPos);
  input.value = before + text + after;
  input.focus();
  input.selectionStart = input.selectionEnd = cursorPos + text.length;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
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
  if (e.ctrlKey && e.key === 'Enter') {
    e.preventDefault();
    if (editor) files[currentFile] = editor.getValue();
    updatePreview();
  }
  if (e.key === 'Enter' && !e.shiftKey) {
    const active = document.activeElement;
    if (active && active.id === 'chatInput') {
      e.preventDefault();
      sendChatMessage();
    }
  }
});

// ===== WINDOW RESIZE =====
window.addEventListener('resize', () => {
  if (editor) editor.layout();
});

// ===== EVENT BINDING =====
document.addEventListener('DOMContentLoaded', () => {
  initEditor();
  loadModels();

  document.querySelectorAll('.file-tab').forEach(tab => {
    tab.addEventListener('click', () => switchFile(tab.dataset.file));
  });

  document.getElementById('previewBtn').addEventListener('click', () => {
    if (editor) files[currentFile] = editor.getValue();
    updatePreview();
  });

  document.getElementById('sendChatBtn').addEventListener('click', sendChatMessage);

  document.getElementById('buildBtn').addEventListener('click', buildProject);
  document.getElementById('buildPrompt').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); buildProject(); }
  });

  setupFileUpload();
});