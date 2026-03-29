const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

let db;

async function initDB() {
    db = await open({
        filename: path.join(__dirname, '../database.sqlite'),
        driver: sqlite3.Database
    });

    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            telegram_id INTEGER PRIMARY KEY,
            username TEXT,
            is_admin INTEGER DEFAULT 0,
            is_subscribed INTEGER DEFAULT 0,
            banned INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            telegram_id INTEGER,
            action TEXT,
            details TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS cv_data (
            telegram_id INTEGER PRIMARY KEY,
            current_state TEXT,
            language TEXT,
            data_json TEXT
        );
    `);
    
    return db;
}

async function getDB() {
    if (!db) {
        await initDB();
    }
    return db;
}

// Utility functions for easy access
async function getUser(telegramId) {
    const database = await getDB();
    return database.get('SELECT * FROM users WHERE telegram_id = ?', [telegramId]);
}

async function createUser(telegramId, username) {
    const database = await getDB();
    await database.run(
        'INSERT OR IGNORE INTO users (telegram_id, username) VALUES (?, ?)',
        [telegramId, username]
    );
}

async function logAction(telegramId, action, details) {
    const database = await getDB();
    await database.run(
        'INSERT INTO logs (telegram_id, action, details) VALUES (?, ?, ?)',
        [telegramId, action, details]
    );
}

module.exports = { initDB, getDB, getUser, createUser, logAction };
