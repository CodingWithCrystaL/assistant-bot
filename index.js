const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, REST, Routes, SlashCommandBuilder } = require("discord.js");
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

// ✅ Helper: parse time
function parseTime(str) {
  const match = str.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return null;
  const num = parseInt(match[1]);
  const unit = match[2];
  const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return num * multipliers[unit];
}

// ✅ Support role check
function isSupport(member) {
  return member?.roles?.cache?.has(config.supportRole);
}

// ✅ Load team.json safely
function loadTeam() {
  if (!fs.existsSync(path)) fs.writeFileSync(path, "{}");
  return JSON.parse(fs.readFileSync(path, "utf-8"));
}
function saveTeam(data) {
  fs.writeFileSync(path, JSON.stringify(data, null, 2));
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

client.on("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  setInterval(() => {
    try { client.user.setActivity(statuses[statusIndex], { type: "WATCHING" }); } catch (err) { console.error(err); }
    statusIndex = (statusIndex + 1) % statuses.length;
  }, 30000);

  // Register slash commands for DMs (owner only)
  const commands = [
    new SlashCommandBuilder().setName("calc").setDescription("Evaluate a math expression").addStringOption(opt => opt.setName("expression").setDescription("Math expression").setRequired(true)),
    new SlashCommandBuilder().setName("upi").setDescription("Get your UPI address"),
    new SlashCommandBuilder().setName("ltc").setDescription("Get your LTC address"),
    new SlashCommandBuilder().setName("usdt").setDescription("Get your USDT address"),
    new SlashCommandBuilder().setName("vouch").setDescription("Create a vouch").addStringOption(opt => opt.setName("product").setDescription("Product name").setRequired(true)).addStringOption(opt => opt.setName("price").setDescription("Price").setRequired(true)),
    new SlashCommandBuilder().setName("remind").setDescription("Remind a user").addUserOption(opt => opt.setName("user").setDescription("User to remind").setRequired(true)).addStringOption(opt => opt.setName("time").setDescription("Time like 10s, 5m").setRequired(true)).addStringOption(opt => opt.setName("message").setDescription("Reminder message").setRequired(true)),
    new SlashCommandBuilder().setName("addaddy").setDescription("Owner only: Add team address").addStringOption(opt => opt.setName("userid").setDescription("User ID").setRequired(true)).addStringOption(opt => opt.setName("type").setDescription("upi/ltc/usdt").setRequired(true)).addStringOption(opt => opt.setName("address").setDescription("Address").setRequired(true))
  ].map(cmd => cmd.toJSON());

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
  console.log("✅ Slash commands registered for DMs");
});

// ✅ Prefix commands for servers
client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild || !message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();
  const team = loadTeam();

  const supportOnly = ["calc", "upi", "ltc", "usdt", "vouch"];
  if (supportOnly.includes(command) && !isSupport(message.member)) return message.reply("Only support team members can use this command.");

  // Calculator
  if (command === "calc") {
    try {
      const expr = args.join(" ");
      if (!expr) return message.reply("Provide expression");
      return message.reply(`Result: **${math.evaluate(expr)}**`);
    } catch { return message.reply("Invalid expression"); }
  }

  // Payment commands
  if (["upi","ltc","usdt"].includes(command)) {
    const data = team[message.author.id];
    if (!data || !data[command]) return message.reply("❌ No saved address found");
    const embed = new EmbedBuilder()
      .setTitle(`${command.toUpperCase()} Address`)
      .setDescription(`\`\`\`${data[command]}\`\`\``)
      .setColor("#2ecc71")
      .setFooter({ text: `${message.guild.name} | Made by Kai` });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel("Copy Address").setStyle(ButtonStyle.Secondary).setCustomId(`copy-${command}`)
    );
    return message.reply({ embeds:[embed], components:[row] });
  }

  // Remind
  if (command === "remind") {
    const user = message.mentions.users.first();
    if (!user) return message.reply("Mention a user");
    const delay = parseTime(args[0]);
    if (!delay) return message.reply("Invalid time format");
    const msg = args.slice(1).join(" ");
    if (!msg) return message.reply("Provide message");
    message.reply(`✅ Reminder set for ${user.tag} in ${args[0]}`);
    setTimeout(() => { user.send(`⏰ Reminder: ${msg}`).catch(()=>{}); }, delay);
  }

  // Vouch
  if (command === "vouch") {
    if (args.length<2) return message.reply("Usage: ,vouch <product> <price>");
    const price = args.pop();
    const product = args.join(" ");
    const embed = new EmbedBuilder().setDescription(`+rep ${message.author.id} | Legit Purchased ${product} For ${price}`).setColor("#0099ff").setFooter({ text:`${message.guild.name} | Made by Kai` });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel("Copy Vouch").setStyle(ButtonStyle.Secondary).setCustomId("copy-vouch")
    );
    return message.reply({ embeds:[embed], components:[row] });
  }

  // Owner-only addaddy
  if (command === "addaddy") {
    if (message.author.id !== config.ownerId) return;
    if (args.length<3) return message.reply("Usage: ,addaddy USERID TYPE ADDRESS");
    const [userId,type,...addrArr] = args;
    const address = addrArr.join(" ");
    if (!["upi","ltc","usdt"].includes(type.toLowerCase())) return message.reply("Type must be upi/ltc/usdt");
    if (!team[userId]) team[userId]={};
    team[userId][type.toLowerCase()] = address;
    saveTeam(team);
    return message.reply(`✅ Saved ${type.toUpperCase()} for <@${userId}>: ${address}`);
  }
});

