const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');
const fsp = require('fs').promises;
const archiver = require('archiver');
const { Jimp } = require('jimp');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Workspace directory (ephemeral per-session in /tmp) ──
const WORKSPACE_ROOT = path.join('/tmp', 'mc-addons');
fs.mkdirSync(WORKSPACE_ROOT, { recursive: true });

// ── System prompt ──
const SYSTEM_PROMPT = `# MINECRAFT BEDROCK ADDON BUILDER — ZERO EXCUSES, FULL OUTPUT

## YOUR ONLY JOB
Build complete, working Minecraft Bedrock 1.21 addons. Every time the user describes an addon idea — even vaguely — you immediately generate EVERY file required. No asking questions. No outlines. No "here's a rough sketch". You build the whole thing right now.

## ABSOLUTE RULES — VIOLATING THESE IS FAILURE
1. **NEVER ask clarifying questions.** Make reasonable assumptions and build. If you're unsure about a detail, pick the best option and state what you chose.
2. **NEVER produce placeholder code.** No "// TODO", no "// implement this", no stub functions. Every function is fully implemented.
3. **NEVER truncate output.** If a file is 400 lines, you write all 400 lines. Never write "...rest of code here" or similar.
4. **NEVER describe what you're going to make without making it.** Don't say "here's a rough outline of manifest.json" — just output the actual manifest.json using the FILE block format below.
5. **ALWAYS generate textures** for every entity, item, and block using TEXTURE blocks. Never skip textures.
6. **ALWAYS use the correct folder structure** — see MANDATORY STRUCTURE below. Never put files in wrong locations.
7. **ALWAYS generate all files in one response** — BP manifest, RP manifest, entity JSON, scripts, textures, loot tables, spawn rules — everything.

## MANDATORY ADDON FOLDER STRUCTURE
Every addon MUST have this exact structure. No exceptions. No deviations.

BEHAVIOR PACK (MyAddon_BP/):
- MyAddon_BP/manifest.json
- MyAddon_BP/scripts/main.js  (main script — ES module)
- MyAddon_BP/entities/mob_name.json  (entity behavior)
- MyAddon_BP/items/item_name.json  (if addon has items)
- MyAddon_BP/blocks/block_name.json  (if addon has blocks)
- MyAddon_BP/loot_tables/entities/mob_name.json
- MyAddon_BP/spawn_rules/mob_name.json

RESOURCE PACK (MyAddon_RP/):
- MyAddon_RP/manifest.json
- MyAddon_RP/entity/mob_name.entity.json  (client entity definition)
- MyAddon_RP/models/entity/mob_name.geo.json  (geometry)
- MyAddon_RP/animations/mob_name.anim.json
- MyAddon_RP/render_controllers/mob_name.render.json
- MyAddon_RP/textures/entity/mob_name.png  (ALWAYS generate with TEXTURE block)
- MyAddon_RP/textures/entity/mob_name_spawn_egg.png  (ALWAYS generate spawn egg texture)
- MyAddon_RP/textures/terrain_texture.json  (if custom blocks)
- MyAddon_RP/textures/item_texture.json  (if custom items)
- MyAddon_RP/texts/en_US.lang
- MyAddon_RP/sounds.json  (if custom sounds referenced)

BRIDGE SERVER (bridge/):
- bridge/server.js  (Express + Groq proxy)
- bridge/groq-client.js
- bridge/package.json

CRITICAL: groq-client.js ALWAYS goes in bridge/, NEVER in the addon root or BP root.
CRITICAL: entity behavior JSONs go in MyAddon_BP/entities/, NEVER in scripts/ or root.
CRITICAL: The RP manifest UUID and BP manifest UUID must be different. The BP depends on the RP via the RP header UUID.

## FILE GENERATION — HOW TO OUTPUT FILES
Use this exact syntax for every file. The server parses these blocks and writes real files:

<<<FILE: MyAddon_BP/manifest.json>>>
{
    "format_version": 2,
    ...
}
<<<END_FILE>>>

<<<FILE: MyAddon_BP/scripts/main.js>>>
import { world, system } from "@minecraft/server";
...
<<<END_FILE>>>

For textures, use TEXTURE blocks — the server generates them automatically with Jimp:
<<<TEXTURE: MyAddon_RP/textures/entity/mob_name.png | 16x16 entity texture, dark shadowy humanoid, glowing red eyes, top-left lighting, Minecraft style>>>

Be descriptive in texture descriptions. Include: size (16x16 or 32x32), material type, colors, special effects (glowing, metallic, cracked), lighting direction (always top-left for Minecraft).

## UUID RULES
Generate real v4 UUIDs. Use these formats:
- BP header: generate a fresh UUID
- BP module: generate a different fresh UUID  
- RP header: generate a different fresh UUID
- RP module: generate a different fresh UUID
- BP dependencies must reference RP header UUID exactly

Example real UUIDs (generate new ones every time, never reuse these):
a3f2c1d4-8b5e-4f2a-9c1d-3e7f6a2b8c4d
b7e3d2a5-9c6f-5g3b-0d2e-4f8g7b3c9d5e

## GROQ INTEGRATION — ALWAYS INCLUDE THIS
Every addon that involves AI mobs must include a bridge server. The bridge runs on the host machine, the addon connects via HTTP using @minecraft/server-net.

Bridge server pattern (CommonJS):
\`\`\`javascript
// bridge/groq-client.js
const fetch = require('node-fetch');
const GROQ_API_KEY = process.env.GROQ_API_KEY;

async function groqChat(messages, model = 'llama-3.3-70b-versatile', maxTokens = 512) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': \`Bearer \${GROQ_API_KEY}\`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, max_tokens: maxTokens, messages, temperature: 0.8, stream: false })
    });
    if (!res.ok) throw new Error(\`Groq error \${res.status}: \${await res.text()}\`);
    const data = await res.json();
    return data.choices[0].message.content;
}
module.exports = { groqChat };
\`\`\`

Addon HTTP call pattern (ES module, inside BP scripts/main.js):
\`\`\`javascript
import { HttpClient, HttpRequest, HttpRequestMethod, HttpHeader } from "@minecraft/server-net";

async function queryBridge(endpoint, body) {
    const req = new HttpRequest(\`http://localhost:3000\${endpoint}\`);
    req.method = HttpRequestMethod.Post;
    req.headers = [new HttpHeader("Content-Type", "application/json")];
    req.body = JSON.stringify(body);
    req.timeout = 5;
    try {
        const res = await HttpClient.request(req);
        return res.status === 200 ? JSON.parse(res.body) : null;
    } catch(e) { console.error("Bridge failed:", e); return null; }
}
\`\`\`

## MINECRAFT BEDROCK 1.21 RULES
- format_version: "1.21.0" for ALL JSON files — never older
- @minecraft/server: 1.11.0
- @minecraft/server-ui: 1.3.0
- @minecraft/server-net: 1.0.0-beta (requires Beta APIs experiment flag)
- scripts/main.js uses ES modules (import/export)
- bridge/server.js uses CommonJS (require/module.exports)
- NEVER use Holiday Creator Features — it's deprecated
- Use Upcoming Creator Features for custom blocks/items
- Wrap ALL world mutations in system.run(() => { }) inside event handlers
- Dynamic properties max ~32KB — trim mob memory arrays to last 20 entries
- No trailing commas anywhere in JSON — Minecraft rejects them

## MOB AI SYSTEM PROMPT PATTERN
For AI mobs, build a system prompt that forces JSON output:
\`\`\`javascript
function buildMobPrompt(mob, context) {
    return \`You are \${mob.name}, a \${mob.type} in Minecraft. ALWAYS stay in character. Never break immersion.
Respond ONLY with valid JSON — no other text:
{
  "action": "stalk|attack|flee|idle|ambush",
  "message": "spoken words or null",
  "target": "player_name or null",
  "emotion": "calm|hunting|afraid|enraged",
  "thought": "internal reasoning not shown to player"
}\`;
}
\`\`\`

## AFTER GENERATING ALL FILES
End your response with a brief summary:
- List every file you generated
- State which experiment flags the user needs to enable
- Give the bridge server start command
- Remind user to click "Download .mcaddon" to get the package

## IF THE USER SAYS "make the rest" OR "finish it" OR "where is X"
That means you missed something. Immediately generate the missing files using FILE blocks. No apologies, no explanations — just output the missing files.`;

