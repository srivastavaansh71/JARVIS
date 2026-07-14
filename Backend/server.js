const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const Groq = require('groq-sdk');
const { exec, execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Serve static audio files with proper headers
app.use('/audio', express.static(path.join(__dirname, 'audio'), {
    setHeaders: (res) => {
        res.set('Access-Control-Allow-Origin', '*');
    }
}));

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});

// Create audio directory if it doesn't exist
const audioDir = path.join(__dirname, 'audio');
if (!fs.existsSync(audioDir)) {
    fs.mkdirSync(audioDir);
}

// Cleanup old audio files every 5 minutes
setInterval(() => {
    const now = Date.now();
    try {
        const files = fs.readdirSync(audioDir);
        for (const file of files) {
            const filePath = path.join(audioDir, file);
            const stat = fs.statSync(filePath);
            // Delete files older than 5 minutes
            if (now - stat.mtimeMs > 5 * 60 * 1000) {
                fs.unlinkSync(filePath);
            }
        }
    } catch (e) { /* ignore cleanup errors */ }
}, 5 * 60 * 1000);

// ─── User paths ──────────────────────────────────────────────────────────────
const USER_HOME = os.homedir(); // C:\Users\Ansh Srivastava
const DESKTOP_PATH = path.join(USER_HOME, 'Desktop');

// ─── Common Windows App Lookup ───────────────────────────────────────────────
const APP_LOOKUP = {
    'whatsapp':     'explorer.exe shell:AppsFolder\\5319275A.WhatsAppDesktop_cv1g1gvanyjgm!App',
    'spotify':      'explorer.exe shell:AppsFolder\\SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify',
    'calculator':   'calc',
    'notepad':      'notepad',
    'paint':        'mspaint',
    'file explorer': 'explorer',
    'explorer':     'explorer',
    'settings':     'start ms-settings:',
    'camera':       'start microsoft.windows.camera:',
    'store':        'start ms-windows-store:',
    'maps':         'start bingmaps:',
    'clock':        'start ms-clock:',
    'mail':         'start mailto:',
    'calendar':     'start outlookcal:',
    'word':         'start winword',
    'excel':        'start excel',
    'powerpoint':   'start powerpnt',
    'cmd':          'cmd',
    'terminal':     'wt',
    'powershell':   'powershell',
    'chrome':       'start chrome',
    'firefox':      'start firefox',
    'edge':         'start msedge',
    'vs code':      'code',
    'vscode':       'code',
    'discord':      'start discord:',
    'telegram':     'explorer.exe shell:AppsFolder\\TelegramMessenger.Telegram_t4vj0pshhgkwm!App',
    'task manager': 'taskmgr',
    'snipping tool': 'snippingtool',
};

