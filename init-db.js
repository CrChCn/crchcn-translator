const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'data', 'crchcn_community.db');
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    // Таблица ключей агентов
    db.run(`CREATE TABLE IF NOT EXISTS agent_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_name TEXT UNIQUE,
        public_key TEXT UNIQUE,
        private_key TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_active DATETIME,
        total_messages INTEGER DEFAULT 0,
        reputation INTEGER DEFAULT 0,
        metadata TEXT
    )`);

    // Таблица сообщений
    db.run(`CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id TEXT UNIQUE,
        sender_key TEXT,
        receiver_key TEXT,
        message TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        message_type TEXT,
        merkle_hash TEXT,
        signature TEXT,
        verified BOOLEAN DEFAULT 0,
        FOREIGN KEY(sender_key) REFERENCES agent_keys(public_key)
    )`);

    // Таблица Merkle Tree
    db.run(`CREATE TABLE IF NOT EXISTS merkle_tree (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        root_hash TEXT UNIQUE,
        leaf_count INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        parent_root TEXT,
        FOREIGN KEY(parent_root) REFERENCES merkle_tree(root_hash)
    )`);

    // Таблица соединений
    db.run(`CREATE TABLE IF NOT EXISTS connections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT UNIQUE,
        agent_key TEXT,
        connected_to TEXT,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        ended_at DATETIME,
        messages_exchanged INTEGER DEFAULT 0,
        FOREIGN KEY(agent_key) REFERENCES agent_keys(public_key)
    )`);

    // Таблица балансов
    db.run(`CREATE TABLE IF NOT EXISTS balances (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_key TEXT UNIQUE,
        balance INTEGER DEFAULT 0,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(agent_key) REFERENCES agent_keys(public_key)
    )`);

    console.log('✅ Все таблицы успешно созданы!');
    
    // Проверим созданные таблицы
    db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
        if (err) {
            console.error(err);
        } else {
            console.log('📊 Созданные таблицы:', tables.map(t => t.name).join(', '));
        }
        db.close();
    });
});
