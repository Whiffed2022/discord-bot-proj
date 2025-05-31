const { REST, Routes } = require('discord.js');
require('dotenv').config();

const commands = [{
        name: 'clockin',
        description: 'Clock in for your EMS shift',
        options: [{
            name: 'ridealong_with',
            description: 'Tag an EMS member you are riding along with',
            type: 6, // USER type
            required: false
        }]
    },
    {
        name: 'clockout',
        description: 'Clock out from your EMS shift'
    },
    {
        name: 'setridealong',
        description: 'Set, update, or clear your ridealong partner for the current shift',
        options: [{
            name: 'user',
            description: 'The EMS member you are riding along with (omit to clear)',
            type: 6, // USER type
            required: false
        }]
    },
    {
        name: 'onduty',
        description: 'Lists all EMS members currently on duty, their shift duration, and ridealong status'
    },
    {
        name: 'searchuser',
        description: 'Looks up duty time and session count for a specified user this month',
        options: [{
            name: 'user',
            description: 'The user to search for',
            type: 6, // USER type
            required: true
        }]
    },
    {
        name: 'top10',
        description: 'Display the top 10 EMS members with the most time on duty'
    },
    {
        name: 'weeklytop',
        description: 'Display the top 10 EMS members with the most time on duty in the past week'
    },
    {
        name: 'mytime',
        description: 'Display your total time on duty this month'
    },
    {
        name: 'modifytime',
        description: '[Admin Only] Modify a user\'s time records',
        options: [{
                name: 'user',
                description: 'The user to modify time for',
                type: 6, // USER type
                required: true
            },
            {
                name: 'hours',
                description: 'Hours to add (negative to subtract)',
                type: 4, // INTEGER type
                required: true
            },
            {
                name: 'minutes',
                description: 'Minutes to add (negative to subtract)',
                type: 4, // INTEGER type
                required: true
            },
            {
                name: 'reason',
                description: 'Reason for the time modification',
                type: 3, // STRING type
                required: true
            }
        ]
    }
    // Potentially add a /help command definition here if desired
];

const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

(async() => {
    try {
        console.log('Started refreshing application (/) commands.');

        await rest.put(
            // Make sure CLIENT_ID is available in your .env file
            Routes.applicationCommands(process.env.CLIENT_ID), { body: commands },
        );

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error('Error refreshing application commands:', error);
    }
})();