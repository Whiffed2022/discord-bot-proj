# EMS Clock-in/Clock-out Discord Bot

A Discord bot for tracking EMS member clock-in/clock-out times, generating monthly reports, displaying statistics, managing ridealongs, and keeping channels tidy.

## Features

- Clock-in/clock-out system for EMS role members.
- Enhanced Clock-in Message: Includes user's display name, avatar, clock-in time (EST/EDT), and ridealong status.
- Enhanced Clock-out Summary: Includes session duration, clock-in/out times (EST/EDT), and monthly totals.
- **Automatic Message Cleanup**: The original clock-in confirmation message is automatically deleted upon successful clock-out to reduce channel clutter.
- **Monthly time tracking with automatic resets**: Records automatically reset on the 1st of each month, and a detailed monthly summary report is generated and sent to the admin channel.
- Admin-only reports and logging channel.
- Admin command (`/modifytime`) to adjust user duty times with audit logging.
- **User Time Lookup (`/searchuser <user>`)**: Allows EMS members to view the total duty time and session count for a specified user for the current month.
- **Ridealong Management**:
    - Clock in with an optional `ridealong_with` member.
    - Update ridealong status mid-shift using `/setridealong`.
- **On-Duty Roster (`/onduty`)**: Lists all currently active EMS members, their current shift duration, and who they are riding with.
- **Top 10 leaderboard** for current month with detailed statistics.
- **Weekly leaderboard (`/weeklytop`)**: Shows top 10 members by time worked in the past 7 days.
- Personal time statistics for current month.
- **Automated Monthly Reports**: At the end of each month, a comprehensive report file is generated and sent to the admin channel with detailed statistics.

## Setup

1.  **Clone Repository**: `git clone <repository_url>`
2.  **Install Dependencies**: Navigate to the project directory and run `npm install`.
3.  **Configure Environment**: 
    *   Rename `.env.example` (or create `.env`) in the root directory.
    *   Fill in the required values:
        ```env
        # Bot Credentials
        BOT_TOKEN=your_discord_bot_token_here
        CLIENT_ID=your_bot_client_id_here

        # Discord Server IDs
        EMS_ROLE_ID=id_of_the_ems_role
        ADMIN_CHANNEL_ID=id_of_the_channel_for_admin_reports_and_logs
        ADMIN_ROLE_ID=id_of_the_discord_role_for_bot_admins
        ```
4.  **Create Data Directory**: Ensure a `data` directory exists in the root of the project (e.g., `mkdir data`). The bot will create `ems_times.db` inside it.
5.  **Register Slash Commands**: Run `node src/deploy-commands.js`. This only needs to be done once or when commands change.
6.  **Start the Bot**: Run `npm start`.

## Commands

-   `/clockin [ridealong_with]` - Clock in. Optionally tag a ridealong. Displays clock-in time in EST/EDT.
-   `/clockout` - Clock out. Shows a detailed summary including session duration and EST/EDT clock-in/out times. **Deletes the original clock-in message.**
-   `/setridealong [user]` - Set, update, or clear your ridealong partner. Omit user to clear.
-   `/onduty` - Lists currently on-duty EMS members, their shift duration, and ridealong status.
-   `/searchuser <user>` - Looks up total duty time and session count for a specified user for the current month.
-   `/top10` - Displays the top 10 EMS members by duty time for the current month.
-   `/weeklytop` - Displays the top 10 EMS members by duty time for the past week (7 days).
-   `/mytime` - Displays your personal duty time statistics for the current month.
-   `/help` - Displays comprehensive help with all available commands and descriptions.
-   `/modifytime <user> <hours> <minutes> <reason>` - **[Admin Only]** Modifies a user's recorded time.

## Monthly Reset & Reporting

The bot automatically performs monthly resets on the 1st of each month:
- **Automatic Reset**: Time tracking automatically segments by month/year in the database
- **Monthly Report Generation**: A comprehensive report file is generated for the previous month
- **Admin Notification**: The admin channel receives a detailed summary with:
  - Total members who worked
  - Total shifts completed
  - Total hours worked
  - Downloadable text file with detailed individual statistics

## Database

The bot uses SQLite3, and the database file (`ems_times.db`) is stored in the `/data` directory. It includes tables for:
-   `active_sessions`: Tracks currently clocked-in users, including `clock_in_time`, `channel_id`, `ridealong_with_id`, and `clock_in_message_id`.
-   `monthly_times`: Stores aggregated duty time and shifts per user per month.
-   `sessions`: Stores individual completed sessions for weekly tracking and detailed history.
-   `time_modifications`: Logs all manual time adjustments made by admins.

Monthly data is implicitly reset because records in `monthly_times` are keyed by month and year. Weekly data is calculated from the `sessions` table using the past 7 days.

## Permissions & Intents

Ensure the bot has the following permissions in your Discord server:
-   Send Messages
-   Embed Links
-   Read Message History
-   Use Application Commands
-   **Manage Messages** (Required for deleting clock-in messages).
-   **Attach Files** (Required for monthly report generation).

**Required Gateway Intents** (configure in Discord Developer Portal under your Bot settings):
-   `Message Content Intent`
-   `Guild Members Intent` (Recommended for reliably fetching member details for display names/avatars). You might need to enable this in your bot's application page on the Discord Developer Portal.

It's also crucial that the bot can see the channels it needs to operate in, including the admin channel.

## Requirements

- Node.js 16.9.0 or higher
- Discord.js 14.14.1
- SQLite3
- Moment.js
- Dotenv

The bot requires the following permissions:
- Send Messages
- Embed Links
- Read Message History
- Use Slash Commands
- Attach Files

The bot uses SQLite3 to store:
- Active sessions
- Monthly time records
- Shift statistics

The database file is automatically created in the `data` directory when the bot starts. 