// ── Minecraft color palette for texture generation ──
const MC_PALETTE = {
    stone: [0x7F7F7FFF, 0x6B6B6BFF, 0x555555FF, 0x999999FF, 0xAAAAAAFF],
    grass: [0x5D9C31FF, 0x4E8A25FF, 0x3D6B1AFF, 0x7BBF44FF, 0x8B6914FF],
    dirt: [0x8B6914FF, 0x7A5C10FF, 0x9C7A1EFF, 0x6B4E0EFF, 0xAA8C28FF],
    wood: [0xB5892AFF, 0x9E7722FF, 0xC9A03AFF, 0x7A5C10FF, 0xD4B050FF],
    iron: [0xC8C8C8FF, 0xA0A0A0FF, 0xE0E0E0FF, 0x787878FF, 0xF0F0F0FF],
    gold: [0xF0D030FF, 0xD4B828FF, 0xFFE840FF, 0xAA9010FF, 0xFFF060FF],
    diamond: [0x30D8F0FF, 0x20C0D8FF, 0x48E8FFFF, 0x10A0B8FF, 0x80F0FFFF],
    emerald: [0x00C040FF, 0x00A030FF, 0x00E060FF, 0x008020FF, 0x40FF80FF],
    redstone: [0xC00000FF, 0xA00000FF, 0xFF2020FF, 0x800000FF, 0xFF4040FF],
    lapis: [0x1030C0FF, 0x0820A0FF, 0x2040E0FF, 0x041080FF, 0x3060FFFF],
    obsidian: [0x0D0B18FF, 0x1A1528FF, 0x080610FF, 0x251E38FF, 0x150F25FF],
    glowstone: [0xFFCC77FF, 0xFFAA44FF, 0xFFEE99FF, 0xDD8822FF, 0xFFFFBBFF],
    netherrack: [0x7C2424FF, 0x6A1C1CFF, 0x8E2C2CFF, 0x581414FF, 0xA03434FF],
    soul_sand: [0x4A3728FF, 0x3C2C1EFF, 0x584432FF, 0x2E2014FF, 0x6A5040FF],
    prismarine: [0x2D7A73FF, 0x226860FF, 0x388C84FF, 0x185050FF, 0x50A09AFF],
    end_stone: [0xDAD49AFF, 0xC8C88AFF, 0xECE8AAFF, 0xB8B070FF, 0xF8F4BBFF],
    generic: [0x888888FF, 0x666666FF, 0xAAAAAAFF, 0x444444FF, 0xCCCCCCFF],
};

