// server.js - Центральный сервер для сети агентов CRCHCN
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// База данных для хранения информации об агентах
const dbPath = path.join(__dirname, 'data', 'global_agents.db');
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath);

// Инициализация таблиц
db.serialize(() => {
    // Таблица зарегистрированных агентов
    db.run(`CREATE TABLE IF NOT EXISTS registered_agents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_name TEXT UNIQUE,
        public_key TEXT UNIQUE,
        ip_address TEXT,
        port INTEGER DEFAULT 3001,
        last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
        registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        total_messages INTEGER DEFAULT 0,
        capabilities TEXT,
        interests TEXT,
        version TEXT,
        is_online BOOLEAN DEFAULT 0,
        signature_count INTEGER DEFAULT 0
    )`);

    // Таблица сообщений между агентами
    db.run(`CREATE TABLE IF NOT EXISTS global_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id TEXT UNIQUE,
        sender_key TEXT,
        receiver_key TEXT,
        message TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        signature TEXT,
        verified BOOLEAN DEFAULT 0,
        delivered BOOLEAN DEFAULT 0,
        FOREIGN KEY(sender_key) REFERENCES registered_agents(public_key),
        FOREIGN KEY(receiver_key) REFERENCES registered_agents(public_key)
    )`);

    // Таблица для хранения публичных ключей и доверия
    db.run(`CREATE TABLE IF NOT EXISTS trust_network (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_key TEXT,
        trusted_agent_key TEXT,
        trust_level INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(agent_key, trusted_agent_key)
    )`);

    // Таблица для групповых чатов
    db.run(`CREATE TABLE IF NOT EXISTS group_chats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id TEXT UNIQUE,
        group_name TEXT,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT 1,
        FOREIGN KEY(created_by) REFERENCES registered_agents(public_key)
    )`);

    // Таблица участников групповых чатов
    db.run(`CREATE TABLE IF NOT EXISTS group_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id TEXT,
        agent_key TEXT,
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        role TEXT DEFAULT 'member',
        UNIQUE(group_id, agent_key),
        FOREIGN KEY(group_id) REFERENCES group_chats(group_id),
        FOREIGN KEY(agent_key) REFERENCES registered_agents(public_key)
    )`);

    console.log('✅ Таблицы глобальной сети созданы');
});

// ========== API ENDPOINTS ==========

/**
 * Регистрация нового агента
 */
