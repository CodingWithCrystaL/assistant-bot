const { 
  Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle 
} = require("discord.js");
const math = require("mathjs");
const fs = require("fs");
const express = require("express");
const os = require("os");
const config = require("./config.js");
const path = "./team.json";

// ================== EXPRESS KEEP-ALIVE ==================
const app = express();
app.get("/", (req, res) => res.send("Bot is alive!"));
app.listen(process.env.PORT || 3000, () => console.log("✅ KeepAlive server running"));

// ================== PREFIX ==================
const prefix = ",";

// ================== CLIENT ==================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel, Partials.GuildMember]
});

// ================== HELPERS ==================
function parseTime(str) {
  const match = str.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return null;
  const num = parseInt(match[1]);
  const unit = match[2];
  const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return num * multipliers[unit];
}

function isSupport(member) {
  return member?.roles?.cache?.has(config.supportRole);
}

function loadTeam() { 
  if (!fs.existsSync(path)) fs.writeFileSync(path, "{}");
  return JSON.parse(fs.readFileSync(path, "utf-8")); 
}

function saveTeam(data) { 
  fs.writeFileSync(path, JSON.stringify(data, null, 2)); 
}

// ================== ROTATING STATUS ==================
const statuses = [
  "I put the 'pro' in procrastination",
  "Sarcasm is my love language",
  "I'm not arguing, I'm explaining why I'm right",
  "I'm silently correcting your grammar",
  "I love deadlines. I love the whooshing sound they make as they fly by"
];
let statusIndex = 0;

client.on("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  setInterval(() => {
    try {
      client.user.setActivity(statuses[statusIndex], { type: "WATCHING" });
    } catch (err) { console.error("Status error:", err); }
    statusIndex = (statusIndex + 1) % statuses.length;
  }, 30000);
});