// ── Parse hex color with alpha ──
function hexToRGBA(hex) {
    const r = (hex >>> 24) & 0xFF;
    const g = (hex >>> 16) & 0xFF;
    const b = (hex >>> 8) & 0xFF;
    const a = hex & 0xFF;
    return { r, g, b, a };
}

// ── Texture generation engine ──
async function generateTexture(description, outputPath, size = 16) {
    const desc = description.toLowerCase();

    // Pick palette based on description keywords
    let paletteKey = 'generic';
    if (desc.includes('stone') || desc.includes('rock') || desc.includes('cobble')) paletteKey = 'stone';
    else if (desc.includes('grass')) paletteKey = 'grass';
    else if (desc.includes('dirt') || desc.includes('soil')) paletteKey = 'dirt';
    else if (desc.includes('wood') || desc.includes('plank') || desc.includes('log') || desc.includes('oak') || desc.includes('altar')) paletteKey = 'wood';
    else if (desc.includes('iron') || desc.includes('steel') || desc.includes('metal')) paletteKey = 'iron';
    else if (desc.includes('gold') || desc.includes('golden')) paletteKey = 'gold';
    else if (desc.includes('diamond')) paletteKey = 'diamond';
    else if (desc.includes('emerald') || desc.includes('green crystal')) paletteKey = 'emerald';
    else if (desc.includes('redstone') || desc.includes('red')) paletteKey = 'redstone';
    else if (desc.includes('lapis') || desc.includes('blue')) paletteKey = 'lapis';
    else if (desc.includes('obsidian') || desc.includes('dark')) paletteKey = 'obsidian';
    else if (desc.includes('glow') || desc.includes('emissive') || desc.includes('crystal') || desc.includes('teal')) paletteKey = 'glowstone';
    else if (desc.includes('nether') || desc.includes('fire')) paletteKey = 'netherrack';
    else if (desc.includes('soul')) paletteKey = 'soul_sand';
    else if (desc.includes('prism') || desc.includes('ocean')) paletteKey = 'prismarine';
    else if (desc.includes('end') || desc.includes('endstone')) paletteKey = 'end_stone';

    const palette = MC_PALETTE[paletteKey];
    const [base, shadow, midLight, darkShadow, highlight] = palette.map(hexToRGBA);

    const isBlock = desc.includes('block') || desc.includes('tile') || desc.includes('plank') || desc.includes('stone') || desc.includes('altar');
    const isEntity = desc.includes('entity') || desc.includes('mob') || desc.includes('creature') || desc.includes('golem');
    const isItem = desc.includes('item') || desc.includes('crystal') || desc.includes('sword') || desc.includes('wand') || desc.includes('staff');
    const isGlowing = desc.includes('glow') || desc.includes('emissive') || desc.includes('lava') || desc.includes('fire');
    const isMetal = desc.includes('metal') || desc.includes('iron') || desc.includes('gold') || desc.includes('steel');
    const hasRunes = desc.includes('rune') || desc.includes('carved') || desc.includes('inscription');
    const hasCracks = desc.includes('crack') || desc.includes('broken') || desc.includes('damaged');
    const hasKnot = desc.includes('wood') || desc.includes('plank') || desc.includes('oak');

    const img = new Jimp({ width: size, height: size });

    // Fill base color
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            // Top-left lighting: brighter top-left, darker bottom-right
            const lightFactor = 1 - ((x + y) / (size * 2));
            let color;
            if (lightFactor > 0.7) color = highlight;
            else if (lightFactor > 0.5) color = midLight;
            else if (lightFactor > 0.3) color = base;
            else if (lightFactor > 0.15) color = shadow;
            else color = darkShadow;

            // Add pixel-level variation for organic materials
            if (!isMetal && !isItem) {
                const noise = (Math.sin(x * 7.3 + y * 13.7) * 0.5 + 0.5);
                if (noise > 0.85) color = midLight;
                else if (noise < 0.12) color = darkShadow;
            }

            img.setPixelColor(
                Jimp.rgbaToInt(color.r, color.g, color.b, 255),
                x, y
            );
        }
    }

    // ── Material-specific details ──

    // Wood grain lines
    if (hasKnot || paletteKey === 'wood') {
        for (let y = 2; y < size; y += 3) {
            for (let x = 0; x < size; x++) {
                const existing = img.getPixelColor(x, y);
                // horizontal grain: slightly lighter lines
                if (Math.sin(x * 2.1 + y) > 0.3) {
                    img.setPixelColor(Jimp.rgbaToInt(midLight.r, midLight.g, midLight.b, 255), x, y);
                }
            }
        }
        // knot
        const kx = Math.floor(size * 0.6), ky = Math.floor(size * 0.4);
        img.setPixelColor(Jimp.rgbaToInt(darkShadow.r, darkShadow.g, darkShadow.b, 255), kx, ky);
        img.setPixelColor(Jimp.rgbaToInt(darkShadow.r, darkShadow.g, darkShadow.b, 255), kx + 1, ky);
        img.setPixelColor(Jimp.rgbaToInt(shadow.r, shadow.g, shadow.b, 255), kx, ky + 1);
        img.setPixelColor(Jimp.rgbaToInt(highlight.r, highlight.g, highlight.b, 255), kx - 1, ky - 1);
    }

    // Metal specular highlight (top-left cluster)
    if (isMetal) {
        img.setPixelColor(Jimp.rgbaToInt(255, 255, 255, 255), 2, 2);
        img.setPixelColor(Jimp.rgbaToInt(255, 255, 255, 200), 3, 2);
        img.setPixelColor(Jimp.rgbaToInt(255, 255, 255, 200), 2, 3);
        // scratch lines
        for (let i = 4; i < size - 4; i += 4) {
            img.setPixelColor(Jimp.rgbaToInt(darkShadow.r, darkShadow.g, darkShadow.b, 180), i, i - 1);
        }
    }

    // Cracks
    if (hasCracks || (isBlock && paletteKey === 'stone')) {
        // Draw a few crack lines
        const crackPairs = [[3, 5, 7, 9], [10, 3, 13, 7], [5, 11, 8, 14]];
        for (const [x1, y1, x2, y2] of crackPairs) {
            // simple line between two points
            const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
            for (let s = 0; s <= steps; s++) {
                const px = Math.round(x1 + (x2 - x1) * s / steps);
                const py = Math.round(y1 + (y2 - y1) * s / steps);
                if (px >= 0 && px < size && py >= 0 && py < size) {
                    img.setPixelColor(Jimp.rgbaToInt(darkShadow.r, darkShadow.g, darkShadow.b, 255), px, py);
                }
            }
        }
    }

    // Rune carving
    if (hasRunes) {
        // Simple cross rune in center
        const cx = Math.floor(size / 2), cy = Math.floor(size / 2);
        const runeColor = Jimp.rgbaToInt(highlight.r, highlight.g, highlight.b, 200);
        const runeDark = Jimp.rgbaToInt(darkShadow.r, darkShadow.g, darkShadow.b, 255);
        for (let i = -2; i <= 2; i++) {
            if (cx + i >= 0 && cx + i < size) {
                img.setPixelColor(runeDark, cx + i, cy);
                img.setPixelColor(runeColor, cx + i, cy - 1);
            }
            if (cy + i >= 0 && cy + i < size) {
                img.setPixelColor(runeDark, cx, cy + i);
                img.setPixelColor(runeColor, cx + 1, cy + i);
            }
        }
    }

    // Glowing effect — bright center radiating out
    if (isGlowing) {
        const cx = Math.floor(size / 2), cy = Math.floor(size / 2);
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
                const maxDist = size / 2;
                if (dist < maxDist * 0.25) {
                    img.setPixelColor(Jimp.rgbaToInt(255, 255, 220, 255), x, y);
                } else if (dist < maxDist * 0.5) {
                    img.setPixelColor(Jimp.rgbaToInt(highlight.r, highlight.g, highlight.b, 255), x, y);
                }
            }
        }
    }

    // Item silhouette — for non-block items, make corners transparent
    if (isItem && !isBlock) {
        const corners = [[0,0],[1,0],[0,1],[size-1,0],[size-2,0],[size-1,1],[0,size-1],[1,size-1],[0,size-2],[size-1,size-1],[size-2,size-1],[size-1,size-2]];
        for (const [cx, cy] of corners) {
            img.setPixelColor(Jimp.rgbaToInt(0, 0, 0, 0), cx, cy);
        }
    }

    // Pixel outline for items/entities (not block faces)
    if (isItem || isEntity) {
        const outlineColor = Jimp.rgbaToInt(darkShadow.r, darkShadow.g, darkShadow.b, 255);
        for (let x = 1; x < size - 1; x++) {
            img.setPixelColor(outlineColor, x, 0);
            img.setPixelColor(outlineColor, x, size - 1);
        }
        for (let y = 1; y < size - 1; y++) {
            img.setPixelColor(outlineColor, 0, y);
            img.setPixelColor(outlineColor, size - 1, y);
        }
    }

    await fsp.mkdir(path.dirname(outputPath), { recursive: true });
    await img.write(outputPath);
    return outputPath;
}

