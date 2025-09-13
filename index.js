const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const math = require("mathjs");
const fs = require("fs");
const express = require("express");
const config = require("./config.js");
const path = "./team.json";

// ✅ Express Keep-Alive
const app = express();
app.get("/", (req, res) => res.send("Bot is alive!"));
app.listen(process.env.PORT || 3000, () => console.log("✅ KeepAlive server running"));

// ✅ Prefix
const prefix = ",";

// ✅ Bot Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel, Partials.GuildMember]
});

// ✅ Helper: parse time for reminders
function parseTime(str) {
  const match = str.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return null;
  const num = parseInt(match[1]);
  const unit = match[2];
  const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return num * multipliers[unit];
}

// ✅ Load team.json safely
function loadTeam() {
  if (!fs.existsSync(path)) fs.writeFileSync(path, "{}");
  return JSON.parse(fs.readFileSync(path, "utf-8"));
}

// ✅ Save team.json safely
function saveTeam(data) {
  fs.writeFileSync(path, JSON.stringify(data, null, 2));
}

// ✅ Check support role
function isSupport(member) {
  return member?.roles?.cache?.has(config.supportRole);
}

// ✅ Check permissions (servers vs DMs)
function hasPermission(message, command) {
  const team = loadTeam();
  const userId = message.author.id;

  // Owner can use anything
  if (userId === config.ownerId) return true;

  // In DMs, only owner allowed
  if (!message.guild) return false;

  // Server permissions
  const teamCommands = ["vouch", "upi", "ltc", "usdt"];
  if (team[userId] && teamCommands.includes(command)) return true;

  if (isSupport(message.member)) return true;

  return false;
}

// ✅ Rotating statuses
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
    } catch (err) {
      console.error("Failed to set status:", err);
    }
    statusIndex = (statusIndex + 1) % statuses.length;
  }, 30000);
});

// ✅ Command Handler
client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();
  const team = loadTeam();

  // Owner-only command: addaddy
  if (command === "addaddy") {
    if (message.author.id !== config.ownerId) return;
    if (args.length < 3) return message.reply("Usage: ,addaddy USERID TYPE ADDRESS");

    const [userId, type, ...addressArr] = args;
    const address = addressArr.join(" ");
    if (!["upi", "ltc", "usdt"].includes(type.toLowerCase())) return message.reply("Type must be upi, ltc, or usdt");

    if (!team[userId]) team[userId] = {};
    team[userId][type.toLowerCase()] = address;
    saveTeam(team);

    return message.reply(`✅ Saved ${type.toUpperCase()} for <@${userId}>: \`${address}\``);
  }

  // Permissions check
  if (!hasPermission(message, command)) {
    return message.reply("❌ You do not have permission to use this command.");
  }

  // 🧮 Calculator
  if (command === "calc") {
    try {
      const expression = args.join(" ");
      if (!expression) return message.reply("Please provide a math expression.");
      const result = math.evaluate(expression);
      return message.reply(`Result: **${result}**`);
    } catch {
      return message.reply("Invalid expression.");
    }
  }

  // 💳 Payment commands
  if (["upi", "ltc", "usdt"].includes(command)) {
    const data = team[message.author.id];
    if (!data || !data[command]) return message.reply("❌ No saved address found for you.");
    const embed = new EmbedBuilder()
      .setTitle(`${command.toUpperCase()} Address`)
      .setDescription(`\`\`\`${data[command]}\`\`\``)
      .setColor("#2ecc71")
      .setFooter({ text: `${message.guild ? message.guild.name : "DM"} | Made by Kai` });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("Copy Address")
        .setStyle(ButtonStyle.Secondary)
        .setCustomId(`copy-${command}`)
    );

    return message.reply({ embeds: [embed], components: [row] });
  }

  // ⏰ Remind command
  if (command === "remind") {
    const user = message.mentions.users.first();
    if (!user) return message.reply("Mention a user to remind.");
    const delay = parseTime(args[0]);
    if (!delay) return message.reply("Invalid time format. Use 10s, 5m, 2h, 1d.");
    const msg = args.slice(1).join(" ");
    if (!msg) return message.reply("Provide a reminder message.");

    message.reply(`✅ Reminder set for ${user.tag} in **${args[0]}**.`);
    setTimeout(() => {
      user.send(`⏰ Reminder: ${msg}`).catch(() => console.error("Failed to DM user"));
    }, delay);
  }

  // ✅ Vouch command
  if (command === "vouch") {
    if (args.length < 2) return message.reply("Usage: ,vouch <product> <price>");
    const price = args[args.length - 1];
    const product = args.slice(0, -1).join(" ");

    const embed = new EmbedBuilder()
      .setDescription(`+rep ${message.author.id} | Legit Purchased ${product} For ${price}`)
      .setColor("#0099ff")
      .setFooter({ text: `${message.guild ? message.guild.name : "DM"} | Made by Kai` });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("Copy Vouch")
        .setStyle(ButtonStyle.Secondary)
        .setCustomId("copy-vouch")
    );

    return message.reply({ embeds: [embed], components: [row] });
  }
});

// ✅ Button Interaction Handler
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;
  const [action, type] = interaction.customId.split("-");
  const team = loadTeam();
  let content;

  if (type === "vouch") content = interaction.message.embeds[0]?.description;
  else {
    const data = team[interaction.user.id];
    if (data && data[type]) content = data[type];
  }

  if (!content) return;

  try {
    await interaction.reply({ content, ephemeral: true });
  } catch (err) {
    console.error("Button reply failed:", err);
  }
});

// ✅ Login
client.login(process.env.TOKEN);
