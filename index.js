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
const config = require("./config.js");

// ✅ Express Keep-Alive
const app = express();
app.get("/", (req, res) => res.send("Bot is alive!"));
app.listen(process.env.PORT || 3000, () => console.log("✅ KeepAlive server running"));

// ✅ Prefix
const prefix = ",";

// ✅ Bot Client
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel]
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

// ✅ Check support role
function isSupport(member) {
  return member.roles.cache.has(config.supportRole);
}

// ✅ Command Handler
client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  if (!isSupport(message.member)) {
    return message.reply("❌ Only support team members can use this command.");
  }

  // 🧮 Calculator
  if (command === "calc") {
    try {
      const expression = args.join(" ");
      if (!expression) return message.reply("❌ Please provide a math expression.");
      const result = math.evaluate(expression);
      return message.reply(`🧮 Result: **${result}**`);
    } catch {
      return message.reply("⚠️ Invalid expression.");
    }
  }

  // 💳 Payment Commands
  if (["upi", "ltc", "usdt"].includes(command)) {
    const data = config.team[message.author.id];
    if (!data || !data[command]) return message.reply("❌ No saved address for this command.");

    const embed = new EmbedBuilder()
      .setTitle(`${command.toUpperCase()} Address`)
      .setDescription(`Here’s your **${command.toUpperCase()}**:\n\`\`\`${data[command]}\`\`\``)
      .setColor("#2ecc71");

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel("Copy Address").setStyle(ButtonStyle.Secondary).setCustomId("copy-address")
    );

    const sent = await message.reply({ embeds: [embed], components: [row] });
    const collector = sent.createMessageComponentCollector({ time: 60000 });
    collector.on("collect", async (i) => {
      if (i.customId === "copy-address" && i.user.id === message.author.id) {
        await i.reply({ content: `📋 Copied: \`${data[command]}\``, ephemeral: true });
      }
    });
  }

  // ⏰ Remind command
  if (command === "remind") {
    const user = message.mentions.users.first();
    if (!user) return message.reply("❌ Mention a user to remind.");

    const timeArg = args[0];
    const delay = parseTime(timeArg);
    if (!delay) return message.reply("❌ Invalid time format. Use `10s`, `5m`, `2h`, `1d`.");

    const reminderMsg = args.slice(1).join(" ");
    if (!reminderMsg) return message.reply("❌ Provide a reminder message.");

    await message.reply(`⏰ Reminder set! I will DM ${user} in **${timeArg}**.`);
    setTimeout(async () => {
      try {
        await user.send(`🔔 Reminder from **${message.guild.name}**:\n**${reminderMsg}**`);
      } catch (err) {
        console.error("Failed to DM user:", err);
      }
    }, delay);
  }

  // ✅ Vouch command
  if (command === "vouch") {
    const product = args[0];
    const price = args[1];
    if (!product || !price) return message.reply("❌ Usage: ,vouch <productName> <price>");

    const vouchText = `+rep (${message.author.id}) | Legit Purchased ${product} For ${price}`;
    const embed = new EmbedBuilder()
      .setDescription(vouchText)
      .setColor("#0099ff");

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel("Copy Vouch").setStyle(ButtonStyle.Secondary).setCustomId("copy-vouch")
    );

    const sent = await message.reply({ embeds: [embed], components: [row] });
    const collector = sent.createMessageComponentCollector({ time: 60000 });
    collector.on("collect", async (i) => {
      if (i.customId === "copy-vouch") {
        await i.reply({ content: `📋 Copied: \`${vouchText}\``, ephemeral: true });
      }
    });
  }
});

// ✅ Login (from hosting environment variable)
client.login(process.env.TOKEN);
