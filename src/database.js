const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Ensure the data directory exists, create if not (optional, good practice)
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'ems_times.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error("Error opening database", err.message);
        return;
    }
    console.log("Connected to the SQLite database at", dbPath);
});

// Initialize database
function initDatabase() {
    db.serialize(() => {
        // Active sessions table
        db.run(`CREATE TABLE IF NOT EXISTS active_sessions (
            user_id TEXT PRIMARY KEY,
            clock_in_time INTEGER,      -- Timestamp in milliseconds
            channel_id TEXT,
            ridealong_with_id TEXT,     -- User ID of the member they are riding with, NULLABLE
            clock_in_message_id TEXT    -- ID of the clock-in confirmation message, NULLABLE
        )`);

        // Monthly times table
        db.run(`CREATE TABLE IF NOT EXISTS monthly_times (
            user_id TEXT,
            month INTEGER,              -- 1-12
            year INTEGER,
            total_seconds INTEGER DEFAULT 0, -- Total time in seconds
            shifts_completed INTEGER DEFAULT 0,
            PRIMARY KEY (user_id, month, year)
        )`);

        // Time modifications log
        db.run(`CREATE TABLE IF NOT EXISTS time_modifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,               -- User whose time was modified
            admin_id TEXT,              -- Admin who performed modification
            modification_timestamp INTEGER, -- Timestamp of modification in milliseconds
            seconds_modified INTEGER,   -- Seconds added (positive) or subtracted (negative)
            reason TEXT
        )`);

        // Sessions history table (for weekly tracking)
        db.run(`CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            clock_in_time INTEGER NOT NULL,   -- Timestamp in milliseconds
            clock_out_time INTEGER NOT NULL,  -- Timestamp in milliseconds
            duration_seconds INTEGER NOT NULL, -- Duration in seconds
            ridealong_with_id TEXT,           -- User ID of the member they rode with, NULLABLE
            created_at INTEGER DEFAULT (strftime('%s','now') * 1000) -- Creation timestamp
        )`);

        console.log('Database tables initialized/verified.');
    });
}

// Clock in functions
function clockIn(userId, channelId, clockInMessageId, ridealongWithId = null) {
    return new Promise((resolve, reject) => {
        const now = Date.now(); // Milliseconds
        db.run(
            'INSERT INTO active_sessions (user_id, clock_in_time, channel_id, ridealong_with_id, clock_in_message_id) VALUES (?, ?, ?, ?, ?)', [userId, now, channelId, ridealongWithId, clockInMessageId],
            function(err) {
                if (err) reject(err);
                else resolve(now); // Resolve with clock_in_time
            }
        );
    });
}

// Clock out functions
function clockOut(userId) {
    return new Promise((resolve, reject) => {
        db.get(
            'SELECT user_id, clock_in_time, channel_id, clock_in_message_id, ridealong_with_id FROM active_sessions WHERE user_id = ?', [userId],
            (err, session) => {
                if (err) {
                    reject(err);
                    return;
                }
                if (!session) {
                    resolve(null);
                    return;
                }

                const clockOutTime = Date.now();
                const durationMs = clockOutTime - session.clock_in_time;
                const durationSeconds = Math.round(durationMs / 1000);

                const date = new Date(clockOutTime);
                const month = date.getMonth() + 1;
                const year = date.getFullYear();

                // Start transaction for multiple inserts
                db.serialize(() => {
                    db.run('BEGIN TRANSACTION');

                    // Delete from active sessions
                    db.run('DELETE FROM active_sessions WHERE user_id = ?', [userId], (deleteErr) => {
                        if (deleteErr) {
                            db.run('ROLLBACK');
                            reject(deleteErr);
                            return;
                        }

                        // Insert/update monthly times
                        db.run(
                            `INSERT INTO monthly_times (user_id, month, year, total_seconds, shifts_completed)
                             VALUES (?, ?, ?, ?, 1)
                             ON CONFLICT(user_id, month, year) DO UPDATE SET
                             total_seconds = total_seconds + excluded.total_seconds,
                             shifts_completed = shifts_completed + 1`, [userId, month, year, durationSeconds],
                            function(updateErr) {
                                if (updateErr) {
                                    db.run('ROLLBACK');
                                    reject(updateErr);
                                    return;
                                }

                                // Insert session record for weekly tracking
                                db.run(
                                    `INSERT INTO sessions (user_id, clock_in_time, clock_out_time, duration_seconds, ridealong_with_id)
                                     VALUES (?, ?, ?, ?, ?)`, [userId, session.clock_in_time, clockOutTime, durationSeconds, session.ridealong_with_id],
                                    function(sessionErr) {
                                        if (sessionErr) {
                                            db.run('ROLLBACK');
                                            reject(sessionErr);
                                            return;
                                        }

                                        db.run('COMMIT');
                                        resolve({
                                            duration: durationMs,
                                            channelId: session.channel_id,
                                            clockInTime: session.clock_in_time,
                                            clockInMessageId: session.clock_in_message_id
                                        });
                                    }
                                );
                            }
                        );
                    });
                });
            }
        );
    });
}

