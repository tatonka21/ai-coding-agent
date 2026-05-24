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

// ===== FILE TREE STATE =====
let fileTreeItems = [
  { name: 'index.html', icon: '📄', language: 'html' },
  { name: 'style.css', icon: '🎨', language: 'css' },
  { name: 'app.js', icon: '⚡', language: 'javascript' }
];
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

  // Update sidebar active state
  document.querySelectorAll('.file-tree-item').forEach(item => {
    item.classList.toggle('active', item.dataset.filename === filename);
  });

  // Update editor
  if (editor) {
    const lang = getFileLanguage(filename);
    const model = editor.getModel();
    monaco.editor.setModelLanguage(model, lang);
    editor.setValue(files[filename]);
  }

  // Sync file tree and tabs
  renderFileTree();
  renderFileTabs();
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
  var patterns = [
    { lang: 'html', file: 'index.html', regex: /```html\s*([\s\S]*?)```/gi },
    { lang: 'css', file: 'style.css', regex: /```css\s*([\s\S]*?)```/gi },
    { lang: 'js', file: 'app.js', regex: /```(?:js|javascript)\s*([\s\S]*?)```/gi },
  ];

  // Add dynamic patterns for files not covered by standard ones
  fileTreeItems.forEach(function(item) {
    if (['index.html', 'style.css', 'app.js'].indexOf(item.name) === -1) {
      var escapedName = item.name.replace(/[.*+?^${}()|[\]\\]/g, '\$&');
      var namePattern = new RegExp('```' + escapedName + '\s*([\s\S]*?)```', 'gi');
      patterns.push({ lang: getFileLanguage(item.name), file: item.name, regex: namePattern });
    }
  });

  var updatedFilesList = [];
  var cleanedContent = fullContent;

  for (var i = 0; i < patterns.length; i++) {
    var pattern = patterns[i];
    pattern.regex.lastIndex = 0;
    var match = pattern.regex.exec(fullContent);
    if (match) {
      var code = match[1].trim();
      if (code) {
        files[pattern.file] = code;
        if (!fileTreeItems.some(function(f) { return f.name === pattern.file; })) {
          var ext = pattern.file.split('.').pop();
          var iconMap = { html: '📄', css: '🎨', js: '⚡', jsx: '⚛️', ts: '🔷', json: '📋', md: '📝', py: '🐍' };
          var langMap = { html: 'html', css: 'css', js: 'javascript', jsx: 'javascript', ts: 'typescript', json: 'json', md: 'markdown', py: 'python' };
          fileTreeItems.push({ name: pattern.file, icon: iconMap[ext] || '📄', language: langMap[ext] || 'plaintext' });
        }
        updatedFilesList.push(pattern.file);
        cleanedContent = cleanedContent.replace(match[0], '');
      }
    }
  }

  if (updatedFilesList.length > 0) {
    if (editor && updatedFilesList.indexOf(currentFile) !== -1) {
      editor.setValue(files[currentFile]);
    } else if (editor && updatedFilesList.length > 0) {
      switchFile(updatedFilesList[0]);
    }
    renderFileTree();
    renderFileTabs();
    updatePreview();
    return { updated: true, updatedFiles: updatedFilesList, cleanedContent: cleanedContent.trim() };
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

// ===== FILE TREE RENDERING =====
function renderFileTree() {
  const container = document.getElementById('fileTree');
  if (!container) return;
  container.innerHTML = '';

  fileTreeItems.forEach((item, index) => {
    const div = document.createElement('div');
    div.className = 'file-tree-item' + (item.name === currentFile ? ' active' : '');
    div.dataset.index = index;
    div.dataset.filename = item.name;

    div.innerHTML = '<span class="file-icon">' + item.icon + '</span>' +
      '<span class="file-name">' + item.name + '</span>' +
      '<span class="file-actions">' +
      '<button class="rename-btn" title="Rename">✏️</button>' +
      '<button class="delete-btn" title="Delete">🗑️</button>' +
      '</span>';

    div.addEventListener('click', (e) => {
      if (!e.target.closest('.file-actions')) {
        switchFile(item.name);
        renderFileTree();
      }
    });

    div.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showContextMenu(e.clientX, e.clientY, item.name, index);
    });

    div.querySelector('.rename-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      startRename(index, div);
    });

    div.querySelector('.delete-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteFile(item.name, index);
    });

    container.appendChild(div);
  });
}