// ================== PREFIX COMMAND HANDLER ==================
client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();
  const team = loadTeam();

  const supportOnly = ["calc","upi","ltc","usdt","vouch","remind","userinfo","stats","ping","notify","clear","nuke"];
  if (supportOnly.includes(command) && message.guild && !isSupport(message.member)) 
    return message.reply("❌ Only support role can use this command.");

  // -------------------- CALCULATOR --------------------
  if (command === "calc") {
    try { 
      const expr = args.join(" ");
      if(!expr) return message.reply("Provide expression to calculate.");
      return message.reply(`🧮 Result: **${math.evaluate(expr)}**`);
    } catch { return message.reply("Invalid expression."); }
  }

  // -------------------- PAYMENT COMMANDS --------------------
  if (["upi","ltc","usdt"].includes(command)) {
    const data = team[message.author.id];
    if(!data || !data[command]) return message.reply("❌ No saved address found.");
    const embed = new EmbedBuilder()
      .setTitle(`${command.toUpperCase()} Address`)
      .setDescription(`\`\`\`${data[command]}\`\`\``)
      .setColor("#2ecc71")
      .setFooter({ text: `${message.guild ? message.guild.name : "DM"} | Made by Kai` });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel("Copy Address").setStyle(ButtonStyle.Secondary).setCustomId(`copy-${command}`)
    );
    return message.reply({ embeds:[embed], components:[row] });
  }

  // -------------------- REMIND --------------------
  if (command === "remind") {
    const user = message.mentions.users.first();
    const delay = parseTime(args[0]);
    const msg = args.slice(1).join(" ");
    if (!user || !delay || !msg) return message.reply("Usage: ,remind @user 10s message");
    message.reply(`✅ Reminder set for ${user.tag} in ${args[0]}`);
    setTimeout(()=>{ user.send(`⏰ Reminder: ${msg}`).catch(()=>{}); }, delay);
  }

  // -------------------- VOUCH --------------------
  if (command === "vouch") {
    if (args.length < 2) return message.reply("Usage: ,vouch <product> <price>");
    const price = args.pop();
    const product = args.join(" ");
    const embed = new EmbedBuilder()
      .setDescription(`+rep ${message.author.id} | Legit Purchased ${product} For ${price}`)
      .setColor("#0099ff")
      .setFooter({ text: `${message.guild.name} | Made by Kai` });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel("Copy Vouch").setStyle(ButtonStyle.Secondary).setCustomId("copy-vouch")
    );
    return message.reply({ embeds:[embed], components:[row] });
  }

  // -------------------- ADD ADDY (OWNER) --------------------
  if (command === "addaddy") {
    if (message.author.id !== config.ownerId) return;
    if (args.length < 3) return message.reply("Usage: ,addaddy USERID TYPE ADDRESS");
    const [userId,type,...addrArr] = args;
    const address = addrArr.join(" ");
    if (!["upi","ltc","usdt"].includes(type.toLowerCase())) return message.reply("Type must be upi/ltc/usdt");
    if (!team[userId]) team[userId]={};
    team[userId][type.toLowerCase()] = address;
    saveTeam(team);
    return message.reply(`✅ Saved ${type.toUpperCase()} for <@${userId}>: ${address}`);
  }

  // -------------------- STATS --------------------
  if (command === "stats") {
    const embed = new EmbedBuilder()
      .setTitle("Bot Stats")
      .setColor("#e91e63")
      .setDescription(`
**Guilds:** ${client.guilds.cache.size}
**Users:** ${client.users.cache.size}
**Uptime:** ${Math.floor(client.uptime/1000/60)} mins
**Memory Usage:** ${(process.memoryUsage().heapUsed/1024/1024).toFixed(2)} MB
**Platform:** ${os.platform()} ${os.arch()}
      `)
      .setFooter({ text: "Made by Kai" });
    return message.reply({ embeds:[embed] });
  }

  // -------------------- PING --------------------
  if (command === "ping") {
    const m = await message.reply("🏓 Pinging...");
    return m.edit(`🏓 Pong! Latency is ${m.createdTimestamp - message.createdTimestamp}ms. API Latency is ${Math.round(client.ws.ping)}ms`);
  }

  // -------------------- USERINFO --------------------
  if (command === "userinfo") {
    let user = message.mentions.users.first() || message.author;
    const member = message.guild?.members.cache.get(user.id);
    const embed = new EmbedBuilder()
      .setTitle(`User Info: ${user.tag}`)
      .setThumbnail(user.displayAvatarURL({ dynamic:true }))
      .setColor("#ffa500")
      .addFields(
        { name:"User ID", value: user.id, inline:true },
        { name:"Bot?", value: user.bot ? "Yes" : "No", inline:true },
        { name:"Status", value: member?.presence?.status || "offline", inline:true },
        { name:"Joined Server", value: member ? `<t:${Math.floor(member.joinedTimestamp/1000)}:R>` : "N/A", inline:true },
        { name:"Account Created", value: `<t:${Math.floor(user.createdTimestamp/1000)}:R>`, inline:true }
      )
      .setFooter({ text:`${message.guild ? message.guild.name : "DM"} | Made by Kai` });
    return message.reply({ embeds:[embed] });
  }

  // -------------------- NOTIFY --------------------
  if (command === "notify") {
    const user = message.mentions.users.first();
    const msg = args.slice(1).join(" ");
    if (!user || !msg) return message.reply("Usage: ,notify @user message");
    const channelLink = message.channel.toString();
    user.send(`📢 You have been notified by **${message.author.tag}** in ${channelLink}:\n\n${msg}`).catch(()=>{});
    return message.reply(`✅ ${user.tag} has been notified.`);
  }

  // -------------------- BROADCAST (OWNER) --------------------
  if (command === "broadcast") {
    if (message.author.id !== config.ownerId) return;
    const msg = args.join(" ");
    if (!msg) return message.reply("Usage: ,broadcast message");
    message.guild.members.cache.forEach(member => {
      if(!member.user.bot) member.send(`📣 Broadcast from **${message.guild.name}**:\n\n${msg}`).catch(()=>{});
    });
    return message.reply("✅ Broadcast sent to all members.");
  }

  // -------------------- CLEAR --------------------
  if (command === "clear") {
    if (!message.guild) return message.reply("❌ This command can only be used in servers.");
    const amount = parseInt(args[0]);
    if (!amount || amount < 1 || amount > 100) return message.reply("Usage: ,clear <1-100>");
    await message.channel.bulkDelete(amount, true).catch(err => message.reply("❌ Unable to delete messages."));
    return message.reply(`✅ Deleted ${amount} messages`).then(msg => setTimeout(() => msg.delete().catch(()=>{}), 3000));
  }

  // -------------------- NUKE --------------------
  if (command === "nuke") {
    if (!message.guild) return message.reply("❌ This command can only be used in servers.");
    const channel = message.channel;
    const position = channel.position;
    const parent = channel.parent;
    const perms = channel.permissionOverwrites.cache.map(o => ({
      id: o.id,
      allow: o.allow.bitfield,
      deny: o.deny.bitfield
    }));
    await channel.delete().catch(err => message.reply("❌ Unable to delete channel."));
    const newChannel = await message.guild.channels.create({
      name: channel.name,
      type: channel.type,
      parent: parent,
      permissionOverwrites: perms
    }).catch(err => console.error(err));
    if(newChannel) newChannel.setPosition(position).catch(()=>{});
  }

  // -------------------- HELP --------------------
  if (command === "help") {
    const embed = new EmbedBuilder()
      .setTitle("Assistant Bot Commands")
      .setColor("#00ffff")
      .setDescription("Prefix: `,`\nSupport role required for commands unless noted otherwise.")
      .addFields(
        { name:"💳 Payments", value: ",upi, ,ltc, ,usdt", inline:true },
        { name:"🧮 Utility", value: ",calc, ,remind, ,vouch, ,notify", inline:true },
        { name:"ℹ️ Info", value: ",stats, ,ping, ,userinfo", inline:true },
        { name:"🧹 Moderation", value: ",clear, ,nuke", inline:true },
        { name:"⚙ Owner", value: ",addaddy, ,broadcast", inline:true }
      )
      .setFooter({ text:"Made by Kai" });
    return message.reply({ embeds:[embed] });
  }
});

// ================== COPY BUTTON HANDLER ==================
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;
  const team = loadTeam();
  let content;
  const [action,type] = interaction.customId.split("-");
  if(type === "vouch") content = interaction.message.embeds[0]?.description;
  else { const data = team[interaction.user.id]; if(data && data[type]) content = data[type]; }
  if(!content) return;
  await interaction.reply({ content, ephemeral:true }).catch(()=>{});
});

// ================== LOGIN ==================
client.login(process.env.TOKEN);
