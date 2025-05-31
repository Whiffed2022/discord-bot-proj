require('dotenv').config();
const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField, AttachmentBuilder } = require('discord.js');
const moment = require('moment');
const db = require('./database');
const fs = require('fs');
const path = require('path');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers // Required to fetch member details like avatars and display names reliably
    ],
    partials: [Partials.Channel, Partials.User, Partials.GuildMember]
});

// Initialize database
db.initDatabase();

// Timezone for display
const DISPLAY_TIMEZONE = 'America/New_York'; // Handles EST/EDT automatically

// Helper function to format duration (seconds to Hh Mm format)
function formatDuration(totalSeconds, showSeconds = false) {
    if (typeof totalSeconds !== 'number' || isNaN(totalSeconds)) {
        return 'Invalid time';
    }
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    let formatted = `${hours}h ${minutes}m`;
    if (showSeconds) {
        formatted += ` ${seconds}s`;
    }
    return formatted;
}

function formatDetailedDuration(ms) {
    if (typeof ms !== 'number' || isNaN(ms)) return 'Invalid duration';
    let seconds = Math.floor(ms / 1000);
    let minutes = Math.floor(seconds / 60);
    let hours = Math.floor(minutes / 60);
    seconds = seconds % 60;
    minutes = minutes % 60;
    return `${hours}h ${minutes}m ${seconds}s`;
}

function formatTimestampToEST(timestamp) {
    if (typeof timestamp !== 'number' || isNaN(timestamp)) return 'Invalid date';
    return new Date(timestamp).toLocaleString('en-US', {
        timeZone: DISPLAY_TIMEZONE,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
        timeZoneName: 'short'
    });
}

// Helper function to format monthly report
function formatMonthlyReport(users, guild, month, year) {
    const monthName = new Date(year, month - 1).toLocaleString('default', { month: 'long' });

    let report = `Monthly EMS Duty Report - ${monthName} ${year}\n`;
    report += '=====================================\n\n';

    if (users.length === 0) {
        report += 'No duty time recorded for this month.\n';
        return report;
    }

    users.forEach(async(user, index) => {
        let member;
        try {
            member = await guild.members.fetch(user.user_id);
        } catch (e) { member = null; }
        const name = member ? member.displayName : `Unknown User (ID: ${user.user_id})`;
        const totalHoursFormatted = formatDuration(user.total_seconds);
        const avgShift = user.shifts_completed > 0 ? formatDuration(user.total_seconds / user.shifts_completed) : '0h 0m';
        report += `${index + 1}. ${name}\n`;
        report += `   Total Hours: ${totalHoursFormatted}\n`;
        report += `   Shifts: ${user.shifts_completed}\n`;
        report += `   Average Shift: ${avgShift}\n\n`;
    });

    return report;
}

