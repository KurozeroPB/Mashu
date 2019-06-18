import mongoose from "mongoose";
import settings from "../settings";
import Mashu from "./utils/MashuClient";
import CommandHandler from "./utils/CommandHandler";
import CommandLoader from "./utils/CommandLoader";
import Logger from "./utils/Logger";
import { GuildModel } from "./utils/Mongoose";
import { isGuildChannel } from "./utils/Helpers.ts";
import { AnyChannel, AnyGuildChannel, Guild, Member } from "eris";

let ready = false;

const client = new Mashu(settings.token, {
    getAllUsers: true,
    restMode: true
});

const logger = new Logger();
const commandLoader = new CommandLoader(logger);
const commandHandler = new CommandHandler({ settings, client, logger });

client.on("ready", async () => {
    if (!ready) {
        client.commands = await commandLoader.load(`${__dirname}/commands`);
        await mongoose.connect(`mongodb://${settings.database.host}:${settings.database.port}/${settings.database.name}`, { useNewUrlParser: true });

        logger.ready(`Logged in as ${client.user.tag}`);
        logger.ready(`Loaded [${client.commands.size}] commands`);
    } else {
        logger.ready("Reconnected");
    }

    ready = true;
});

client.on("messageCreate", async (msg) => {
    if (!ready) return; // Bot not ready yet
    if (!msg.author) return; // Probably system message
    if (msg.author.discriminator === "0000") return; // Probably a webhook

    if (msg.content.startsWith(settings.prefix)) {
        if (isGuildChannel(msg.channel) && msg.author.id !== client.user.id) {
            await commandHandler.handleCommand(msg, false);
        } else if (msg.channel.type === 1) {
            await commandHandler.handleCommand(msg, true);
        }
    }
});

client.on("guildCreate", async (guild: Guild) => {
    const newGuild = new GuildModel({ "id": guild.id, "logChannel": "" });
    await newGuild.save();
});

client.on("channelCreate", async (channel: AnyChannel) => {
    if (isGuildChannel(channel)) {
        channel = channel as AnyGuildChannel;
        const guild = await GuildModel.findOne({ "id": channel.guild.id }).exec();
        if (guild && guild.muteRole) {
            await channel.editPermission(guild.muteRole, 0, 55360, "role", "Create muted overrides");
        }
    }
});

client.on("guildMemberAdd", async (guild: Guild, member: Member) => {
    const dbGuild = await GuildModel.findOne({ "id": guild.id }).exec();
    if (dbGuild && dbGuild.muteRole) {
        const user = dbGuild.users.find((u) => u.id === member.user.id);
        if (user && user.isMuted) {
            const reason = "Member left while being muted, re-added muted role until a moderator unmutes the member";
            if (dbGuild.logChannel) {
                await client.createMessage(dbGuild.logChannel, {
                    embed: {
                        title: "MUTE",
                        color: settings.colors.mute,
                        description: `**Muted:** ${member.user.mention}\n` +
                            `**By:** ${client.user.mention}\n` +
                            `**Reason:** ${reason}`,
                        timestamp: (new Date()).toISOString(),
                        footer: { text: `ID: ${member.user.id}` }
                    }
                });
            }

            await member.addRole(dbGuild.muteRole, `[MUTED] ${reason}`);
        }
    }
});

process.on("SIGINT", () => {
    client.disconnect({ reconnect: false });
    process.exit(0);
});

client.connect().catch((e) => logger.error("CONNECT", e.stack));