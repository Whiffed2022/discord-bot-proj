# EMS Clock-in/Clock-out Discord Bot

## Overview
This Discord bot is designed to manage and track clock-in/clock-out times for members with the EMS role. It provides a systematic way to record duty hours, generate monthly reports, display statistics about member participation, manage ridealong information, and help keep channels clean.

## Features

### Clock-in/Clock-out System
- Members with the EMS role can use `/clockin` and `/clockout` commands.
- **Enhanced Clock-in Message**: When a user clocks in, the confirmation message includes their display name, avatar, and details about any ridealong they've specified.
- The bot records the exact timestamp of each clock-in and clock-out.
- **Enhanced Clock-out Summary**: After clocking out, users receive a summary message in the same channel showing:
    - Total time on duty for that session.
    - The specific clock-in time (EST/EDT).
    - The specific clock-out time (EST/EDT).
    - Total hours and shifts for the month.
- **Automatic Clock-in Message Deletion**: When a user successfully clocks out, the bot will attempt to delete the original clock-in confirmation message sent for that session to reduce channel clutter.
- The bot prevents users from clocking in multiple times or clocking out without being clocked in.

### User Time Lookup
- The `/searchuser <user>` command allows members to look up the total duty time and number of sessions for a specified user for the current month.

### Ridealong Management
- **Clock-in with Ridealong**: The `/clockin` command includes an optional `ridealong_with` parameter, allowing EMS members to tag another EMS member they are riding along with.
- **Mid-Shift Ridealong Updates**: Clocked-in users can use the `/setridealong` command to add, change, or clear who they are riding along with during their active shift.
- Ridealong information is displayed in the on-duty list.

### On-Duty Roster
- The `/onduty` command lists all EMS members currently clocked in.
- For each on-duty member, it displays:
    - Their display name.
    - How long they've been clocked in for the current session.
    - The display name of the EMS member they are riding along with, if applicable.

### Monthly Time Tracking
- The bot maintains a running total of duty hours for each EMS member.
- All time records are reset on the first day of each month.
- Time is tracked in hours and minutes for precise record-keeping.

### Admin Reports
- A dedicated text channel (accessible only to administrators) receives monthly reports.
- Reports are generated in a clean, readable text format.
- Each report includes:
  - Member name
  - Total hours worked
  - Number of shifts completed
  - Average shift duration

### Admin Time Management
- Administrators can modify individual user times using `/modifytime` command.
- Time modifications can be used to:
  - Add or subtract time from a user's total
  - Fix cases where users forgot to clock out
  - Adjust for system errors or discrepancies
- All time modifications are logged in the admin channel for accountability.

### Leaderboard System
- Command `/top10` displays the top 10 EMS members with the most recorded time for the current month.
- Command `/weeklytop` displays the top 10 EMS members with the most recorded time for the past week (7 days).
- The leaderboards show:
  - Member rank
  - Member name
  - Total hours worked
  - Number of shifts completed
- Leaderboards update in real-time as members clock in and out.

### Monthly Reset & Reporting
- The bot automatically performs monthly resets on the 1st of each month
- **Enhanced Monthly Reports**: At month end, a comprehensive report is generated containing:
  - Individual member statistics (hours, shifts, averages)
  - Total department statistics 
  - Downloadable text file attachment
  - Summary embed with key metrics
- Reports are automatically sent to the admin channel
- Time tracking automatically segments data by month/year in the database
- Robust scheduling system prevents duplicate resets

## Technical Requirements
- Discord.js for bot implementation.
- Database system for storing time records and active session details (SQLite or similar).
- **Enhanced Session Tracking**: Individual session records stored for weekly analytics and detailed history.
- Role-based permission system.
- Automated monthly reset functionality.
- Error handling for edge cases.
- Accurate timezone handling for displaying times (e.g., EST/EDT).
- Message management capabilities for deleting specific bot messages.

## Security Features
- Role-based access control for commands.
- Admin-only access to reports channel and sensitive commands.
- Data validation for all commands.
- Protection against command spam.
- Audit logging for admin time modifications.

## User Experience
- Clear, concise command responses with detailed information where appropriate.
- Immediate feedback on all actions.
- Easy-to-read time summaries and on-duty rosters, including timezone-specific times.
- Automated channel cleanup by deleting old clock-in messages upon clock-out.
- Intuitive command structure.

## Monthly Report Format
```
Monthly EMS Duty Report - [Month Year]
=====================================

1. [Member Name]
   Total Hours: XX:XX
   Shifts: XX
   Average Shift: XX:XX

2. [Member Name]
   Total Hours: XX:XX
   Shifts: XX
   Average Shift: XX:XX

[... and so on]
```

## Commands
- `/clockin [ridealong_with]` - Start duty tracking. Optionally tag an EMS member you are riding with.
- `/clockout` - End duty tracking. Shows a detailed summary including session duration and EST/EDT clock-in/out times. Deletes the original clock-in message.
- `/setridealong [user]` - Set, update, or clear your ridealong partner for the current shift. (Administers/Moderators with appropriate permissions may also be able to set this for others).
- `/onduty` - Lists all EMS members currently on duty, their shift duration, and ridealong status.
- `/searchuser <user>` - Looks up the total duty time and session count for a specified user for the current month.
- `/top10` - Display leaderboard for the current month.
- `/weeklytop` - Display leaderboard for the past week (7 days).
- `/mytime` - Show personal time statistics for the current month.
- `/help` - Display comprehensive help with all available commands, organized by category with detailed descriptions.
- `/modifytime <user> <hours> <minutes> <reason>` - [Admin Only] Modify a user's time records.

## Error Handling
- Invalid command usage.
- Missing permissions (including message deletion).
- Server connectivity issues.
- Database errors.
- Clock-in/clock-out state conflicts.
- Handling cases where tagged ridealong users are not valid EMS members (optional enhancement).