// Helper function to check if user is admin
function isAdmin(member) {
    if (!process.env.ADMIN_ROLE_ID) {
        console.error('ADMIN_ROLE_ID is not set in .env file. Admin commands will not work.');
        return false;
    }
    return member.roles.cache.has(process.env.ADMIN_ROLE_ID);
}

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    console.log('Bot is ready!');
    // Schedule monthly reset (Placeholder - implement robust scheduling)
    // scheduleMonthlyReset(); 
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand() || !interaction.guild) return;

    const { commandName, user, member, options, channel } = interaction;

    // Permission checks
    const isEmsMember = member.roles.cache.has(process.env.EMS_ROLE_ID);
    const requiresEmsRole = !['modifytime', 'searchuser'].includes(commandName); // searchuser can be used by any EMS for now

    if (requiresEmsRole && !isEmsMember) {
        return interaction.reply({ content: 'You need the EMS role to use this command.', ephemeral: true });
    }
    if (commandName === 'modifytime' && !isAdmin(member)) {
        return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    }
    // For /searchuser, ensure the user executing has EMS role if we want to restrict it
    if (commandName === 'searchuser' && !isEmsMember) {
        // return interaction.reply({ content: 'You need the EMS role to search user times.', ephemeral: true });
        // Or allow anyone - current logic path allows it.
    }

    try {
        switch (commandName) {
            case 'clockin':
                const clockedInCheck = await db.isClockedIn(user.id);
                if (clockedInCheck) {
                    return interaction.reply({
                        content: 'You are already clocked in!',
                        ephemeral: true
                    });
                }

                const ridealongUser = options.getUser('ridealong_with');
                let ridealongWithId = null;
                let ridealongText = 'Not riding with anyone.';

                if (ridealongUser) {
                    const ridealongMember = await interaction.guild.members.fetch(ridealongUser.id).catch(() => null);
                    if (!ridealongMember || !ridealongMember.roles.cache.has(process.env.EMS_ROLE_ID)) {
                        return interaction.reply({ content: `The user ${ridealongUser.tag} specified for ridealong does not have the EMS role or was not found.`, ephemeral: true });
                    }
                    if (ridealongUser.id === user.id) {
                        return interaction.reply({ content: 'You cannot set yourself as a ridealong.', ephemeral: true });
                    }
                    ridealongWithId = ridealongUser.id;
                    ridealongText = `Riding along with: ${ridealongUser.tag}`;
                }
                // Send the clock-in message first to get its ID
                const clockInReply = await interaction.reply({
                    embeds: [new EmbedBuilder().setDescription('Processing clock-in...')],
                    fetchReply: true
                });
                const clockInMessageId = clockInReply.id;

                const clockInTime = await db.clockIn(user.id, channel.id, clockInMessageId, ridealongWithId);

                const clockInEmbed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('🕒 Clocked In Successfully')
                    .setAuthor({ name: member.displayName, iconURL: member.user.displayAvatarURL() })
                    .setDescription(`${member.displayName} has clocked in for EMS duty.`)
                    .addFields({ name: 'Clocked In At', value: formatTimestampToEST(clockInTime) }, { name: 'Ridealong Status', value: ridealongText })
                    .setTimestamp();
                await interaction.editReply({ embeds: [clockInEmbed] }); // Edit the initial reply
                break;

            case 'clockout':
                const clockOutResult = await db.clockOut(user.id);
                if (!clockOutResult) {
                    return interaction.reply({ content: 'You are not clocked in.', ephemeral: true });
                }
                // Attempt to delete the original clock-in message
                if (clockOutResult.clockInMessageId && clockOutResult.channelId) { // channelId from clockOutResult is the original clock-in channel
                    try {
                        const originalChannel = await client.channels.fetch(clockOutResult.channelId);
                        if (originalChannel && originalChannel.isTextBased()) { // isTextBased covers TextChannel, NewsChannel, etc.
                            const originalMessage = await originalChannel.messages.fetch(clockOutResult.clockInMessageId).catch(() => null);
                            if (originalMessage) {
                                await originalMessage.delete();
                            }
                        }
                    } catch (deleteError) {
                        console.warn(`Failed to delete clock-in message ${clockOutResult.clockInMessageId}:`, deleteError.message);
                        // Optionally notify admin or log to a specific channel if deletion is critical
                    }
                }
                const sessionDurationFormatted = formatDetailedDuration(clockOutResult.duration);
                const currentUserTime = await db.getUserTime(user.id);
                const totalTimeFormatted = formatDuration(currentUserTime.total_seconds);
                const clockOutTime = Date.now();

                const summaryEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('🚪 Clocked Out Summary')
                    .setAuthor({ name: member.displayName, iconURL: member.user.displayAvatarURL() })
                    .addFields({ name: 'Clocked In At', value: formatTimestampToEST(clockOutResult.clockInTime) }, { name: 'Clocked Out At', value: formatTimestampToEST(clockOutTime) }, { name: 'Session Duration', value: sessionDurationFormatted, inline: true }, { name: 'Total Time This Month', value: totalTimeFormatted, inline: true }, { name: 'Shifts This Month', value: currentUserTime.shifts_completed.toString(), inline: true })
                    .setTimestamp();
                // Since original reply was potentially the clock-in message, send a new reply for clock-out summary
                // If clock-in was deferred or a follow-up, this interaction.reply might fail.
                // For simplicity, assuming clock-out is a new interaction.
                await interaction.reply({ embeds: [summaryEmbed] });
                break;

            case 'setridealong':
                const isUserClockedIn = await db.isClockedIn(user.id);
                if (!isUserClockedIn) {
                    return interaction.reply({ content: 'You must be clocked in to set a ridealong.', ephemeral: true });
                }
                const ridealongTargetUser = options.getUser('user');
                let newRidealongId = null;
                let responseMessage = 'Your ridealong status has been cleared.';

                if (ridealongTargetUser) {
                    if (ridealongTargetUser.id === user.id) {
                        return interaction.reply({ content: 'You cannot set yourself as a ridealong.', ephemeral: true });
                    }
                    const targetMember = await interaction.guild.members.fetch(ridealongTargetUser.id).catch(() => null);
                    if (!targetMember || !targetMember.roles.cache.has(process.env.EMS_ROLE_ID)) {
                        return interaction.reply({ content: `The user ${ridealongTargetUser.tag} specified for ridealong does not have the EMS role or was not found.`, ephemeral: true });
                    }
                    newRidealongId = ridealongTargetUser.id;
                    responseMessage = `You are now riding along with ${ridealongTargetUser.tag}.`;
                }
                await db.setRidealong(user.id, newRidealongId);
                await interaction.reply({ content: responseMessage, ephemeral: true });
                break;

            case 'onduty':
                const onDutyUsers = await db.getOnDutyUsers();
                const onDutyEmbed = new EmbedBuilder()
                    .setColor('#0099FF')
                    .setTitle('🚑 EMS Members Currently On Duty')
                    .setTimestamp();

                if (onDutyUsers.length === 0) {
                    onDutyEmbed.setDescription('No EMS members are currently clocked in.');
                } else {
                    let description = '';
                    for (const dutyUser of onDutyUsers) {
                        let dutyMemberDisplay = `User ID: ${dutyUser.user_id}`;
                        try {
                            const fetchedDutyMember = await interaction.guild.members.fetch(dutyUser.user_id);
                            dutyMemberDisplay = fetchedDutyMember.displayName;
                        } catch (e) { console.warn(`Could not fetch member for onduty list: ${dutyUser.user_id}`); }

                        const shiftDurationMs = Date.now() - dutyUser.clock_in_time;
                        const shiftDurationFormatted = formatDetailedDuration(shiftDurationMs);
                        description += `**${dutyMemberDisplay}** - On duty for: ${shiftDurationFormatted}`;
                        if (dutyUser.ridealong_with_id) {
                            let ridealongMemberDisplay = `User ID: ${dutyUser.ridealong_with_id}`;
                            try {
                                const fetchedRidealongMember = await interaction.guild.members.fetch(dutyUser.ridealong_with_id);
                                ridealongMemberDisplay = fetchedRidealongMember.displayName;
                            } catch (e) { console.warn(`Could not fetch ridealong member for onduty list: ${dutyUser.ridealong_with_id}`); }
                            description += ` (Riding with: ${ridealongMemberDisplay})`;
                        }
                        description += '\n';
                    }
                    onDutyEmbed.setDescription(description || 'No EMS members are currently clocked in.');
                }
                await interaction.reply({ embeds: [onDutyEmbed] });
                break;

            case 'searchuser':
                const targetSearchUser = options.getUser('user');
                if (!targetSearchUser) {
                    return interaction.reply({ content: 'You must specify a user to search for.', ephemeral: true });
                }
                let targetSearchMember;
                try {
                    targetSearchMember = await interaction.guild.members.fetch(targetSearchUser.id);
                } catch (e) {
                    return interaction.reply({ content: `Could not find member ${targetSearchUser.tag} in this server.`, ephemeral: true });
                }

                const searchedUserTime = await db.getUserTime(targetSearchUser.id);
                const searchEmbed = new EmbedBuilder()
                    .setColor('#A020F0') // Purple for search
                    .setTitle(`Duty Time Report for ${targetSearchMember.displayName}`)
                    .setThumbnail(targetSearchMember.user.displayAvatarURL())
                    .addFields({ name: 'Total Time This Month', value: formatDuration(searchedUserTime.total_seconds), inline: true }, { name: 'Shifts Completed This Month', value: searchedUserTime.shifts_completed.toString(), inline: true })
                    .setFooter({ text: `Searched by: ${member.displayName}` })
                    .setTimestamp();
                await interaction.reply({ embeds: [searchEmbed] });
                break;

            case 'top10':
                const topUsers = await db.getTopUsers(10);
                const leaderboardEmbed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle('Top 10 EMS Members - Current Month')
                    .setDescription('Based on total time on duty')
                    .setTimestamp();

                if (topUsers.length === 0) {
                    leaderboardEmbed.setDescription('No duty time recorded this month yet.');
                } else {
                    for (let i = 0; i < topUsers.length; i++) {
                        const userData = topUsers[i];
                        let memberObjDisplay = `User ID: ${userData.user_id}`;
                        try {
                            const memberObj = await interaction.guild.members.fetch(userData.user_id);
                            memberObjDisplay = memberObj.displayName;
                        } catch (e) { console.warn(`Could not fetch member for top10: ${userData.user_id}`); }
                        leaderboardEmbed.addFields({ name: `${i + 1}. ${memberObjDisplay}`, value: `Time: ${formatDuration(userData.total_seconds)}\nShifts: ${userData.shifts_completed}` });
                    }
                }
                await interaction.reply({ embeds: [leaderboardEmbed] });
                break;

            case 'weeklytop':
                const weeklyTopUsers = await db.getWeeklyTopUsers(10);
                const weeklyLeaderboardEmbed = new EmbedBuilder()
                    .setColor('#00ff99')
                    .setTitle('🏆 Top 10 EMS Members - Past Week')
                    .setDescription('Based on total time on duty in the last 7 days')
                    .setTimestamp();

                if (weeklyTopUsers.length === 0) {
                    weeklyLeaderboardEmbed.setDescription('No duty time recorded in the past week.');
                } else {
                    for (let i = 0; i < weeklyTopUsers.length; i++) {
                        const userData = weeklyTopUsers[i];
                        let memberObjDisplay = `User ID: ${userData.user_id}`;
                        try {
                            const memberObj = await interaction.guild.members.fetch(userData.user_id);
                            memberObjDisplay = memberObj.displayName;
                        } catch (e) { console.warn(`Could not fetch member for weeklytop: ${userData.user_id}`); }
                        weeklyLeaderboardEmbed.addFields({
                            name: `${i + 1}. ${memberObjDisplay}`,
                            value: `Time: ${formatDuration(userData.total_seconds)}\nShifts: ${userData.shifts_completed}`
                        });
                    }
                }
                await interaction.reply({ embeds: [weeklyLeaderboardEmbed] });
                break;

            case 'help':
                const helpEmbed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle('🚑 EMS Bot Commands Help')
                    .setDescription('Complete list of available commands for the EMS Clock-in/Clock-out Bot')
                    .setThumbnail(client.user.displayAvatarURL())
                    .addFields({
                        name: '⏰ **Time Tracking Commands**',
                        value: '`/clockin [ridealong_with]` - Clock in for your EMS shift\n' +
                            '• Optional: Tag another EMS member you\'re riding with\n' +
                            '• Displays clock-in time in EST/EDT\n\n' +
                            '`/clockout` - Clock out from your EMS shift\n' +
                            '• Shows detailed session summary with duration\n' +
                            '• Displays monthly totals and shift count\n' +
                            '• Automatically deletes your clock-in message\n\n' +
                            '`/setridealong [user]` - Update your ridealong partner\n' +
                            '• Set, change, or clear who you\'re riding with\n' +
                            '• Must be clocked in to use this command\n' +
                            '• Omit user parameter to clear ridealong',
                        inline: false
                    }, {
                        name: '📊 **Statistics & Leaderboards**',
                        value: '`/mytime` - View your personal duty time statistics\n' +
                            '• Shows total hours and shifts for current month\n\n' +
                            '`/top10` - Display monthly leaderboard\n' +
                            '• Top 10 EMS members by duty time this month\n' +
                            '• Shows hours worked and number of shifts\n\n' +
                            '`/weeklytop` - Display weekly leaderboard\n' +
                            '• Top 10 EMS members by duty time in past 7 days\n' +
                            '• Real-time weekly performance tracking\n\n' +
                            '`/searchuser <user>` - Look up another member\'s stats\n' +
                            '• View total time and shifts for current month\n' +
                            '• Available to all EMS members',
                        inline: false
                    }, {
                        name: '👥 **Roster & Status Commands**',
                        value: '`/onduty` - View currently active EMS members\n' +
                            '• Shows who\'s clocked in and for how long\n' +
                            '• Displays ridealong partnerships\n' +
                            '• Real-time duty roster with shift durations',
                        inline: false
                    }, {
                        name: '⚙️ **Admin Commands**',
                        value: '`/modifytime <user> <hours> <minutes> <reason>` - Modify user time\n' +
                            '• Add or subtract time from a member\'s record\n' +
                            '• Requires admin role permissions\n' +
                            '• All modifications are logged for accountability\n' +
                            '• Use negative values to subtract time',
                        inline: false
                    }, {
                        name: '📅 **Automated Features**',
                        value: '• **Monthly Reset**: Time tracking resets automatically on the 1st\n' +
                            '• **Monthly Reports**: Detailed reports sent to admin channel\n' +
                            '• **Message Cleanup**: Clock-in messages auto-deleted on clock-out\n' +
                            '• **Real-time Updates**: All statistics update immediately',
                        inline: false
                    }, {
                        name: '💡 **Usage Tips**',
                        value: '• Only EMS role members can use time tracking commands\n' +
                            '• All times are displayed in EST/EDT timezone\n' +
                            '• You can update your ridealong partner mid-shift\n' +
                            '• Use `/help` anytime to see this command list\n' +
                            '• Contact admins if you experience any issues',
                        inline: false
                    })
                    .setFooter({
                        text: `Requested by ${member.displayName} • EMS Bot v1.0`,
                        iconURL: member.user.displayAvatarURL()
                    })
                    .setTimestamp();

                await interaction.reply({ embeds: [helpEmbed] });
                break;

            case 'mytime':
                const userTimeStats = await db.getUserTime(user.id);
                const myTimeEmbed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle('Your Time This Month')
                    .setAuthor({ name: member.displayName, iconURL: member.user.displayAvatarURL() })
                    .addFields({ name: 'Total Time', value: formatDuration(userTimeStats.total_seconds) }, { name: 'Shifts Completed', value: userTimeStats.shifts_completed.toString() })
                    .setTimestamp();
                await interaction.reply({ embeds: [myTimeEmbed] });
                break;

            case 'modifytime':
                const targetUser = options.getUser('user');
                const hours = options.getInteger('hours');
                const minutes = options.getInteger('minutes');
                const reason = options.getString('reason');

                const secondsToModify = (hours * 3600) + (minutes * 60);

                await db.modifyUserTime(targetUser.id, secondsToModify, user.id, reason);
                const updatedTargetUserTime = await db.getUserTime(targetUser.id);
                const modMemberDisplay = await interaction.guild.members.fetch(targetUser.id).then(m => m.displayName).catch(() => targetUser.tag);
                const modificationEmbed = new EmbedBuilder()
                    .setColor('#ff9900')
                    .setTitle('Admin Time Modification Log')
                    .setDescription(`Time manually adjusted for ${modMemberDisplay} (ID: ${targetUser.id}) by ${member.displayName}`)
                    .addFields({ name: 'Time Adjusted', value: formatDuration(Math.abs(secondsToModify), true) + (secondsToModify < 0 ? ' (subtracted)' : ' (added)') }, { name: 'Reason', value: reason }, { name: 'New Total Time This Month', value: formatDuration(updatedTargetUserTime.total_seconds) }, { name: 'New Shifts This Month', value: updatedTargetUserTime.shifts_completed.toString() })
                    .setTimestamp();

                await interaction.reply({ content: `Time for ${modMemberDisplay} has been modified.`, embeds: [modificationEmbed], ephemeral: true });

                const adminLogChannel = interaction.guild.channels.cache.get(process.env.ADMIN_CHANNEL_ID);
                if (adminLogChannel && adminLogChannel.isTextBased()) { await adminLogChannel.send({ embeds: [modificationEmbed] }); } else { console.warn('Admin log channel not found or is not a text channel. Skipping log message.'); }
                break;
        }
    } catch (error) {
        console.error('Error handling interaction:', error);
        const errorMessage = 'There was an error while executing this command! Please try again or contact an admin.';
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: errorMessage, ephemeral: true });
        } else {
            await interaction.reply({ content: errorMessage, ephemeral: true });
        }
    }
});