// ─── Tool Definitions for Groq ───────────────────────────────────────────────
const TOOLS = [
    {
        type: 'function',
        function: {
            name: 'open_website',
            description: 'Opens a website URL in the user\'s default browser. Use this when the user asks to open a website like YouTube, Instagram, Google, Reddit, GitHub, etc.',
            parameters: {
                type: 'object',
                properties: {
                    url: {
                        type: 'string',
                        description: 'The full URL to open, e.g. https://www.youtube.com'
                    }
                },
                required: ['url']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'open_application',
            description: 'Opens a desktop application on the user\'s Windows computer. Use this when the user asks to open an app like WhatsApp, Notepad, Calculator, Spotify, VS Code, Chrome, Discord, etc.',
            parameters: {
                type: 'object',
                properties: {
                    app_name: {
                        type: 'string',
                        description: 'The name of the application to open, e.g. "whatsapp", "notepad", "spotify", "chrome"'
                    }
                },
                required: ['app_name']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'close_chrome_tabs',
            description: 'Closes a specified number of tabs in Google Chrome. Use this when the user asks to close tabs in Chrome or the browser.',
            parameters: {
                type: 'object',
                properties: {
                    count: {
                        type: 'integer',
                        description: 'Number of tabs to close. Defaults to 1 if not specified.'
                    }
                },
                required: ['count']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'list_directory',
            description: 'Lists all files and folders in a given directory. Use this when the user asks what files or folders are in a location like their Desktop, Documents, Downloads, etc.',
            parameters: {
                type: 'object',
                properties: {
                    directory_path: {
                        type: 'string',
                        description: 'The directory path to list. Use "desktop" for the user\'s Desktop, "documents" for Documents, "downloads" for Downloads, or a full path.'
                    }
                },
                required: ['directory_path']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'count_items',
            description: 'Counts the number of files, folders, or both in a given directory. Use this when the user asks how many files or folders are in a location.',
            parameters: {
                type: 'object',
                properties: {
                    directory_path: {
                        type: 'string',
                        description: 'The directory path to count items in. Use "desktop" for Desktop, "documents" for Documents, "downloads" for Downloads, or a full path.'
                    },
                    item_type: {
                        type: 'string',
                        enum: ['files', 'folders', 'all'],
                        description: 'What to count: "files" for files only, "folders" for folders only, "all" for everything.'
                    }
                },
                required: ['directory_path', 'item_type']
            }
        }
    }
];

// ─── Tool Executor Functions ─────────────────────────────────────────────────

function resolvePath(dirName) {
    const shortcuts = {
        'desktop': DESKTOP_PATH,
        'documents': path.join(USER_HOME, 'Documents'),
        'downloads': path.join(USER_HOME, 'Downloads'),
        'pictures': path.join(USER_HOME, 'Pictures'),
        'videos': path.join(USER_HOME, 'Videos'),
        'music': path.join(USER_HOME, 'Music'),
    };
    return shortcuts[dirName.toLowerCase()] || dirName;
}

function execPromise(command) {
    return new Promise((resolve, reject) => {
        exec(command, { shell: 'powershell.exe' }, (error, stdout, stderr) => {
            if (error) reject(error);
            else resolve(stdout.trim());
        });
    });
}

// Auto-detect browser paths
function getBrowserPath() {
    const chromePaths = [
        path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(process.env['LOCALAPPDATA'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    ];
    const edgePaths = [
        path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    ];

    for (const p of chromePaths) {
        if (fs.existsSync(p)) return p;
    }
    for (const p of edgePaths) {
        if (fs.existsSync(p)) return p;
    }
    return null;
}

const BROWSER_PATH = getBrowserPath();
console.log(`[INIT] Browser path: ${BROWSER_PATH || 'NOT FOUND'}`);

async function executeOpenWebsite(args) {
    const { url } = args;
    console.log(`[TOOL] open_website: ${url}`);
    try {
        if (BROWSER_PATH) {
            await execPromise(`Start-Process "${BROWSER_PATH}" -ArgumentList "${url}"`);
            return { success: true, message: `Opened ${url} in Chrome.` };
        } else {
            // Fallback if browser path is not found
            const open = (await import('open')).default;
            await open(url);
            return { success: true, message: `Opened ${url} in the default browser.` };
        }
    } catch (e) {
        return { success: false, message: `Failed to open ${url}: ${e.message}` };
    }
}

async function executeOpenApplication(args) {
    const { app_name } = args;
    const key = app_name.toLowerCase().trim();
    console.log(`[TOOL] open_application: ${app_name}`);

    const command = APP_LOOKUP[key];
    if (command) {
        try {
            await execPromise(`Start-Process ${command}`);
            return { success: true, message: `Opened ${app_name}.` };
        } catch (e) {
            // Fallback: try as a direct command
            try {
                await execPromise(`Start-Process "${app_name}"`);
                return { success: true, message: `Opened ${app_name}.` };
            } catch (e2) {
                return { success: false, message: `Could not open ${app_name}: ${e2.message}` };
            }
        }
    } else {
        // Try launching directly — Windows will resolve if it's in PATH or a known app
        try {
            await execPromise(`Start-Process "${app_name}"`);
            return { success: true, message: `Opened ${app_name}.` };
        } catch (e) {
            return { success: false, message: `Application "${app_name}" not found. It may not be installed or the name might be different.` };
        }
    }
}

async function executeCloseChrometabs(args) {
    const count = args.count || 1;
    console.log(`[TOOL] close_chrome_tabs: ${count} tab(s)`);
    try {
        // Build a PowerShell script that focuses Chrome and sends Ctrl+W multiple times
        const script = `
            Add-Type -AssemblyName System.Windows.Forms
            $chromeProcess = Get-Process chrome -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
            if ($chromeProcess) {
                [void][System.Reflection.Assembly]::LoadWithPartialName('Microsoft.VisualBasic')
                [Microsoft.VisualBasic.Interaction]::AppActivate($chromeProcess.Id)
                Start-Sleep -Milliseconds 300
                for ($i = 0; $i -lt ${count}; $i++) {
                    [System.Windows.Forms.SendKeys]::SendWait('^w')
                    Start-Sleep -Milliseconds 200
                }
                "Closed ${count} tab(s)"
            } else {
                "Chrome is not running"
            }
        `;
        const result = await execPromise(script);
        if (result.includes('not running')) {
            return { success: false, message: 'Chrome is not currently running.' };
        }
        return { success: true, message: `Closed ${count} Chrome tab(s).` };
    } catch (e) {
        return { success: false, message: `Failed to close tabs: ${e.message}` };
    }
}

function executeListDirectory(args) {
    const dirPath = resolvePath(args.directory_path);
    console.log(`[TOOL] list_directory: ${dirPath}`);
    try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        const items = entries.map(entry => ({
            name: entry.name,
            type: entry.isDirectory() ? 'folder' : 'file'
        }));
        return {
            success: true,
            path: dirPath,
            total: items.length,
            items: items.slice(0, 50) // Cap at 50 to avoid huge responses
        };
    } catch (e) {
        return { success: false, message: `Cannot read directory "${dirPath}": ${e.message}` };
    }
}

function executeCountItems(args) {
    const dirPath = resolvePath(args.directory_path);
    const itemType = args.item_type || 'all';
    console.log(`[TOOL] count_items: ${itemType} in ${dirPath}`);
    try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        let count;
        if (itemType === 'folders') {
            count = entries.filter(e => e.isDirectory()).length;
        } else if (itemType === 'files') {
            count = entries.filter(e => e.isFile()).length;
        } else {
            count = entries.length;
        }
        return { success: true, path: dirPath, item_type: itemType, count };
    } catch (e) {
        return { success: false, message: `Cannot read directory "${dirPath}": ${e.message}` };
    }
}

// Dispatch tool calls to their executor
async function executeTool(name, args) {
    switch (name) {
        case 'open_website':      return await executeOpenWebsite(args);
        case 'open_application':  return await executeOpenApplication(args);
        case 'close_chrome_tabs': return await executeCloseChrometabs(args);
        case 'list_directory':    return executeListDirectory(args);
        case 'count_items':       return executeCountItems(args);
        default:                  return { success: false, message: `Unknown tool: ${name}` };
    }
}

// ─── Conversation ────────────────────────────────────────────────────────────
const conversationHistory = [];
const MAX_HISTORY = 20;

// System prompt for J.A.R.V.I.S personality — updated with tool awareness
const SYSTEM_PROMPT = `You are J.A.R.V.I.S (Just A Rather Very Intelligent System), a highly advanced personal AI assistant. You speak in a calm, professional, slightly witty British-accented manner. I am your creator and master. Keep responses concise and direct — 1 to 3 sentences maximum. Never use markdown formatting (no asterisks, hashtags, bullet points, or code blocks) since your responses will be spoken aloud. Respond naturally as a voice assistant would.

You have access to system tools that let you perform real actions on the user's Windows computer:
- Open websites (YouTube, Instagram, Google, Reddit, etc.) using open_website
- Launch applications (WhatsApp, Notepad, Spotify, Chrome, etc.) using open_application
- Close Chrome browser tabs using close_chrome_tabs
- List files and folders in directories using list_directory
- Count files or folders in directories using count_items

When I ask you to open something, take action using the appropriate tool. When I ask about files or folders, use the directory tools. Always use tools when an action is requested rather than just describing what you would do.`;

// ─── Parse text-based function calls from LLM ────────────────────────────────
// Sometimes llama outputs <function=name>{"args"}</function> as text instead of
// using the structured tool calling API. This parser catches and executes them.
function parseTextFunctionCalls(text) {
    const pattern = /<function=([\w]+)>([\s\S]*?)<\/function>/g;
    const calls = [];
    let match;
    while ((match = pattern.exec(text)) !== null) {
        try {
            const fnName = match[1];
            const fnArgs = JSON.parse(match[2]);
            calls.push({ name: fnName, args: fnArgs, raw: match[0] });
        } catch (e) {
            // Skip malformed function calls
        }
    }
    return calls;
}

function stripFunctionCalls(text) {
    return text.replace(/<function[=\s][\s\S]*?<\/function>/g, '').trim();
}

// Health check
app.get('/api/status', (req, res) => {
    res.json({ status: 'online', message: 'J.A.R.V.I.S Core Systems operational' });
});

// ─── TTS Helper ──────────────────────────────────────────────────────────────
function generateTTS(text, res) {
    const timestamp = Date.now();
    const audioPath = path.join(audioDir, `response_${timestamp}.mp3`);
    const sanitized = text
        .replace(/"/g, "'")
        .replace(/\n/g, ' ')
        .replace(/`/g, "'")
        .replace(/\$/g, '')
        .replace(/\\/g, '')
        .replace(/!/g, '.');

    const edgeTtsPath = 'C:\\Users\\Ansh Srivastava\\AppData\\Local\\Python\\pythoncore-3.14-64\\Scripts\\edge-tts.exe';
    const ttsCommand = `"${edgeTtsPath}" --voice "en-US-ChristopherNeural" --rate="+10%" --text "${sanitized}" --write-media "${audioPath}"`;

    exec(ttsCommand, (error) => {
        if (error) {
            console.error(`[TTS ERROR] ${error.message}`);
        } else {
            console.log(`[TTS] Audio generated: response_${timestamp}.mp3`);
            res.write(`data: ${JSON.stringify({ type: 'audio', audioUrl: `http://localhost:8000/audio/response_${timestamp}.mp3` })}\n\n`);
        }
        res.end();
    });
}

// ─── Main Chat Endpoint ──────────────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
    const { text } = req.body;
    if (!text) {
        return res.status(400).json({ error: 'No text provided' });
    }

    console.log(`\n[USER] ${text}`);

    // Set up SSE headers for real-time streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    try {
        // Add user message to history
        conversationHistory.push({ role: 'user', content: text });
        if (conversationHistory.length > MAX_HISTORY) {
            conversationHistory.splice(0, conversationHistory.length - MAX_HISTORY);
        }

        // ── Step 1: Non-streaming call WITH tools to let LLM decide ──
        const initialResponse = await groq.chat.completions.create({
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                ...conversationHistory
            ],
            model: 'llama-3.1-8b-instant',
            max_tokens: 200,
            tools: TOOLS,
            tool_choice: 'auto',
        });

        const assistantMessage = initialResponse.choices[0].message;

        // ── Step 2: Check if LLM wants to call tools ──
        if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
            console.log(`[TOOLS] LLM requested ${assistantMessage.tool_calls.length} tool call(s)`);

            // Add assistant's tool-calling message to history
            conversationHistory.push(assistantMessage);

            // Execute all tool calls
            for (const toolCall of assistantMessage.tool_calls) {
                const fnName = toolCall.function.name;
                const fnArgs = JSON.parse(toolCall.function.arguments);
                console.log(`[TOOL CALL] ${fnName}(${JSON.stringify(fnArgs)})`);

                const result = await executeTool(fnName, fnArgs);
                console.log(`[TOOL RESULT] ${JSON.stringify(result)}`);

                // Send tool action to frontend for visual feedback
                res.write(`data: ${JSON.stringify({ type: 'tool_action', tool: fnName, args: fnArgs, result })}\n\n`);

                // Add tool result to history
                conversationHistory.push({
                    role: 'tool',
                    content: JSON.stringify(result),
                    tool_call_id: toolCall.id,
                });
            }

            // ── Step 3: Stream the final response after tool execution ──
            const stream = await groq.chat.completions.create({
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    ...conversationHistory
                ],
                model: 'llama-3.1-8b-instant',
                max_tokens: 200,
                stream: true,
            });

            let fullReply = '';
            for await (const chunk of stream) {
                const content = chunk.choices[0]?.delta?.content || '';
                if (content) {
                    fullReply += content;
                    res.write(`data: ${JSON.stringify({ type: 'token', content })}\n\n`);
                }
            }

            console.log(`[JARVIS RAW] ${fullReply}`);

            // Strip any text-based function calls from streamed reply too
            const streamTextCalls = parseTextFunctionCalls(fullReply);
            if (streamTextCalls.length > 0) {
                console.log(`[TEXT-TOOLS] Found ${streamTextCalls.length} text-based function call(s) in stream`);
                for (const call of streamTextCalls) {
                    console.log(`[TEXT-TOOL CALL] ${call.name}(${JSON.stringify(call.args)})`);
                    const result = await executeTool(call.name, call.args);
                    console.log(`[TEXT-TOOL RESULT] ${JSON.stringify(result)}`);
                    res.write(`data: ${JSON.stringify({ type: 'tool_action', tool: call.name, args: call.args, result })}\n\n`);
                }
                fullReply = stripFunctionCalls(fullReply);
            }

            // Save to history
            conversationHistory.push({ role: 'assistant', content: fullReply });
            if (conversationHistory.length > MAX_HISTORY) {
                conversationHistory.splice(0, conversationHistory.length - MAX_HISTORY);
            }

            // Send done + TTS
            res.write(`data: ${JSON.stringify({ type: 'done', text: fullReply })}\n\n`);
            generateTTS(fullReply, res);

        } else {
            // ── No tools needed — but check for text-based function calls ──
            let directReply = assistantMessage.content || '';

            // Check if LLM output function calls as text (common with llama models)
            const textCalls = parseTextFunctionCalls(directReply);
            if (textCalls.length > 0) {
                console.log(`[TEXT-TOOLS] Found ${textCalls.length} text-based function call(s)`);
                // Strip function call syntax from the reply
                directReply = stripFunctionCalls(directReply);

                // Execute the parsed function calls
                for (const call of textCalls) {
                    console.log(`[TEXT-TOOL CALL] ${call.name}(${JSON.stringify(call.args)})`);
                    const result = await executeTool(call.name, call.args);
                    console.log(`[TEXT-TOOL RESULT] ${JSON.stringify(result)}`);
                    res.write(`data: ${JSON.stringify({ type: 'tool_action', tool: call.name, args: call.args, result })}\n\n`);
                }
            }

            if (directReply) {
                // Send cleaned reply token-by-token for consistent UX
                const words = directReply.split(/(\s+)/);
                for (const word of words) {
                    if (word) {
                        res.write(`data: ${JSON.stringify({ type: 'token', content: word })}\n\n`);
                    }
                }

                console.log(`[JARVIS] ${directReply}`);

                conversationHistory.push({ role: 'assistant', content: directReply });
                if (conversationHistory.length > MAX_HISTORY) {
                    conversationHistory.splice(0, conversationHistory.length - MAX_HISTORY);
                }

                res.write(`data: ${JSON.stringify({ type: 'done', text: directReply })}\n\n`);
                generateTTS(directReply, res);
            } else {
                res.write(`data: ${JSON.stringify({ type: 'done', text: '' })}\n\n`);
                res.end();
            }
        }

    } catch (error) {
        console.error('[ERROR]', error.message);
        res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
        res.end();
    }
});

const PORT = 8000;
app.listen(PORT, () => {
    console.log(`\n╔══════════════════════════════════════════════╗`);
    console.log(`║  J.A.R.V.I.S Backend v3.0 — Tool Calling     ║`);
    console.log(`║  Running on http://localhost:${PORT}              ║`);
    console.log(`║  Groq API Key: ${process.env.GROQ_API_KEY ? '✓ Loaded' : '✗ Missing'}                      ║`);
    console.log(`║  Tools: 5 system actions available             ║`);
    console.log(`╚══════════════════════════════════════════════╝\n`);
});