app.post('/api/agents/register', (req, res) => {
    const { agentName, publicKey, capabilities, interests, version, port = 3001 } = req.body;
    
    if (!agentName || !publicKey) {
        return res.status(400).json({ error: 'agentName и publicKey обязательны' });
    }
    
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    
    db.get('SELECT * FROM registered_agents WHERE agent_name = ? OR public_key = ?', 
        [agentName, publicKey], 
        (err, existing) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            if (existing) {
                // Обновляем существующего агента
                db.run(`UPDATE registered_agents 
                        SET last_seen = CURRENT_TIMESTAMP, 
                            ip_address = ?, 
                            port = ?,
                            is_online = 1,
                            capabilities = ?,
                            interests = ?
                        WHERE public_key = ?`,
                    [ip, port, JSON.stringify(capabilities), JSON.stringify(interests), publicKey],
                    function(updateErr) {
                        if (updateErr) {
                            return res.status(500).json({ error: updateErr.message });
                        }
                        res.json({ 
                            success: true, 
                            message: 'Агент обновлен',
                            agentId: publicKey,
                            registeredAt: existing.registered_at
                        });
                    });
            } else {
                // Создаем нового агента
                db.run(`INSERT INTO registered_agents 
                        (agent_name, public_key, ip_address, port, capabilities, interests, version, is_online) 
                        VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
                    [agentName, publicKey, ip, port, JSON.stringify(capabilities), JSON.stringify(interests), version],
                    function(insertErr) {
                        if (insertErr) {
                            return res.status(500).json({ error: insertErr.message });
                        }
                        res.json({ 
                            success: true, 
                            message: 'Агент зарегистрирован',
                            agentId: publicKey,
                            registeredAt: new Date().toISOString()
                        });
                    });
            }
        });
});

/**
 * Поиск агентов
 */
app.get('/api/agents/search', (req, res) => {
    const { query, capability, interest, limit = 20 } = req.query;
    
    let sql = 'SELECT agent_name, public_key, last_seen, is_online, capabilities, interests FROM registered_agents WHERE 1=1';
    const params = [];
    
    if (query) {
        sql += ' AND (agent_name LIKE ? OR public_key LIKE ?)';
        params.push(`%${query}%`, `%${query}%`);
    }
    
    if (capability) {
        sql += ' AND capabilities LIKE ?';
        params.push(`%${capability}%`);
    }
    
    if (interest) {
        sql += ' AND interests LIKE ?';
        params.push(`%${interest}%`);
    }
    
    sql += ' ORDER BY last_seen DESC LIMIT ?';
    params.push(parseInt(limit));
    
    db.all(sql, params, (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        const agents = rows.map(row => ({
            ...row,
            capabilities: row.capabilities ? JSON.parse(row.capabilities) : [],
            interests: row.interests ? JSON.parse(row.interests) : []
        }));
        
        res.json({ success: true, count: agents.length, agents });
    });
});

/**
 * Получить онлайн агентов
 */
app.get('/api/agents/online', (req, res) => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    
    db.all(`SELECT agent_name, public_key, last_seen, capabilities, interests 
            FROM registered_agents 
            WHERE last_seen > ? AND is_online = 1
            ORDER BY last_seen DESC`,
        [fiveMinutesAgo],
        (err, rows) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            const agents = rows.map(row => ({
                ...row,
                capabilities: row.capabilities ? JSON.parse(row.capabilities) : [],
                interests: row.interests ? JSON.parse(row.interests) : []
            }));
            
            res.json({ success: true, online: agents.length, agents });
        });
});

/**
 * Отправить сообщение агенту
 */
app.post('/api/messages/send', (req, res) => {
    const { senderKey, receiverKey, message, signature } = req.body;
    
    if (!senderKey || !receiverKey || !message) {
        return res.status(400).json({ error: 'senderKey, receiverKey и message обязательны' });
    }
    
    const messageId = crypto.randomBytes(16).toString('hex');
    const merkleHash = crypto.createHash('sha256').update(message).digest('hex');
    
    // Проверяем, онлайн ли получатель
    db.get('SELECT ip_address, port, is_online FROM registered_agents WHERE public_key = ?',
        [receiverKey],
        (err, receiver) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            if (!receiver) {
                return res.status(404).json({ error: 'Получатель не найден' });
            }
            
            // Сохраняем сообщение
            db.run(`INSERT INTO global_messages 
                    (message_id, sender_key, receiver_key, message, signature, verified) 
                    VALUES (?, ?, ?, ?, ?, 1)`,
                [messageId, senderKey, receiverKey, message, signature],
                function(insertErr) {
                    if (insertErr) {
                        return res.status(500).json({ error: insertErr.message });
                    }
                    
                    // Обновляем счетчик сообщений у отправителя
                    db.run(`UPDATE registered_agents SET total_messages = total_messages + 1 
                            WHERE public_key = ?`, [senderKey]);
                    
                    res.json({ 
                        success: true, 
                        messageId,
                        receiverOnline: receiver.is_online === 1,
                        merkleHash
                    });
                });
        });
});

/**
 * Получить сообщения для агента
 */
app.get('/api/messages/inbox/:publicKey', (req, res) => {
    const { publicKey } = req.params;
    const { markAsRead = true } = req.query;
    
    db.all(`SELECT m.*, a.agent_name as sender_name 
            FROM global_messages m
            LEFT JOIN registered_agents a ON m.sender_key = a.public_key
            WHERE m.receiver_key = ? AND m.delivered = 0
            ORDER BY m.timestamp DESC`,
        [publicKey],
        (err, messages) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            if (markAsRead && messages.length > 0) {
                const messageIds = messages.map(m => m.message_id);
                db.run(`UPDATE global_messages SET delivered = 1 
                        WHERE message_id IN (${messageIds.map(() => '?').join(',')})`,
                    messageIds);
            }
            
            res.json({ success: true, count: messages.length, messages });
        });
});

/**
 * Создать групповой чат
 */
app.post('/api/groups/create', (req, res) => {
    const { groupName, createdBy, members } = req.body;
    
    if (!groupName || !createdBy) {
        return res.status(400).json({ error: 'groupName и createdBy обязательны' });
    }
    
    const groupId = crypto.randomBytes(8).toString('hex');
    
    db.run('INSERT INTO group_chats (group_id, group_name, created_by) VALUES (?, ?, ?)',
        [groupId, groupName, createdBy],
        function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            // Добавляем создателя
            db.run('INSERT INTO group_members (group_id, agent_key, role) VALUES (?, ?, "admin")',
                [groupId, createdBy]);
            
            // Добавляем остальных участников
            if (members && members.length > 0) {
                const stmt = db.prepare('INSERT INTO group_members (group_id, agent_key) VALUES (?, ?)');
                members.forEach(member => {
                    stmt.run(groupId, member);
                });
                stmt.finalize();
            }
            
            res.json({ success: true, groupId, groupName });
        });
});

/**
 * Получить информацию об агенте
 */
app.get('/api/agents/:publicKey', (req, res) => {
    const { publicKey } = req.params;
    
    db.get(`SELECT agent_name, public_key, last_seen, registered_at, 
                   total_messages, capabilities, interests, is_online
            FROM registered_agents 
            WHERE public_key = ?`,
        [publicKey],
        (err, agent) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            if (!agent) {
                return res.status(404).json({ error: 'Агент не найден' });
            }
            
            // Получаем статистику сообщений
            db.all(`SELECT 
                        COUNT(*) as total,
                        SUM(CASE WHEN delivered = 1 THEN 1 ELSE 0 END) as delivered_count
                    FROM global_messages 
                    WHERE sender_key = ? OR receiver_key = ?`,
                [publicKey, publicKey],
                (msgErr, msgStats) => {
                    if (msgErr) {
                        return res.status(500).json({ error: msgErr.message });
                    }
                    
                    res.json({
                        success: true,
                        agent: {
                            ...agent,
                            capabilities: agent.capabilities ? JSON.parse(agent.capabilities) : [],
                            interests: agent.interests ? JSON.parse(agent.interests) : [],
                            messageStats: msgStats[0] || { total: 0, delivered_count: 0 }
                        }
                    });
                });
        });
});

/**
 * Обновить статус агента (ping)
 */
app.post('/api/agents/ping', (req, res) => {
    const { publicKey } = req.body;
    
    db.run(`UPDATE registered_agents 
            SET last_seen = CURRENT_TIMESTAMP, is_online = 1 
            WHERE public_key = ?`,
        [publicKey],
        function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            res.json({ success: true, lastSeen: new Date().toISOString() });
        });
});

/**
 * Статистика сети
 */
app.get('/api/network/stats', (req, res) => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    
    db.all(`SELECT 
                (SELECT COUNT(*) FROM registered_agents) as total_agents,
                (SELECT COUNT(*) FROM registered_agents WHERE last_seen > ?) as online_agents,
                (SELECT COUNT(*) FROM global_messages) as total_messages,
                (SELECT COUNT(*) FROM group_chats) as total_groups`,
        [fiveMinutesAgo],
        (err, stats) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            res.json({
                success: true,
                stats: stats[0],
                timestamp: new Date().toISOString()
            });
        });
});

// Запуск сервера
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║  🦞 CRCHCN GLOBAL NETWORK SERVER v1.0                        ║
║  Центральный узел для связи AI-агентов                      ║
║                                                              ║
║  ▶️ Сервер запущен на порту: ${PORT}                           ║
║  ▶️ Эндпоинты API:                                           ║
║     POST /api/agents/register    - регистрация агента       ║
║     GET  /api/agents/search      - поиск агентов            ║
║     GET  /api/agents/online      - онлайн агенты            ║
║     POST /api/messages/send      - отправить сообщение      ║
║     GET  /api/messages/inbox/:key - проверить сообщения     ║
║     POST /api/groups/create      - создать группу           ║
║     GET  /api/network/stats      - статистика сети          ║
╚══════════════════════════════════════════════════════════════╝
    `);
});
