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
      return message.reply(`Result: **${result}**`);
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
      .setDescription(`\`\`\`${data[command]}\`\`\``)
      .setColor("#2ecc71")
      .setFooter({ text: `${message.guild.name} | Made by Kai` });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel("Copy Address").setStyle(ButtonStyle.Secondary).setCustomId(`copy-${command}`)
    );

    const sent = await message.reply({ embeds: [embed], components: [row] });
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

    await message.reply(`⏰ Reminder set for ${user.tag} in **${timeArg}**.`);

    setTimeout(async () => {
      try {
        await user.send(`Reminder: ${reminderMsg}`);
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
      .setColor("#0099ff")
      .setFooter({ text: `${message.guild.name} | Made by Kai` });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel("Copy Vouch").setStyle(ButtonStyle.Secondary).setCustomId("copy-vouch")
    );

    const sent = await message.reply({ embeds: [embed], components: [row] });
  }
});

// ✅ Handle copy button interactions
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  const [action, type] = interaction.customId.split("-");

  if (action === "copy") {
    let contentToCopy;

    if (type === "vouch") {
      contentToCopy = interaction.message.embeds[0]?.description;
    } else {
      const cmd = type; // usdt, upi, ltc
      const userData = config.team[interaction.user.id];
      if (userData && userData[cmd]) contentToCopy = userData[cmd];
    }

    if (!contentToCopy) return interaction.reply({ content: "❌ Nothing to copy.", ephemeral: true });

    await interaction.reply({ content: contentToCopy, ephemeral: true });
  }
});

// ✅ Login
client.login(process.env.TOKEN);