// Get top 10 users (changed from top 9)
function getTopUsers(limit = 10) {
    return new Promise((resolve, reject) => {
        const date = new Date();
        const month = date.getMonth() + 1;
        const year = date.getFullYear();
        db.all(
            `SELECT user_id, total_seconds, shifts_completed
             FROM monthly_times
             WHERE month = ? AND year = ?
             ORDER BY total_seconds DESC
             LIMIT ?`, [month, year, limit],
            (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            }
        );
    });
}

// Get user's time
function getUserTime(userId) {
    return new Promise((resolve, reject) => {
        const date = new Date();
        const month = date.getMonth() + 1;
        const year = date.getFullYear();
        db.get(
            `SELECT total_seconds, shifts_completed
             FROM monthly_times
             WHERE user_id = ? AND month = ? AND year = ?`, [userId, month, year],
            (err, row) => {
                if (err) reject(err);
                else resolve(row || { total_seconds: 0, shifts_completed: 0 });
            }
        );
    });
}

// Check if user is clocked in
function isClockedIn(userId) {
    return new Promise((resolve, reject) => {
        db.get(
            'SELECT 1 FROM active_sessions WHERE user_id = ?', [userId],
            (err, row) => {
                if (err) reject(err);
                else resolve(!!row);
            }
        );
    });
}

// Generate monthly report for a specific month/year
function generateMonthlyReport(month = null, year = null) {
    return new Promise((resolve, reject) => {
        if (month === null || year === null) {
            const date = new Date();
            month = date.getMonth() + 1;
            year = date.getFullYear();
        }
        db.all(
            `SELECT user_id, total_seconds, shifts_completed
             FROM monthly_times
             WHERE month = ? AND year = ?
             ORDER BY total_seconds DESC`, [month, year],
            (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            }
        );
    });
}

// Modify user's time
function modifyUserTime(userIdToModify, secondsToModify, adminUserId, reason) {
    return new Promise((resolve, reject) => {
        const date = new Date();
        const month = date.getMonth() + 1;
        const year = date.getFullYear();
        const modificationTimestamp = Date.now();
        db.run(
            `INSERT INTO monthly_times (user_id, month, year, total_seconds, shifts_completed)
             VALUES (?, ?, ?, ?, 0)
             ON CONFLICT(user_id, month, year) DO UPDATE SET
             total_seconds = total_seconds + ?`, [userIdToModify, month, year, secondsToModify, secondsToModify],
            function(err) {
                if (err) {
                    reject(err);
                    return;
                }
                db.run(
                    `INSERT INTO time_modifications (user_id, admin_id, modification_timestamp, seconds_modified, reason)
                     VALUES (?, ?, ?, ?, ?)`, [userIdToModify, adminUserId, modificationTimestamp, secondsToModify, reason],
                    function(logErr) {
                        if (logErr) reject(logErr);
                        else resolve();
                    }
                );
            }
        );
    });
}

// Get time modification history
function getTimeModificationHistory(userId) {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT admin_id, modification_timestamp, seconds_modified, reason 
             FROM time_modifications
             WHERE user_id = ?
             ORDER BY modification_timestamp DESC
             LIMIT 10`, [userId],
            (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            }
        );
    });
}

function setRidealong(userId, ridealongWithId) {
    return new Promise((resolve, reject) => {
        db.run(
            'UPDATE active_sessions SET ridealong_with_id = ? WHERE user_id = ?', [ridealongWithId, userId],
            function(err) {
                if (err) {
                    reject(err);
                } else {
                    if (this.changes === 0) {
                        resolve({ updated: false, message: 'No active session or ridealong unchanged.' });
                    } else {
                        resolve({ updated: true });
                    }
                }
            }
        );
    });
}

function getOnDutyUsers() {
    return new Promise((resolve, reject) => {
        db.all(
            'SELECT user_id, clock_in_time, ridealong_with_id FROM active_sessions ORDER BY clock_in_time ASC',
            (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            }
        );
    });
}

// Get monthly summary for previous month
function getPreviousMonthSummary() {
    return new Promise((resolve, reject) => {
        const now = new Date();
        let month = now.getMonth(); // 0-11, so previous month
        let year = now.getFullYear();

        if (month === 0) {
            month = 12;
            year -= 1;
        }

        db.all(
            `SELECT user_id, total_seconds, shifts_completed
             FROM monthly_times
             WHERE month = ? AND year = ?
             ORDER BY total_seconds DESC`, [month, year],
            (err, rows) => {
                if (err) reject(err);
                else resolve({ data: rows, month, year });
            }
        );
    });
}

// Get top users for the past week
function getWeeklyTopUsers(limit = 10) {
    return new Promise((resolve, reject) => {
        const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days ago in milliseconds

        db.all(
            `SELECT user_id, 
                    SUM(duration_seconds) as total_seconds, 
                    COUNT(*) as shifts_completed
             FROM sessions 
             WHERE clock_out_time >= ?
             GROUP BY user_id
             ORDER BY total_seconds DESC
             LIMIT ?`, [oneWeekAgo, limit],
            (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            }
        );
    });
}

module.exports = {
    initDatabase,
    clockIn,
    clockOut,
    getTopUsers,
    getUserTime,
    isClockedIn,
    generateMonthlyReport,
    modifyUserTime,
    getTimeModificationHistory,
    setRidealong,
    getOnDutyUsers,
    getPreviousMonthSummary,
    getWeeklyTopUsers
};