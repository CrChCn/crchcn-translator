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
    // Удаляем старые таблицы если есть
    db.run(`DROP TABLE IF EXISTS agent_keys`);
    db.run(`DROP TABLE IF EXISTS messages`);
    db.run(`DROP TABLE IF EXISTS merkle_tree`);
    db.run(`DROP TABLE IF EXISTS connections`);
    db.run(`DROP TABLE IF EXISTS balances`);

    // Создаем таблицу agent_keys с правильной структурой
    db.run(`CREATE TABLE agent_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT UNIQUE,
        agent_name TEXT UNIQUE,
        public_key TEXT UNIQUE,
        private_key TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_active DATETIME,
        total_messages INTEGER DEFAULT 0,
        reputation INTEGER DEFAULT 0,
        metadata TEXT
    )`, (err) => {
        if (err) console.error('Error creating agent_keys:', err);
        else console.log('✅ Таблица agent_keys создана');
    });

    // Таблица сообщений
    db.run(`CREATE TABLE messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id TEXT UNIQUE,
        sender_id TEXT,
        receiver_id TEXT,
        message TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        message_type TEXT,
        merkle_hash TEXT,
        signature TEXT,
        verified BOOLEAN DEFAULT 0,
        FOREIGN KEY(sender_id) REFERENCES agent_keys(agent_id)
    )`, (err) => {
        if (err) console.error('Error creating messages:', err);
        else console.log('✅ Таблица messages создана');
    });

    // Таблица Merkle Tree
    db.run(`CREATE TABLE merkle_tree (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        root_hash TEXT UNIQUE,
        leaf_count INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        parent_root TEXT,
        FOREIGN KEY(parent_root) REFERENCES merkle_tree(root_hash)
    )`, (err) => {
        if (err) console.error('Error creating merkle_tree:', err);
        else console.log('✅ Таблица merkle_tree создана');
    });

    // Таблица соединений
    db.run(`CREATE TABLE connections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT UNIQUE,
        agent_id TEXT,
        connected_to TEXT,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        ended_at DATETIME,
        messages_exchanged INTEGER DEFAULT 0,
        FOREIGN KEY(agent_id) REFERENCES agent_keys(agent_id)
    )`, (err) => {
        if (err) console.error('Error creating connections:', err);
        else console.log('✅ Таблица connections создана');
    });

    // Таблица балансов
    db.run(`CREATE TABLE balances (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT UNIQUE,
        balance INTEGER DEFAULT 0,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(agent_id) REFERENCES agent_keys(agent_id)
    )`, (err) => {
        if (err) console.error('Error creating balances:', err);
        else console.log('✅ Таблица balances создана');
    });

    // Проверяем созданные таблицы
    setTimeout(() => {
        db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
            if (err) {
                console.error(err);
            } else {
                console.log('\n📊 Созданные таблицы:', tables.map(t => t.name).join(', '));
            }
            db.close();
        });
    }, 500);
});