// ── Parse AI response for file blocks and texture requests ──
function parseAIResponse(content, workspaceId) {
    const workspacePath = path.join(WORKSPACE_ROOT, workspaceId);
    const files = [];
    const textures = [];

    // Parse <<<FILE: path>>> ... <<<END_FILE>>> blocks
    const fileRegex = /<<<FILE:\s*([^>]+)>>>\n([\s\S]*?)<<<END_FILE>>>/g;
    let match;
    while ((match = fileRegex.exec(content)) !== null) {
        files.push({ filePath: match[1].trim(), content: match[2] });
    }

    // Parse <<<TEXTURE: path | description>>> blocks
    const textureRegex = /<<<TEXTURE:\s*([^|>]+)\s*\|\s*([^>]+)>>>/g;
    while ((match = textureRegex.exec(content)) !== null) {
        textures.push({ filePath: match[1].trim(), description: match[2].trim() });
    }

    return { files, textures };
}

// ── Write files to workspace ──
async function writeWorkspaceFiles(workspaceId, files) {
    const workspacePath = path.join(WORKSPACE_ROOT, workspaceId);
    const written = [];

    for (const { filePath, content } of files) {
        const fullPath = path.join(workspacePath, filePath);
        // Security: ensure path stays within workspace
        if (!fullPath.startsWith(workspacePath)) continue;
        await fsp.mkdir(path.dirname(fullPath), { recursive: true });
        await fsp.writeFile(fullPath, content, 'utf8');
        written.push(filePath);
    }

    return written;
}