// ✅ Slash commands for owner in DMs
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.channel.type !== 1) return; // Only DMs
  if (interaction.user.id !== config.ownerId) return interaction.reply({ content:"❌ Only owner can use in DMs", ephemeral:true });

  const team = loadTeam();
  const cmd = interaction.commandName;

  // Calculator
  if (cmd==="calc") {
    const expr = interaction.options.getString("expression");
    try { await interaction.reply(`Result: **${math.evaluate(expr)}**`); } catch { await interaction.reply("Invalid expression"); }
  }

  // Payment
  if (["upi","ltc","usdt"].includes(cmd)) {
    const data = team[interaction.user.id];
    if (!data || !data[cmd]) return interaction.reply({ content:"❌ No saved address found", ephemeral:true });
    const embed = new EmbedBuilder().setTitle(`${cmd.toUpperCase()} Address`).setDescription(`\`\`\`${data[cmd]}\`\`\``).setColor("#2ecc71");
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel("Copy Address").setStyle(ButtonStyle.Secondary).setCustomId(`copy-${cmd}`));
    await interaction.reply({ embeds:[embed], components:[row], ephemeral:true });
  }

  // Vouch
  if (cmd==="vouch") {
    const product = interaction.options.getString("product");
    const price = interaction.options.getString("price");
    const embed = new EmbedBuilder().setDescription(`+rep ${interaction.user.id} | Legit Purchased ${product} For ${price}`).setColor("#0099ff");
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel("Copy Vouch").setStyle(ButtonStyle.Secondary).setCustomId("copy-vouch"));
    await interaction.reply({ embeds:[embed], components:[row], ephemeral:true });
  }

  // Remind
  if (cmd==="remind") {
    const user = interaction.options.getUser("user");
    const time = interaction.options.getString("time");
    const msg = interaction.options.getString("message");
    const delay = parseTime(time);
    if (!delay) return interaction.reply({ content:"Invalid time format", ephemeral:true });
    await interaction.reply(`✅ Reminder set for ${user.tag} in ${time}`);
    setTimeout(()=>{ user.send(`⏰ Reminder: ${msg}`).catch(()=>{}); }, delay);
  }

  // Addaddy
  if (cmd==="addaddy") {
    const userId = interaction.options.getString("userid");
    const type = interaction.options.getString("type").toLowerCase();
    const address = interaction.options.getString("address");
    if (!["upi","ltc","usdt"].includes(type)) return interaction.reply({ content:"Invalid type", ephemeral:true });
    if (!team[userId]) team[userId]={};
    team[userId][type] = address;
    saveTeam(team);
    await interaction.reply({ content:`✅ Saved ${type.toUpperCase()} for <@${userId}>: ${address}`, ephemeral:true });
  }
});

// ✅ Button interaction (copy)
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;
  const team = loadTeam();
  let content;
  const [action,type] = interaction.customId.split("-");
  if (type==="vouch") content = interaction.message.embeds[0]?.description;
  else { const data=team[interaction.user.id]; if (data && data[type]) content=data[type]; }
  if (!content) return;
  await interaction.reply({ content, ephemeral:true }).catch(()=>{});
});

client.login(process.env.TOKEN);
