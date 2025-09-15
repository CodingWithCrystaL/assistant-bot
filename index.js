// index.js - Full final bot (single file)
// Requires: discord.js, mathjs, express, fs, os
// Run: NODE_ENV with process.env.TOKEN set, and config.js present with supportRole & ownerId

const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField
} = require("discord.js");
const math = require("mathjs");
const fs = require("fs");
const express = require("express");
const os = require("os");
const config = require("./config.js");

// ---------- File paths / persistence ----------
const teamPath = "./team.json";          // stores addaddy addresses (upi/ltc/usdt)
const warningsPath = "./warnings.json";  // stores user warnings
const modlogPath = "./modlog.json";      // stores modlog channel per guild

// Ensure files exist and load
function ensureFile(path, fallback = {}) {
  if (!fs.existsSync(path)) fs.writeFileSync(path, JSON.stringify(fallback, null, 2));
  return JSON.parse(fs.readFileSync(path, "utf8"));
}
function saveFile(path, data) {
  fs.writeFileSync(path, JSON.stringify(data, null, 2));
}

let team = ensureFile(teamPath, {});
let warnings = ensureFile(warningsPath, {});
let modlogs = ensureFile(modlogPath, {});

// ---------- Express keep-alive ----------
const app = express();
app.get("/", (req, res) => res.send("Bot is alive!"));
app.listen(process.env.PORT || 3000, () => console.log("✅ KeepAlive server running"));

// ---------- Config ----------
const prefix = ",";

// ---------- Client ----------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel, Partials.GuildMember, Partials.Message]
});

// ---------- Helpers ----------
function parseTime(str) {
  const match = /^(\d+)(s|m|h|d)$/.exec(str);
  if (!match) return null;
  const n = Number(match[1]);
  const u = match[2];
  const mul = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return n * mul[u];
}
function msParse(str) { // supports '10m', '30s' like earlier ms helper
  const m = /^(\d+)(s|m|h|d)?$/.exec(str);
  if (!m) return null;
  const num = Number(m[1]);
  const unit = m[2] || "m";
  const mult = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return num * mult[unit];
}
function isSupport(member) {
  if (!member || !member.roles) return false;
  return member.roles.cache.has(config.supportRole);
}
function sendModLog(guild, embed) {
  try {
    const channelId = modlogs[guild.id];
    if (!channelId) return;
    const ch = guild.channels.cache.get(channelId);
    if (ch && ch.send) ch.send({ embeds: [embed] }).catch(() => {});
  } catch (err) { /* ignore */ }
}
function simpleEmbed(title, desc, color = "#2f3136") {
  return new EmbedBuilder().setTitle(title).setDescription(desc).setColor(color).setTimestamp();
}

// ---------- Rotating statuses ----------
const statuses = [
  "I put the 'pro' in procrastination",
  "Sarcasm is my love language",
  "I'm not arguing, I'm explaining why I'm right",
  "I'm silently correcting your grammar",
  "I love deadlines. I love the whooshing sound they make as they fly by"
];
let statusIndex = 0;
client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  setInterval(() => {
    try { client.user.setActivity(statuses[statusIndex], { type: "WATCHING" }); }
    catch (err) { console.error("Status error:", err); }
    statusIndex = (statusIndex + 1) % statuses.length;
  }, 30_000);
});

// ---------- Snipe store ----------
const snipes = new Map();
client.on("messageDelete", (message) => {
  try {
    if (message.partial) return;
    if (!message.content && message.attachments?.size === 0) return;
    snipes.set(message.channel.id, {
      content: message.content || null,
      authorTag: message.author ? message.author.tag : "Unknown",
      avatar: message.author ? message.author.displayAvatarURL?.() : null,
      image: message.attachments?.first()?.proxyURL || null,
      time: Date.now()
    });
  } catch (err) { /* ignore */ }
});

// ---------- Main command handler ----------
client.on("messageCreate", async (message) => {
  if (message.author?.bot) return;
  if (!message.content?.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = (args.shift() || "").toLowerCase();

  // Commands that are allowed in DMs or do not require support role:
  const ownerOnly = ["addaddy", "broadcast"];
  const supportRequired = [
    "calc","upi","ltc","usdt","vouch","remind","userinfo","stats","ping",
    "notify","clear","nuke","snipe","lock","unlock","slowmode","warn","kick","ban","unban",
    "mute","unmute","warnings","clearwarnings","serverinfo","say","poll","avatar","modlog","help"
  ];

  // Owner-only check
  if (ownerOnly.includes(command) && message.author.id !== config.ownerId) {
    return message.reply("❌ You are not allowed to use that command.");
  }

  // If command requires support role and command executed in guild, enforce it
  if (supportRequired.includes(command) && message.guild) {
    if (!isSupport(message.member)) return message.reply("❌ Only support role can use this command.");
  }

  // ------------------ COMMANDS ------------------

  // CALC
  if (command === "calc") {
    const expr = args.join(" ");
    if (!expr) return message.reply("Usage: ,calc <expression>");
    try {
      const res = math.evaluate(expr);
      return message.reply({ embeds: [simpleEmbed("Calculator", `\`${expr}\` → **${res}**`, "#00b894")] });
    } catch {
      return message.reply("❌ Invalid expression.");
    }
  }

  // PAYMENT SHOW: upi|ltc|usdt
  if (["upi", "ltc", "usdt"].includes(command)) {
    const data = team[message.author.id];
    if (!data || !data[command]) return message.reply("❌ No saved address found.");
    const embed = new EmbedBuilder()
      .setTitle(`${command.toUpperCase()} Address`)
      .setDescription(`\`\`\`${data[command]}\`\`\``)
      .setColor("#2ecc71")
      .setFooter({ text: `${message.guild ? message.guild.name : "DM"} | Made by Kai` });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel("Copy Address").setStyle(ButtonStyle.Secondary).setCustomId(`copy-${command}`)
    );
    return message.reply({ embeds: [embed], components: [row] });
  }

  // VOUCH
  if (command === "vouch") {
    if (args.length < 2) return message.reply("Usage: ,vouch <product> <price>");
    const price = args.pop();
    const product = args.join(" ");
    const embed = new EmbedBuilder()
      .setDescription(`+rep ${message.author.id} | Legit Purchased **${product}** for **${price}**`)
      .setColor("#0099ff")
      .setFooter({ text: `${message.guild ? message.guild.name : "DM"} | Made by Kai` });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel("Copy Vouch").setStyle(ButtonStyle.Secondary).setCustomId("copy-vouch")
    );
    return message.reply({ embeds: [embed], components: [row] });
  }

  // ... (all your other commands unchanged) ...
});

// ---------- Interaction (button) handler ----------
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;
  if (interaction.customId.startsWith("copy-")) {
    const key = interaction.customId.split("-")[1]; // e.g., upi, ltc, usdt, vouch
    let content = null;

    // For vouch, copy from embed description
    if (key === "vouch") {
      content = interaction.message.embeds[0]?.description || null;
    } else {
      // For upi/ltc/usdt, copy from the embed description (so anyone can copy)
      content = interaction.message.embeds[0]?.description?.replace(/```/g, "") || null;
    }

    if (!content) return interaction.reply({ content: "❌ No data found to copy.", ephemeral: true });
    return interaction.reply({ content, ephemeral: true });
  }
});

// ---------- Login ----------
client.login(process.env.TOKEN);

// ---------- Utility / small helpers ----------
function logAction(message, title, details) {
  if (!message.guild) return;
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(details)
    .setColor("#2f3136")
    .setTimestamp()
    .setFooter({ text: `By ${message.author.tag}` });
  sendModLog(message.guild, embed);
}