// Monthly Reset Logic with Summary Report
async function performMonthlyReset() {
    console.log('Performing monthly reset...');
    try {
        const adminChannel = client.channels.cache.get(process.env.ADMIN_CHANNEL_ID);
        if (!adminChannel || !adminChannel.isTextBased()) {
            console.error('Admin log channel not found or is not a text channel. Skipping monthly report.');
            return;
        }

        // Get previous month's data before reset
        const previousMonthData = await db.getPreviousMonthSummary();
        const guild = adminChannel.guild;

        if (previousMonthData.data.length > 0) {
            // Generate the monthly report
            let report = await formatMonthlyReportAsync(previousMonthData.data, guild, previousMonthData.month, previousMonthData.year);

            // Create a file attachment with the report
            const fileName = `EMS_Monthly_Report_${previousMonthData.year}_${String(previousMonthData.month).padStart(2, '0')}.txt`;
            const filePath = path.join(__dirname, '../data', fileName);

            // Write report to file
            fs.writeFileSync(filePath, report);

            // Create attachment
            const attachment = new AttachmentBuilder(filePath, { name: fileName });

            // Send summary embed with file attachment
            const summaryEmbed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('📊 Monthly EMS Report Generated')
                .setDescription(`Monthly summary for ${new Date(previousMonthData.year, previousMonthData.month - 1).toLocaleString('default', { month: 'long' })} ${previousMonthData.year}`)
                .addFields({ name: 'Total Members', value: previousMonthData.data.length.toString(), inline: true }, { name: 'Total Shifts', value: previousMonthData.data.reduce((sum, user) => sum + user.shifts_completed, 0).toString(), inline: true }, { name: 'Total Hours', value: formatDuration(previousMonthData.data.reduce((sum, user) => sum + user.total_seconds, 0)), inline: true })
                .setTimestamp();

            await adminChannel.send({
                content: 'Monthly EMS duty report has been generated.',
                embeds: [summaryEmbed],
                files: [attachment]
            });

            // Clean up the temp file after a delay
            setTimeout(() => {
                try {
                    fs.unlinkSync(filePath);
                } catch (e) {
                    console.warn('Could not delete temporary report file:', e.message);
                }
            }, 5000);
        } else {
            await adminChannel.send({
                embeds: [new EmbedBuilder()
                    .setColor('#ffaa00')
                    .setTitle('📊 Monthly Reset Complete')
                    .setDescription('No data to report for the previous month.')
                    .setTimestamp()
                ]
            });
        }

        await adminChannel.send('Monthly time records have been reset for the new month. Data is automatically segmented by month/year in the database.');
        console.log('Monthly reset completed.');
    } catch (error) {
        console.error('Error during monthly reset:', error);
        try {
            const adminChannel = client.channels.cache.get(process.env.ADMIN_CHANNEL_ID);
            if (adminChannel && adminChannel.isTextBased()) {
                await adminChannel.send('⚠️ Error occurred during monthly reset. Please check logs.');
            }
        } catch (e) {
            console.error('Could not send error message to admin channel:', e);
        }
    }
}

