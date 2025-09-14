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

  // REMIND
  if (command === "remind") {
    const user = message.mentions.users.first();
    const delay = parseTime(args[0]);
    const msg = args.slice(1).join(" ");
    if (!user || !delay || !msg) return message.reply("Usage: ,remind @user 10s message");
    message.reply(`✅ Reminder set for ${user.tag} in ${args[0]}`);
    setTimeout(() => { user.send(`⏰ Reminder: ${msg}`).catch(() => {}); }, delay);
    return;
  }

  // ADD ADDY (owner only, persisted to team.json)
  if (command === "addaddy") {
    // original format: ,addaddy USERID TYPE ADDRESS
    if (message.author.id !== config.ownerId) return;
    if (args.length < 3) return message.reply("Usage: ,addaddy USERID TYPE ADDRESS");
    const [userId, type, ...addrArr] = args;
    const address = addrArr.join(" ");
    const t = type.toLowerCase();
    if (!["upi", "ltc", "usdt"].includes(t)) return message.reply("Type must be upi/ltc/usdt");
    if (!team[userId]) team[userId] = {};
    team[userId][t] = address;
    saveFile(teamPath, team);
    return message.reply(`✅ Saved ${t.toUpperCase()} for <@${userId}>: \`${address}\``);
  }

  // SHOW ADDY (helper): ,showaddy <userid>
  if (command === "showaddy") {
    const id = args[0] || message.author.id;
    const data = team[id];
    if (!data) return message.reply("❌ No addresses for that user.");
    const lines = Object.entries(data).map(([k, v]) => `**${k.toUpperCase()}**: \`${v}\``).join("\n");
    return message.reply({ embeds: [new EmbedBuilder().setTitle(`Addresses for ${id}`).setDescription(lines).setColor("#2ecc71")] });
  }

  // STATS
  if (command === "stats") {
    const embed = new EmbedBuilder()
      .setTitle("Bot Stats")
      .setColor("#e91e63")
      .setDescription(`**Guilds:** ${client.guilds.cache.size}\n**Users:** ${client.users.cache.size}\n**Uptime:** ${Math.floor(client.uptime / 1000 / 60)} mins\n**Memory:** ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB\n**Platform:** ${os.platform()} ${os.arch()}`)
      .setFooter({ text: "Made by Kai" });
    return message.reply({ embeds: [embed] });
  }

  // PING
  if (command === "ping") {
    const m = await message.reply("🏓 Pinging...");
    return m.edit(`🏓 Pong! Latency: ${m.createdTimestamp - message.createdTimestamp}ms | API: ${Math.round(client.ws.ping)}ms`);
  }

  // USERINFO
  if (command === "userinfo") {
    const user = message.mentions.users.first() || message.author;
    const member = message.guild?.members.cache.get(user.id);
    const embed = new EmbedBuilder()
      .setTitle(`User Info: ${user.tag}`)
      .setThumbnail(user.displayAvatarURL({ dynamic: true }))
      .setColor("#ffa500")
      .addFields(
        { name: "User ID", value: user.id, inline: true },
        { name: "Bot?", value: user.bot ? "Yes" : "No", inline: true },
        { name: "Status", value: member?.presence?.status || "offline", inline: true },
        { name: "Joined Server", value: member ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : "N/A", inline: true },
        { name: "Account Created", value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true }
      )
      .setFooter({ text: `${message.guild ? message.guild.name : "DM"} | Made by Kai` });
    return message.reply({ embeds: [embed] });
  }

  // NOTIFY (DM a mentioned user)
  if (command === "notify") {
    const user = message.mentions.users.first();
    const msg = args.slice(1).join(" ");
    if (!user || !msg) return message.reply("Usage: ,notify @user message");
    const channelLink = message.channel.toString();
    user.send(`📢 You have been notified by **${message.author.tag}** in ${channelLink}:\n\n${msg}`).catch(() => {});
    return message.reply(`✅ ${user.tag} has been notified.`);
  }

  // BROADCAST (owner-only from older flow) - keep owner check
  if (command === "broadcast") {
    if (message.author.id !== config.ownerId) return;
    const msg = args.join(" ");
    if (!msg) return message.reply("Usage: ,broadcast message");
    message.guild.members.cache.forEach(member => {
      if (!member.user.bot) member.send(`📣 Broadcast from **${message.guild.name}**:\n\n${msg}`).catch(() => {});
    });
    return message.reply("✅ Broadcast sent to all members.");
  }

  // CLEAR
  if (command === "clear") {
    if (!message.guild) return message.reply("❌ This command can only be used in servers.");
    const amount = parseInt(args[0]);
    if (!amount || amount < 1 || amount > 100) return message.reply("Usage: ,clear <1-100>");
    await message.channel.bulkDelete(amount, true).catch(() => message.reply("❌ Unable to delete messages."));
    const embed = simpleEmbed("Clear", `${message.author.tag} deleted ${amount} messages in ${message.channel}`, "#ffb86b");
    sendModLog(message.guild, embed);
    return message.reply(`✅ Deleted ${amount} messages`).then(msg => setTimeout(() => msg.delete().catch(() => {}), 3000));
  }

  // NUKE
  if (command === "nuke") {
    if (!message.guild) return message.reply("❌ This command can only be used in servers.");
    const channel = message.channel;
    const position = channel.position;
    const parent = channel.parent;
    const perms = channel.permissionOverwrites.cache.map(o => ({ id: o.id, allow: o.allow?.bitfield, deny: o.deny?.bitfield }));
    await channel.delete().catch(() => message.reply("❌ Unable to delete channel."));
    const newChannel = await message.guild.channels.create({
      name: channel.name,
      type: channel.type,
      parent: parent,
      permissionOverwrites: perms
    }).catch(err => { console.error(err); });
    if (newChannel) {
      await newChannel.setPosition(position).catch(() => {});
      const embed = simpleEmbed("Nuke", `${message.author.tag} nuked #${channel.name}`, "#ff4d4f");
      sendModLog(message.guild, embed);
      return;
    }
  }

  // SNIPE
  if (command === "snipe") {
    const s = snipes.get(message.channel.id);
    if (!s) return message.reply("❌ Nothing to snipe here!");
    const embed = new EmbedBuilder()
      .setAuthor({ name: s.authorTag, iconURL: s.avatar || undefined })
      .setDescription(s.content || "*[No text content]*")
      .setColor("#ff4757")
      .setFooter({ text: `Sniped by ${message.author.tag}` })
      .setTimestamp(s.time);
    if (s.image) embed.setImage(s.image);
    return message.reply({ embeds: [embed] });
  }

  // LOCK
  if (command === "lock") {
    if (!message.guild) return message.reply("❌ Server-only command.");
    await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false }).catch(() => {});
    const embed = simpleEmbed("Lock", `${message.author.tag} locked ${message.channel}`, "#a8071a");
    sendModLog(message.guild, embed);
    return message.reply("🔒 Channel locked.");
  }

  // UNLOCK
  if (command === "unlock") {
    if (!message.guild) return message.reply("❌ Server-only command.");
    await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: true }).catch(() => {});
    const embed = simpleEmbed("Unlock", `${message.author.tag} unlocked ${message.channel}`, "#389e0d");
    sendModLog(message.guild, embed);
    return message.reply("🔓 Channel unlocked.");
  }

  // SLOWMODE
  if (command === "slowmode") {
    if (!message.guild) return message.reply("❌ Server-only command.");
    const seconds = parseInt(args[0]);
    if (isNaN(seconds) || seconds < 0 || seconds > 21600) return message.reply("Usage: ,slowmode <0-21600>");
    await message.channel.setRateLimitPerUser(seconds).catch(() => {});
    const embed = simpleEmbed("Slowmode", `${message.author.tag} set slowmode to ${seconds}s in ${message.channel}`, "#096dd9");
    sendModLog(message.guild, embed);
    return message.reply(`🐢 Slowmode set to ${seconds}s.`);
  }

  // WARN
  if (command === "warn") {
    if (!message.guild) return message.reply("❌ Server-only command.");
    const user = message.mentions.users.first();
    const reason = args.slice(1).join(" ") || "No reason provided";
    if (!user) return message.reply("Usage: ,warn @user [reason]");
    if (!warnings[message.guild.id]) warnings[message.guild.id] = {};
    if (!warnings[message.guild.id][user.id]) warnings[message.guild.id][user.id] = [];
    warnings[message.guild.id][user.id].push({ moderator: message.author.id, reason, time: Date.now() });
    saveFile(warningsPath, warnings);
    const embed = new EmbedBuilder().setTitle("User Warned").setColor("#faad14")
      .addFields(
        { name: "User", value: `${user.tag} (${user.id})`, inline: true },
        { name: "Moderator", value: `${message.author.tag}`, inline: true },
        { name: "Reason", value: reason, inline: false }
      ).setTimestamp();
    sendModLog(message.guild, embed);
    return message.reply(`⚠️ ${user.tag} has been warned. Reason: ${reason}`);
  }

  // WARNINGS (show)
  if (command === "warnings") {
    if (!message.guild) return message.reply("❌ Server-only command.");
    const user = message.mentions.users.first();
    if (!user) return message.reply("Usage: ,warnings @user");
    const userWarns = (warnings[message.guild.id] && warnings[message.guild.id][user.id]) || [];
    if (userWarns.length === 0) return message.reply("✅ No warnings for this user.");
    const list = userWarns.map((w, i) => `${i + 1}. ${w.reason} — <@${w.moderator}> (${new Date(w.time).toLocaleString()})`).join("\n");
    return message.reply({ embeds: [new EmbedBuilder().setTitle(`${user.tag} — Warnings`).setDescription(list).setColor("#faad14")] });
  }

  // CLEARWARNINGS
  if (command === "clearwarnings") {
    if (!message.guild) return message.reply("❌ Server-only command.");
    const user = message.mentions.users.first();
    if (!user) return message.reply("Usage: ,clearwarnings @user");
    if (warnings[message.guild.id] && warnings[message.guild.id][user.id]) {
      warnings[message.guild.id][user.id] = [];
      saveFile(warningsPath, warnings);
    }
    const embed = simpleEmbed("Clear Warnings", `${message.author.tag} cleared warnings for ${user.tag}`, "#52c41a");
    sendModLog(message.guild, embed);
    return message.reply(`✅ Cleared warnings for ${user.tag}`);
  }

  // KICK
  if (command === "kick") {
    if (!message.guild) return message.reply("❌ Server-only command.");
    const member = message.mentions.members.first();
    const reason = args.slice(1).join(" ") || "No reason provided";
    if (!member) return message.reply("Usage: ,kick @user [reason]");
    await member.kick(reason).catch(() => message.reply("❌ Failed to kick user (missing permissions)."));
    const embed = simpleEmbed("Kick", `${message.author.tag} kicked ${member.user.tag}\nReason: ${reason}`, "#ff7a45");
    sendModLog(message.guild, embed);
    return message.reply(`👢 ${member.user.tag} was kicked. Reason: ${reason}`);
  }

  // BAN
  if (command === "ban") {
    if (!message.guild) return message.reply("❌ Server-only command.");
    const member = message.mentions.members.first();
    const reason = args.slice(1).join(" ") || "No reason provided";
    if (!member) return message.reply("Usage: ,ban @user [reason]");
    await member.ban({ reason }).catch(() => message.reply("❌ Failed to ban user (missing permissions)."));
    const embed = simpleEmbed("Ban", `${message.author.tag} banned ${member.user.tag}\nReason: ${reason}`, "#ff4d4f");
    sendModLog(message.guild, embed);
    return message.reply(`🔨 ${member.user.tag} was banned. Reason: ${reason}`);
  }

  // UNBAN
  if (command === "unban") {
    if (!message.guild) return message.reply("❌ Server-only command.");
    const id = args[0];
    if (!id) return message.reply("Usage: ,unban <userID>");
    await message.guild.members.unban(id).catch(() => message.reply("❌ Failed to unban (invalid ID or missing perms)."));
    const embed = simpleEmbed("Unban", `${message.author.tag} unbanned ${id}`, "#52c41a");
    sendModLog(message.guild, embed);
    return message.reply(`✅ Unbanned <@${id}>`);
  }

  // MUTE (timeout)
  if (command === "mute") {
    if (!message.guild) return message.reply("❌ Server-only command.");
    const member = message.mentions.members.first();
    if (!member) return message.reply("Usage: ,mute @user <duration>");
    const durStr = args[1];
    const msDur = durStr ? msParse(durStr) : null;
    const durText = durStr ? durStr : "default 10m";
    await member.timeout(msDur || 10 * 60 * 1000, `Muted by ${message.author.tag}`).catch(() => message.reply("❌ Failed to mute (missing permissions)."));
    const embed = simpleEmbed("Mute", `${message.author.tag} muted ${member.user.tag} for ${durText}`, "#722ed1");
    sendModLog(message.guild, embed);
    return message.reply(`🔇 Muted ${member.user.tag} ${msDur ? `for ${durText}` : "(default 10m)"}`);
  }

  // UNMUTE (remove timeout)
  if (command === "unmute") {
    if (!message.guild) return message.reply("❌ Server-only command.");
    const member = message.mentions.members.first();
    if (!member) return message.reply("Usage: ,unmute @user");
    await member.timeout(null).catch(() => message.reply("❌ Failed to remove timeout (missing permissions)."));
    const embed = simpleEmbed("Unmute", `${message.author.tag} removed timeout for ${member.user.tag}`, "#00b894");
    sendModLog(message.guild, embed);
    return message.reply(`🔊 Unmuted ${member.user.tag}`);
  }

  // SERVERINFO
  if (command === "serverinfo") {
    if (!message.guild) return message.reply("❌ Server-only command.");
    const g = message.guild;
    const embed = new EmbedBuilder()
      .setTitle(`${g.name} • Server Info`)
      .setThumbnail(g.iconURL({ dynamic: true }))
      .setColor("#00bfff")
      .addFields(
        { name: "Server ID", value: g.id, inline: true },
        { name: "Owner", value: `<@${g.ownerId}>`, inline: true },
        { name: "Members", value: `${g.memberCount}`, inline: true },
        { name: "Channels", value: `${g.channels.cache.size}`, inline: true }
      );
    return message.reply({ embeds: [embed] });
  }

  // SAY (embed)
  if (command === "say") {
    const text = args.join(" ");
    if (!text) return message.reply("Usage: ,say <message>");
    return message.channel.send({ embeds: [new EmbedBuilder().setDescription(text).setColor("#00ffcc")] });
  }

  // POLL (thumbs up/down)
  if (command === "poll") {
    const question = args.join(" ");
    if (!question) return message.reply("Usage: ,poll <question>");
    const pollEmb = new EmbedBuilder().setTitle("📊 Poll").setDescription(question).setColor("#5865f2");
    const pollMsg = await message.reply({ embeds: [pollEmb] });
    await pollMsg.react("👍");
    await pollMsg.react("👎");
    return;
  }

  // AVATAR
  if (command === "avatar") {
    const user = message.mentions.users.first() || message.author;
    const embed = new EmbedBuilder().setTitle(`${user.tag} • Avatar`).setImage(user.displayAvatarURL({ size: 1024, dynamic: true })).setColor("#ff69b4");
    return message.reply({ embeds: [embed] });
  }

  // MODLOG set
  if (command === "modlog") {
    if (!message.guild) return message.reply("❌ Server-only command.");
    const channelId = args[0];
    if (!channelId) return message.reply("Usage: ,modlog <channelID>");
    modlogs[message.guild.id] = channelId;
    saveFile(modlogPath, modlogs);
    return message.reply(`✅ Mod-log channel set to <#${channelId}>`);
  }

  // HELP
  if (command === "help") {
    const embed = new EmbedBuilder()
      .setTitle("Assistant Bot Commands")
      .setColor("#00ffff")
      .setDescription("Prefix: `,` • Support role required for most commands.")
      .addFields(
        { name: "Payments", value: ",upi ,ltc ,usdt (show saved)", inline: false },
        { name: "Utility", value: ",calc ,remind ,vouch ,notify ,snipe ,say ,poll ,avatar", inline: false },
        { name: "Info", value: ",stats ,ping ,userinfo ,serverinfo", inline: false },
        { name: "Moderation", value: ",clear ,nuke ,lock ,unlock ,slowmode ,warn ,warnings ,clearwarnings ,kick ,ban ,unban ,mute ,unmute ,modlog", inline: false },
        { name: "Owner", value: ",addaddy ,broadcast", inline: false }
      )
      .setFooter({ text: "Made by Kai" });
    return message.reply({ embeds: [embed] });
  }

  // Unknown command: ignore
});

// ---------- Interaction (button) handler ----------
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;
  const [kind] = interaction.customId.split("-");
  if (!kind) return;
  // handle copy buttons => ephemeral reply with content
  if (interaction.customId.startsWith("copy-")) {
    const teamData = ensureFile(teamPath, {});
    const userData = teamData[interaction.user.id] || {};
    const key = interaction.customId.split("-")[1]; // e.g., upi, ltc, vouch, etc.
    // vouch is embedded in message; others are from saved team data
    let content = null;
    if (key === "vouch") {
      content = interaction.message.embeds[0]?.description || null;
    } else {
      content = userData[key] || null;
    }
    if (!content) return interaction.reply({ content: "No data found to copy.", ephemeral: true });
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