function startRename(index, treeItemDiv) {
  const item = fileTreeItems[index];
  const nameSpan = treeItemDiv.querySelector('.file-name');
  const oldName = item.name;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'file-rename-input';
  input.value = oldName;

  nameSpan.replaceWith(input);
  input.focus();
  input.select();

  const finishRename = () => {
    const newName = input.value.trim();
    if (newName && newName !== oldName) {
      if (fileTreeItems.some(f => f.name === newName)) {
        alert('File name already exists!');
        input.value = oldName;
        return;
      }
      item.name = newName;
      const ext = newName.split('.').pop();
      const iconMap = { html: '📄', css: '🎨', js: '⚡', jsx: '⚛️', ts: '🔷', json: '📋', md: '📝', py: '🐍' };
      item.icon = iconMap[ext] || '📄';
      const langMap = { html: 'html', css: 'css', js: 'javascript', jsx: 'javascript', ts: 'typescript', json: 'json', md: 'markdown', py: 'python' };
      item.language = langMap[ext] || 'plaintext';
      files[newName] = files[oldName];
      delete files[oldName];
      if (currentFile === oldName) {
        currentFile = newName;
        if (editor) {
          const model = editor.getModel();
          monaco.editor.setModelLanguage(model, item.language);
          editor.setValue(files[newName]);
        }
      }
      renderFileTabs();
      renderFileTree();
    }
  };

  input.addEventListener('blur', finishRename);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { input.value = oldName; input.blur(); }
  });
}

function deleteFile(name, index) {
  if (fileTreeItems.length <= 1) {
    alert('Cannot delete the last file!');
    return;
  }
  if (!confirm('Delete "' + name + '"?')) return;

  fileTreeItems.splice(index, 1);
  delete files[name];

  if (currentFile === name) {
    currentFile = fileTreeItems[0].name;
    if (editor) {
      const model = editor.getModel();
      monaco.editor.setModelLanguage(model, fileTreeItems[0].language);
      editor.setValue(files[currentFile]);
    }
  }

  renderFileTabs();
  renderFileTree();
}

function addNewFile() {
  const name = prompt('Enter file name (e.g., script.js, styles.css, about.html):');
  if (!name) return;

  if (fileTreeItems.some(f => f.name === name)) {
    alert('File already exists!');
    return;
  }

  const ext = name.split('.').pop();
  const iconMap = { html: '📄', css: '🎨', js: '⚡', jsx: '⚛️', ts: '🔷', json: '📋', md: '📝', py: '🐍', txt: '📄' };
  const langMap = { html: 'html', css: 'css', js: 'javascript', jsx: 'javascript', ts: 'typescript', json: 'json', md: 'markdown', py: 'python', txt: 'plaintext' };

  const newItem = { name, icon: iconMap[ext] || '📄', language: langMap[ext] || 'plaintext' };
  fileTreeItems.push(newItem);

  const defaultContent = {
    html: '<!DOCTYPE html>\n<html>\n<head>\n  <title>New Page</title>\n</head>\n<body>\n\n</body>\n</html>',
    css: '/* Styles */\n',
    js: '// JavaScript\n',
    py: '# Python\n'
  };
  files[name] = defaultContent[ext] || '';

  switchFile(name);
  renderFileTabs();
  renderFileTree();

  if (editor) editor.setValue(files[name]);
}

function showContextMenu(x, y, name, index) {
  document.querySelector('.context-menu')?.remove();

  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  menu.innerHTML = '<div class="context-menu-item rename-ctx">✏️ Rename</div>' +
    '<div class="context-menu-item delete delete-ctx">🗑️ Delete</div>';

  menu.querySelector('.rename-ctx').addEventListener('click', function() {
    menu.remove();
    const treeItem = document.querySelector('.file-tree-item[data-filename="' + name + '"]');
    if (treeItem) startRename(index, treeItem);
  });

  menu.querySelector('.delete-ctx').addEventListener('click', function() {
    menu.remove();
    deleteFile(name, index);
  });

  document.body.appendChild(menu);

  const closeMenu = function(e) {
    if (!menu.contains(e.target)) {
      menu.remove();
      document.removeEventListener('click', closeMenu);
    }
  };
  setTimeout(function() { document.addEventListener('click', closeMenu); }, 0);
}

function renderFileTabs() {
  const tabsContainer = document.querySelector('#editor-main #file-tabs');
  if (!tabsContainer) return;
  tabsContainer.innerHTML = '';

  fileTreeItems.forEach(function(item) {
    const btn = document.createElement('button');
    btn.className = 'file-tab' + (item.name === currentFile ? ' active' : '');
    btn.dataset.file = item.name;
    btn.textContent = item.icon + ' ' + item.name;
    btn.addEventListener('click', function() {
      switchFile(item.name);
      renderFileTabs();
      renderFileTree();
    });
    tabsContainer.appendChild(btn);
  });
}

function getFileLanguage(filename) {
  const ext = filename.split('.').pop();
  const langMap = { html: 'html', css: 'css', js: 'javascript', jsx: 'javascript', ts: 'typescript', json: 'json', md: 'markdown', py: 'python', txt: 'plaintext' };
  return langMap[ext] || 'plaintext';
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

  // Render file tree and tabs after editor init
  setTimeout(() => {
    renderFileTree();
    renderFileTabs();
  }, 100);

  document.getElementById('addFileBtn').addEventListener('click', addNewFile);

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