// Async version of formatMonthlyReport for better member fetching
async function formatMonthlyReportAsync(users, guild, month, year) {
    const monthName = new Date(year, month - 1).toLocaleString('default', { month: 'long' });

    let report = `Monthly EMS Duty Report - ${monthName} ${year}\n`;
    report += '=====================================\n\n';

    if (users.length === 0) {
        report += 'No duty time recorded for this month.\n';
        return report;
    }

    for (let index = 0; index < users.length; index++) {
        const user = users[index];
        let member;
        try {
            member = await guild.members.fetch(user.user_id);
        } catch (e) {
            console.warn(`Could not fetch member ${user.user_id} for monthly report`);
            member = null;
        }
        const name = member ? member.displayName : `Unknown User (ID: ${user.user_id})`;
        const totalHoursFormatted = formatDuration(user.total_seconds);
        const avgShift = user.shifts_completed > 0 ? formatDuration(user.total_seconds / user.shifts_completed) : '0h 0m';
        report += `${index + 1}. ${name}\n`;
        report += `   Total Hours: ${totalHoursFormatted}\n`;
        report += `   Shifts: ${user.shifts_completed}\n`;
        report += `   Average Shift: ${avgShift}\n\n`;
    }

    return report;
}

// Improved monthly reset scheduling
let lastResetCheck = new Date().getMonth();
let hasResetThisMonth = false;

function checkForMonthlyReset() {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentDay = now.getDate();

    // Reset on the 1st day of the month, but only once
    if (currentDay === 1 && currentMonth !== lastResetCheck && !hasResetThisMonth) {
        performMonthlyReset();
        lastResetCheck = currentMonth;
        hasResetThisMonth = true;
    } else if (currentDay !== 1) {
        // Reset the flag when it's not the 1st anymore
        hasResetThisMonth = false;
    }
}

// Check every hour for month change
setInterval(checkForMonthlyReset, 1000 * 60 * 60);

// Also check on startup in case bot was offline during month change
setTimeout(() => {
    checkForMonthlyReset();
}, 5000); // Wait 5 seconds after startup

client.login(process.env.BOT_TOKEN);