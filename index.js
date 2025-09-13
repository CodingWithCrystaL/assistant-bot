const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");
const math = require("mathjs");
const express = require("express");
const fs = require("fs");
const path = require("path");
const config = require("./config.js");

// ---------- Express Keep-Alive ----------
const app = express();
app.get("/", (req, res) => res.send("Bot is alive!"));
app.listen(process.env.PORT || 3000, () => console.log("✅ KeepAlive server running"));

// ---------- Prefix ----------
const prefix = ",";

// ---------- Bot Client ----------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel, Partials.GuildMember]
});

// ---------- Team JSON ----------
const teamPath = path.join(__dirname, "team.json");
function getTeamData() {
  if (!fs.existsSync(teamPath)) return {};
  return JSON.parse(fs.readFileSync(teamPath));
}
function saveTeamData(data) {
  fs.writeFileSync(teamPath, JSON.stringify(data, null, 2));
}

// ---------- Helper: parse time ----------
function parseTime(str) {
  const match = str.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return null;
  const num = parseInt(match[1]);
  const unit = match[2];
  const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return num * multipliers[unit];
}

// ---------- Check support role ----------
function isSupport(member) {
  return member?.roles?.cache?.has(config.supportRole);
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
client.on("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  setInterval(() => {
    const status = statuses[statusIndex];
    client.user.setActivity(status, { type: "WATCHING" }).catch(console.error);
    statusIndex = (statusIndex + 1) % statuses.length;
  }, 30000);
});

// ---------- Command Handler ----------
client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.content.startsWith(prefix)) return;
  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  // Load team data
  let team = getTeamData();

  // ---------- Owner Command: addaddy ----------
  if (command === "addaddy") {
    if (message.author.id !== config.ownerId)
      return message.reply("❌ Only the bot owner can use this command.");

    if (args.length < 3)
      return message.reply("Usage: ,addaddy <UserID> <type> <address>");

    const [userId, type, ...addressParts] = args;
    const address = addressParts.join(" ");

    if (!["upi", "ltc", "usdt"].includes(type.toLowerCase()))
      return message.reply("❌ Type must be one of: upi, ltc, usdt");

    if (!team[userId]) team[userId] = {};
    team[userId][type.toLowerCase()] = address;

    saveTeamData(team);
    return message.reply(`✅ Successfully added/updated ${type.toUpperCase()} for <@${userId}>: \`${address}\``);
  }

  // ---------- Support-Only Commands ----------
  const supportOnlyCommands = ["calc", "vouch"];
  if (supportOnlyCommands.includes(command) && !isSupport(message.member)) {
    return message.reply("❌ Only support team members can use this command.");
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

  // 💳 Payment Commands (anyone in team can use their own data)
  if (["upi", "ltc", "usdt"].includes(command)) {
    const userData = team[message.author.id];
    if (!userData || !userData[command])
      return message.reply("❌ No saved address found for you.");

    const embed = new EmbedBuilder()
      .setTitle(`${command.toUpperCase()} Address`)
      .setDescription(`\`\`\`${userData[command]}\`\`\``)
      .setColor("#2ecc71")
      .setFooter({ text: `${message.guild.name} | Made by Kai` });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("Copy Address")
        .setStyle(ButtonStyle.Secondary)
        .setCustomId(`copy-${command}`)
    );

    await message.reply({ embeds: [embed], components: [row] });
  }

  // ⏰ Remind command (anyone)
  if (command === "remind") {
    const user = message.mentions.users.first();
    if (!user) return message.reply("Mention a user to remind.");

    const timeArg = args[0];
    const delay = parseTime(timeArg);
    if (!delay) return message.reply("Invalid time format. Use `10s`, `5m`, `2h`, `1d`.");

    const reminderMsg = args.slice(1).join(" ");
    if (!reminderMsg) return message.reply("Provide a reminder message.");

    await message.reply(`✅ Reminder set for ${user.tag} in **${timeArg}**.`);
    setTimeout(async () => {
      try {
        await user.send(`⏰ Reminder: ${reminderMsg}`);
      } catch (err) {
        console.error("Failed to DM user:", err);
      }
    }, delay);
  }

  // ✅ Vouch command (support only)
  if (command === "vouch") {
    if (args.length < 2) return message.reply("Usage: ,vouch <productName> <price>");
    const price = args[args.length - 1];
    const product = args.slice(0, -1).join(" ");
    const vouchText = `+rep ${message.author.id} | Legit Purchased ${product} For ${price}`;

    const embed = new EmbedBuilder()
      .setDescription(vouchText)
      .setColor("#0099ff")
      .setFooter({ text: `${message.guild.name} | Made by Kai` });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("Copy Vouch")
        .setStyle(ButtonStyle.Secondary)
        .setCustomId("copy-vouch")
    );

    await message.reply({ embeds: [embed], components: [row] });
  }
});

// ---------- Button Interactions ----------
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  const [action, type] = interaction.customId.split("-");
  if (action === "copy") {
    let contentToCopy;
    let team = getTeamData();

    if (type === "vouch") {
      contentToCopy = interaction.message.embeds[0]?.description;
    } else {
      const userData = team[interaction.user.id];
      if (userData && userData[type]) contentToCopy = userData[type];
    }

    if (!contentToCopy) return;

    try {
      await interaction.reply({ content: contentToCopy, ephemeral: true });
    } catch {
      console.log("⚠️ Interaction failed: unknown interaction");
    }
  }
});

// ---------- Login ----------
client.login(process.env.TOKEN);