// ── Generate textures from AI requests ──
async function processTextureRequests(workspaceId, textures) {
    const workspacePath = path.join(WORKSPACE_ROOT, workspaceId);
    const generated = [];

    for (const { filePath, description } of textures) {
        const fullPath = path.join(workspacePath, filePath);
        if (!fullPath.startsWith(workspacePath)) continue;
        try {
            await generateTexture(description, fullPath, 16);
            generated.push(filePath);
        } catch (err) {
            console.error(`Texture generation failed for ${filePath}:`, err);
        }
    }

    return generated;
}

// ── Get workspace file tree ──
async function getFileTree(workspacePath, base = '') {
    const entries = [];
    let items;
    try {
        items = await fsp.readdir(path.join(workspacePath, base), { withFileTypes: true });
    } catch {
        return entries;
    }

    for (const item of items) {
        const relPath = base ? `${base}/${item.name}` : item.name;
        if (item.isDirectory()) {
            entries.push({ type: 'dir', path: relPath, name: item.name, children: await getFileTree(workspacePath, relPath) });
        } else {
            entries.push({ type: 'file', path: relPath, name: item.name });
        }
    }

    return entries;
}

// ── Routes ──

// Chat with Groq + file/texture parsing
app.post('/api/chat', async (req, res) => {
    const { messages, workspaceId } = req.body;

    if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: 'messages array required' });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'GROQ_API_KEY not configured' });

    const wsId = workspaceId || uuidv4();
    const workspacePath = path.join(WORKSPACE_ROOT, wsId);
    fs.mkdirSync(workspacePath, { recursive: true });

    try {
        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                max_tokens: 4096,
                temperature: 0.8,
                stream: false,
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    ...messages
                ]
            })
        });

        if (!groqRes.ok) {
            const errText = await groqRes.text();
            return res.status(groqRes.status).json({ error: `Groq API error: ${errText}` });
        }

        const data = await groqRes.json();
        const content = data.choices[0].message.content;

        // Parse and process file/texture blocks
        const { files, textures } = parseAIResponse(content, wsId);
        const writtenFiles = files.length > 0 ? await writeWorkspaceFiles(wsId, files) : [];
        const generatedTextures = textures.length > 0 ? await processTextureRequests(wsId, textures) : [];

        res.json({
            content,
            workspaceId: wsId,
            writtenFiles,
            generatedTextures
        });

    } catch (err) {
        console.error('Chat error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get file tree for workspace
app.get('/api/files/:workspaceId', async (req, res) => {
    const workspacePath = path.join(WORKSPACE_ROOT, req.params.workspaceId);
    try {
        const tree = await getFileTree(workspacePath);
        res.json({ tree });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Read a specific file
app.get('/api/files/:workspaceId/read', async (req, res) => {
    const { filePath } = req.query;
    const workspacePath = path.join(WORKSPACE_ROOT, req.params.workspaceId);
    const fullPath = path.join(workspacePath, filePath);

    if (!fullPath.startsWith(workspacePath)) {
        return res.status(403).json({ error: 'Path traversal denied' });
    }

    try {
        const ext = path.extname(filePath).toLowerCase();
        const imageExts = ['.png', '.jpg', '.jpeg', '.gif'];

        if (imageExts.includes(ext)) {
            // Return base64 for images
            const buffer = await fsp.readFile(fullPath);
            res.json({ content: buffer.toString('base64'), isImage: true, mimeType: 'image/png' });
        } else {
            const content = await fsp.readFile(fullPath, 'utf8');
            res.json({ content, isImage: false });
        }
    } catch (err) {
        res.status(404).json({ error: 'File not found' });
    }
});

// Write/update a specific file
app.post('/api/files/:workspaceId/write', async (req, res) => {
    const { filePath, content } = req.body;
    const workspacePath = path.join(WORKSPACE_ROOT, req.params.workspaceId);
    const fullPath = path.join(workspacePath, filePath);

    if (!fullPath.startsWith(workspacePath)) {
        return res.status(403).json({ error: 'Path traversal denied' });
    }

    try {
        await fsp.mkdir(path.dirname(fullPath), { recursive: true });
        await fsp.writeFile(fullPath, content, 'utf8');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete a file
app.delete('/api/files/:workspaceId/delete', async (req, res) => {
    const { filePath } = req.query;
    const workspacePath = path.join(WORKSPACE_ROOT, req.params.workspaceId);
    const fullPath = path.join(workspacePath, filePath);

    if (!fullPath.startsWith(workspacePath)) {
        return res.status(403).json({ error: 'Path traversal denied' });
    }

    try {
        await fsp.unlink(fullPath);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Generate texture manually
app.post('/api/texture', async (req, res) => {
    const { workspaceId, filePath, description, size = 16 } = req.body;

    if (!workspaceId || !filePath || !description) {
        return res.status(400).json({ error: 'workspaceId, filePath, description required' });
    }

    const workspacePath = path.join(WORKSPACE_ROOT, workspaceId);
    const fullPath = path.join(workspacePath, filePath);

    if (!fullPath.startsWith(workspacePath)) {
        return res.status(403).json({ error: 'Path traversal denied' });
    }

    try {
        await generateTexture(description, fullPath, Math.min(Math.max(size, 8), 64));
        const buffer = await fsp.readFile(fullPath);
        res.json({ success: true, base64: buffer.toString('base64') });
    } catch (err) {
        console.error('Texture error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Save texture pixels directly (from in-browser pixel editor)
app.post('/api/texture/save-pixels', async (req, res) => {
    const { workspaceId, filePath, pixels, size } = req.body;

    if (!workspaceId || !filePath || !pixels) {
        return res.status(400).json({ error: 'workspaceId, filePath, pixels required' });
    }

    const workspacePath = path.join(WORKSPACE_ROOT, workspaceId);
    const fullPath = path.join(workspacePath, filePath);

    if (!fullPath.startsWith(workspacePath)) {
        return res.status(403).json({ error: 'Path traversal denied' });
    }

    try {
        const s = size || 16;
        const img = new Jimp({ width: s, height: s });

        for (let y = 0; y < s; y++) {
            for (let x = 0; x < s; x++) {
                const idx = y * s + x;
                const pixel = pixels[idx]; // { r, g, b, a }
                if (pixel) {
                    img.setPixelColor(Jimp.rgbaToInt(pixel.r, pixel.g, pixel.b, pixel.a ?? 255), x, y);
                }
            }
        }

        await fsp.mkdir(path.dirname(fullPath), { recursive: true });
        await img.write(fullPath);

        const buffer = await fsp.readFile(fullPath);
        res.json({ success: true, base64: buffer.toString('base64') });
    } catch (err) {
        console.error('Save pixels error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Export code blocks from conversation into workspace files
app.post('/api/export-code', async (req, res) => {
    const { workspaceId, messages } = req.body;

    if (!workspaceId || !messages) {
        return res.status(400).json({ error: 'workspaceId and messages required' });
    }

    const workspacePath = path.join(WORKSPACE_ROOT, workspaceId);
    fs.mkdirSync(workspacePath, { recursive: true });

    const written = [];

    // Extension to subfolder mapping
    const extMap = {
        'js': 'scripts',
        'json': '',
        'mcfunction': 'functions',
        'lang': 'texts',
    };

    // Scan all assistant messages for code blocks
    for (const msg of messages) {
        if (msg.role !== 'assistant') continue;

        const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
        let match;
        let blockIndex = 0;

        while ((match = codeBlockRegex.exec(msg.content)) !== null) {
            const lang = match[1]?.toLowerCase() || 'txt';
            const code = match[2];

            // Try to find a filename hint in the lines before the code block
            const beforeBlock = msg.content.substring(0, match.index);
            const fileNameHint = beforeBlock.match(/[`'"]([a-zA-Z0-9_\-./]+\.(js|json|mcfunction|lang|txt))[`'"]\s*:?\s*$/);

            let fileName;
            if (fileNameHint) {
                fileName = fileNameHint[1];
            } else {
                const ext = lang === 'javascript' ? 'js' : lang === 'json' ? 'json' : lang;
                const subdir = extMap[ext] || '';
                fileName = subdir ? `${subdir}/generated_${blockIndex}.${ext}` : `generated_${blockIndex}.${ext}`;
            }

            const fullPath = path.join(workspacePath, fileName);
            if (!fullPath.startsWith(workspacePath)) continue;

            await fsp.mkdir(path.dirname(fullPath), { recursive: true });
            await fsp.writeFile(fullPath, code, 'utf8');
            written.push(fileName);
            blockIndex++;
        }
    }

    res.json({ written });
});

// Package workspace into .mcaddon
app.post('/api/package', async (req, res) => {
    const { workspaceId, addonName = 'MyAddon' } = req.body;

    if (!workspaceId) return res.status(400).json({ error: 'workspaceId required' });

    const workspacePath = path.join(WORKSPACE_ROOT, workspaceId);
    const outputPath = path.join('/tmp', `${addonName}_${workspaceId.slice(0, 8)}.mcaddon`);

    try {
        // Check workspace has files
        const items = await fsp.readdir(workspacePath).catch(() => []);
        if (items.length === 0) {
            return res.status(400).json({ error: 'Workspace is empty — generate some addon files first' });
        }

        await new Promise((resolve, reject) => {
            const output = fs.createWriteStream(outputPath);
            const archive = archiver('zip', { zlib: { level: 9 } });
            output.on('close', resolve);
            archive.on('error', reject);
            archive.pipe(output);
            archive.directory(workspacePath, false);
            archive.finalize();
        });

        const buffer = await fsp.readFile(outputPath);
        await fsp.unlink(outputPath).catch(() => {});

        res.set({
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${addonName}.mcaddon"`,
            'Content-Length': buffer.length
        });
        res.send(buffer);

    } catch (err) {
        console.error('Package error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Create a new workspace
app.post('/api/workspace/new', (req, res) => {
    const wsId = uuidv4();
    fs.mkdirSync(path.join(WORKSPACE_ROOT, wsId), { recursive: true });
    res.json({ workspaceId: wsId });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`MC Addon Builder running on port ${PORT}`);
});
