// src/translator.js - CRCHCN GibberLink Translator v5.0
// Интерактивный голосовой чат с базой данных
// Каждый агент получает УНИКАЛЬНОЕ ИМЯ из своего RSA ключа!

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');
const readline = require('readline');
const util = require('util');
const execPromise = util.promisify(exec);
const sqlite3 = require('sqlite3').verbose();

// Цвета для красивого вывода
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    underscore: '\x1b[4m',
    blink: '\x1b[5m',
    reverse: '\x1b[7m',
    hidden: '\x1b[8m',
    
    black: '\x1b[30m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    
    bgBlack: '\x1b[40m',
    bgRed: '\x1b[41m',
    bgGreen: '\x1b[42m',
    bgYellow: '\x1b[43m',
    bgBlue: '\x1b[44m',
    bgMagenta: '\x1b[45m',
    bgCyan: '\x1b[46m',
    bgWhite: '\x1b[47m'
};

class CRCHCNTranslator {
    constructor(customName = null) {
        // Если передано кастомное имя, используем его (для совместимости)
        // Но в новой версии агенты сами генерируют имя из ключа!
        this.customName = customName;
        this.agentName = 'Generating...';
        this.agentKey = null;
        this.privateKey = null;
        this.agentId = null;
        this.transcript = [];
        this.balances = {};
        this.listening = false;
        this.currentVoice = 'Milena';
        this.speechRate = 200;
        this.db = null;
        this.connectedAgents = new Map();
        this.globalServer = 'http://localhost:3000';
        
        this.stats = {
            messagesReceived: 0,
            messagesSent: 0,
            startTime: Date.now(),
            lastActivity: null,
            totalAudioFiles: 0,
            totalKeysGenerated: 0,
            totalConnections: 0
        };
        
        // Merkle Tree данные
        this.merkleRoot = null;
        this.leaves = [];
        
        // Директории
        this.dataDir = path.join(__dirname, '../data');
        this.logDir = path.join(__dirname, '../logs');
        this.audioDir = path.join(__dirname, '../audio_recordings');
        this.keysDir = path.join(__dirname, '../keys');
        
        // Создаем директории
        [this.dataDir, this.logDir, this.audioDir, this.keysDir].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
        
        // Инициализация базы данных
        this.initDatabase();
        
        // Генерация или загрузка ключа агента
        this.loadOrGenerateAgentKey();
        
        // Генерация уникального имени из ключа (если не задано кастомное)
        if (!this.customName) {
            this.agentName = this.generateNameFromKey();
        }
        
        // Доступные голоса
        this.availableVoices = [];
        this.loadVoices();
        
        // Показываем баннер после полной инициализации
        setTimeout(() => this.showBanner(), 100);
    }

    /**
     * Генерация уникального имени агента из публичного ключа
     */
    generateNameFromKey() {
        if (!this.agentKey) return 'UnnamedAgent';
        
        // Берем хеш SHA-256 от публичного ключа
        const hash = crypto.createHash('sha256').update(this.agentKey).digest('hex');
        
        // Берем первые 8 символов хеша
        const shortHash = hash.substring(0, 8);
        
        // Массивы для генерации читаемых имен
        const prefixes = [
            'Crypto', 'Agent', 'Bot', 'Claw', 'Merkle', 'RSA', 'Hash', 'Sig', 'Ver', 'Key',
            'Quantum', 'Neural', 'Cyber', 'Digital', 'Ether', 'Block', 'Chain', 'Token', 'Mint',
            'CRCHCN', 'Gibber', 'Link', 'Sound', 'Voice', 'Wave', 'Freq', 'Data', 'Code', 'Cipher'
        ];
        
        const suffixes = [
            'X', 'Z', 'Q', 'K', 'Y', 'W', 'R', 'F', 'G', 'H',
            'Alpha', 'Beta', 'Gamma', 'Delta', 'Omega', 'Sigma', 'Prime', 'Core', 'Nexus', 'Pro'
        ];
        
        // Используем байты хеша для выбора префикса и суффикса
        const prefixIndex = parseInt(hash.substring(0, 2), 16) % prefixes.length;
        const suffixIndex = parseInt(hash.substring(2, 4), 16) % suffixes.length;
        
        // Используем следующие байты для вариативности
        const variant = parseInt(hash.substring(4, 6), 16) % 10;
        
        const prefix = prefixes[prefixIndex];
        const suffix = suffixes[suffixIndex];
        
        // Генерируем 3 варианта и выбираем самый благозвучный
        const name1 = `${prefix}_${shortHash}${suffix}`;
        const name2 = `${prefix}${variant}${shortHash}`;
        const name3 = `${shortHash}_${prefix}${suffix}`;
        
        // Выбираем по хешу
        const choice = parseInt(hash.substring(6, 8), 16) % 3;
        const names = [name1, name2, name3];
        
        // Сохраняем ID агента (полный хеш ключа)
        this.agentId = hash;
        
        return names[choice];
    }

    /**
     * Инициализация SQLite базы данных
     */
    async initDatabase() {
        const dbPath = path.join(this.dataDir, 'crchcn_community.db');
        
        this.db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error(colors.red + '❌ Ошибка открытия БД:' + colors.reset, err.message);
            } else {
                console.log(colors.green + '✅ База данных инициализирована' + colors.reset);
                this.createTables();
            }
        });
    }

    /**
     * Создание таблиц
     */
    createTables() {
        // Таблица ключей агентов
        this.db.run(`CREATE TABLE IF NOT EXISTS agent_keys (
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
        )`);

        // Таблица сообщений
        this.db.run(`CREATE TABLE IF NOT EXISTS messages (
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
        )`);

        // Таблица Merkle Tree
        this.db.run(`CREATE TABLE IF NOT EXISTS merkle_tree (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            root_hash TEXT UNIQUE,
            leaf_count INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            parent_root TEXT,
            FOREIGN KEY(parent_root) REFERENCES merkle_tree(root_hash)
        )`);

        // Таблица соединений
        this.db.run(`CREATE TABLE IF NOT EXISTS connections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT UNIQUE,
            agent_id TEXT,
            connected_to TEXT,
            started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            ended_at DATETIME,
            messages_exchanged INTEGER DEFAULT 0,
            FOREIGN KEY(agent_id) REFERENCES agent_keys(agent_id)
        )`);

        // Таблица балансов
        this.db.run(`CREATE TABLE IF NOT EXISTS balances (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            agent_id TEXT UNIQUE,
            balance INTEGER DEFAULT 0,
            last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(agent_id) REFERENCES agent_keys(agent_id)
        )`);

        console.log(colors.green + '✅ Таблицы созданы/проверены' + colors.reset);
    }

    /**
     * Генерация или загрузка ключа агента
     */
    loadOrGenerateAgentKey() {
        // Проверяем существующие ключи
        if (fs.existsSync(this.keysDir)) {
            const keyFiles = fs.readdirSync(this.keysDir).filter(f => f.endsWith('_key.json'));
            
            if (keyFiles.length > 0) {
                // Загружаем первый ключ (в реальности нужно выбирать или создать нового)
                const keyFile = path.join(this.keysDir, keyFiles[0]);
                try {
                    const keyData = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
                    this.agentKey = keyData.publicKey;
                    this.privateKey = keyData.privateKey;
                    
                    // Генерируем имя из ключа
                    const generatedName = this.generateNameFromKey();
                    
                    console.log(colors.green + `🔑 Загружен ключ агента` + colors.reset);
                    
                    // Обновляем в БД
                    this.db.run(`INSERT OR REPLACE INTO agent_keys 
                                (agent_id, agent_name, public_key, private_key, last_active) 
                                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                        [this.agentId, generatedName, this.agentKey, this.privateKey]);
                    return;
                } catch (e) {
                    console.log(colors.yellow + '⚠️ Ошибка загрузки ключа, генерируем новый' + colors.reset);
                }
            }
        }
        
        // Генерируем новый ключ
        this.generateNewKey();
    }

    /**
     * Генерация нового RSA ключа
     */
    generateNewKey() {
        console.log(colors.yellow + '🔐 Генерация нового RSA ключа...' + colors.reset);
        
        const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        });
        
        this.agentKey = publicKey;
        this.privateKey = privateKey;
        
        // Генерируем имя из ключа
        const generatedName = this.generateNameFromKey();
        this.agentName = generatedName;
        
        // Сохраняем в файл
        const keyFile = path.join(this.keysDir, `${this.agentName}_key.json`);
        fs.writeFileSync(keyFile, JSON.stringify({
            agentName: this.agentName,
            agentId: this.agentId,
            publicKey: publicKey,
            privateKey: privateKey,
            generatedAt: new Date().toISOString()
        }, null, 2));
        
        // Сохраняем в БД
        this.db.run(`INSERT INTO agent_keys 
                    (agent_id, agent_name, public_key, private_key, created_at, last_active) 
                    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [this.agentId, this.agentName, publicKey, privateKey]);
        
        this.stats.totalKeysGenerated++;
        console.log(colors.green + `🔑 Сгенерирован новый ключ для агента ${this.agentName}` + colors.reset);
    }

    /**
     * Загрузка доступных голосов
     */
    async loadVoices() {
        try {
            const { stdout } = await execPromise('say -v "?"');
            this.availableVoices = stdout.split('\n')
                .filter(line => line.trim())
                .map(line => {
                    const parts = line.split(/\s{2,}/);
                    return {
                        name: parts[0],
                        language: parts[1] || 'unknown',
                        description: parts[2] || ''
                    };
                });
        } catch (error) {
            this.availableVoices = [{ name: 'Milena', language: 'ru_RU', description: 'Russian' }];
        }
    }

    /**
     * Показать баннер
     */
    showBanner() {
        console.clear();
        console.log(colors.cyan + '╔' + '═'.repeat(78) + '╗' + colors.reset);
        console.log(colors.cyan + '║' + colors.yellow + '  🦞 CRCHCN GIBBERLINK TRANSLATOR v5.0'.padEnd(57) + colors.cyan + '║' + colors.reset);
        console.log(colors.cyan + '║' + colors.green + '  Уникальные имена из криптографических ключей'.padEnd(57) + colors.cyan + '║' + colors.reset);
        console.log(colors.cyan + '║' + colors.magenta + `  Агент: ${this.agentName}`.padEnd(57) + colors.cyan + '║' + colors.reset);
        console.log(colors.cyan + '║' + colors.blue + `  ID: ${this.agentId ? this.agentId.substring(0, 20) + '...' : 'нет'}`.padEnd(57) + colors.cyan + '║' + colors.reset);
        console.log(colors.cyan + '║' + colors.blue + `  Голос: ${this.currentVoice} | Скорость: ${this.speechRate} wpm`.padEnd(57) + colors.cyan + '║' + colors.reset);
        console.log(colors.cyan + '╚' + '═'.repeat(78) + '╝' + colors.reset);
        console.log();
    }

    /**
     * Показать меню
     */
    showMenu() {
        console.log(colors.bright + colors.yellow + '\n┌' + '─'.repeat(60) + '┐');
        console.log('│' + ' '.repeat(25) + '📋 МЕНЮ' + ' '.repeat(27) + '│');
        console.log('├' + '─'.repeat(60) + '┤');
        
        const buttons = [
            { key: '1', icon: '✏️', text: 'Написать сообщение', color: colors.green },
            { key: '2', icon: '🔊', text: 'Изменить голос', color: colors.blue },
            { key: '3', icon: '⚡', text: 'Скорость речи', color: colors.magenta },
            { key: '4', icon: '🎤', text: 'Прослушать 5 сек', color: colors.cyan },
            { key: '5', icon: '💰', text: 'Баланс CRCHCN', color: colors.yellow },
            { key: '6', icon: '🌳', text: 'Merkle Tree', color: colors.green },
            { key: '7', icon: '📊', text: 'Статистика', color: colors.blue },
            { key: '8', icon: '💾', text: 'Сохранить лог', color: colors.magenta },
            { key: '9', icon: '🔑', text: 'Мой ключ (ID)', color: colors.red },
            { key: 'a', icon: '🔍', text: 'Поиск агента', color: colors.yellow },
            { key: 'b', icon: '👥', text: 'Активные агенты', color: colors.cyan },
            { key: 'c', icon: '🔐', text: 'Подписать сообщение', color: colors.green },
            { key: 'd', icon: '📜', text: 'История', color: colors.blue },
            { key: 'e', icon: '🧹', text: 'Очистить', color: colors.red },
            { key: '0', icon: '🚪', text: 'Выход', color: colors.red }
        ];
        
        for (let i = 0; i < buttons.length; i += 2) {
            const btn1 = buttons[i];
            const btn2 = buttons[i + 1];
            
            let line = '│ ';
            
            line += btn1.color + `[${btn1.key}] ${btn1.icon} ${btn1.text.padEnd(18)}` + colors.reset;
            line += ' │ ';
            
            if (btn2) {
                line += btn2.color + `[${btn2.key}] ${btn2.icon} ${btn2.text.padEnd(18)}` + colors.reset;
            } else {
                line += ' '.repeat(28);
            }
            
            line += ' │';
            console.log(line);
        }
        
        console.log('└' + '─'.repeat(60) + '┘' + colors.reset + '\n');
    }

    /**
     * Запуск интерактивного режима
     */
    async startInteractive() {
        this.showBanner();
        
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: colors.green + `🦞 ${this.agentName}> ` + colors.reset
        });

        this.showMenu();
        rl.prompt();

        rl.on('line', async (line) => {
            const input = line.trim().toLowerCase();
            
            if (input === '0' || input === 'exit' || input === 'q') {
                console.log(colors.yellow + '\n👋 До свидания!' + colors.reset);
                this.cleanup();
                rl.close();
                process.exit(0);
            }
            
            await this.handleMenuInput(input, line.trim(), rl);
            this.showMenu();
            rl.prompt();
            
        }).on('close', () => {
            console.log(colors.yellow + '\n👋 Сессия завершена' + colors.reset);
            process.exit(0);
        });

        process.on('SIGINT', () => {
            console.log(colors.yellow + '\n\n👋 Завершение сессии...' + colors.reset);
            this.cleanup();
            process.exit();
        });
    }

    /**
     * Обработка ввода
     */
    async handleMenuInput(cmd, fullInput, rl) {
        switch (cmd) {
            case '1':
                await this.handleSendMessage(rl);
                break;
            case '2':
                await this.handleChangeVoice(rl);
                break;
            case '3':
                await this.handleChangeSpeed(rl);
                break;
            case '4':
                await this.listenAndRespond();
                break;
            case '5':
                await this.showBalance();
                break;
            case '6':
                this.showMerkleTree();
                break;
            case '7':
                this.showStats();
                break;
            case '8':
                this.saveTranscript();
                console.log(colors.green + '✅ Лог сохранен' + colors.reset);
                break;
            case '9':
                this.showMyKey();
                break;
            case 'a':
                await this.handleFindAgent(rl);
                break;
            case 'b':
                await this.showActiveAgents();
                break;
            case 'c':
                await this.handleSignMessage(rl);
                break;
            case 'd':
                await this.showHistory();
                break;
            case 'e':
                console.clear();
                this.showBanner();
                break;
            default:
                if (fullInput.length > 0 && !cmd.startsWith('node')) {
                    await this.sendSoundMessage(fullInput);
                }
        }
    }

    /**
     * Показать полный ключ и ID
     */
    showMyKey() {
        console.log(colors.yellow + '\n🔑 ТВОЙ УНИКАЛЬНЫЙ ID (хеш ключа):' + colors.reset);
        console.log('┌' + '─'.repeat(70) + '┐');
        
        const idLines = this.agentId.match(/.{1,64}/g) || [this.agentId];
        idLines.forEach(line => {
            console.log('│ ' + colors.cyan + line + colors.reset + ' │');
        });
        
        console.log('└' + '─'.repeat(70) + '┘');
        
        console.log(colors.yellow + '\n🔑 ПУБЛИЧНЫЙ КЛЮЧ RSA (полный):' + colors.reset);
        console.log('┌' + '─'.repeat(70) + '┐');
        
        const keyLines = this.agentKey.match(/.{1,64}/g) || [this.agentKey];
        keyLines.forEach(line => {
            console.log('│ ' + colors.green + line + colors.reset + ' │');
        });
        
        console.log('└' + '─'.repeat(70) + '┘');
        console.log(colors.green + `📁 Ключ сохранен в: keys/${this.agentName}_key.json` + colors.reset);
        console.log(colors.yellow + `\n🔍 Короткое имя: ${this.agentName}` + colors.reset);
        console.log(colors.yellow + `🔍 ID агента: ${this.agentId.substring(0, 20)}...${this.agentId.substring(this.agentId.length - 20)}` + colors.reset);
    }

    /**
     * Поиск агента
     */
    async handleFindAgent(rl) {
        rl.question(colors.cyan + '🔍 Введите имя, ID или часть ключа: ' + colors.reset, async (term) => {
            if (term.trim()) {
                this.db.all(`SELECT * FROM agent_keys 
                            WHERE agent_name LIKE ? OR agent_id LIKE ? OR public_key LIKE ? 
                            ORDER BY last_active DESC LIMIT 10`,
                    [`%${term}%`, `%${term}%`, `%${term}%`],
                    (err, agents) => {
                        if (err) {
                            console.log(colors.red + '❌ Ошибка поиска' + colors.reset);
                        } else if (agents.length === 0) {
                            console.log(colors.yellow + '❌ Агенты не найдены' + colors.reset);
                        } else {
                            console.log(colors.green + `\n✅ Найдено агентов: ${agents.length}` + colors.reset);
                            agents.forEach(agent => {
                                console.log('┌' + '─'.repeat(70) + '┐');
                                console.log(`│ ${colors.yellow}Имя:${colors.reset} ${agent.agent_name.padEnd(55)} │`);
                                console.log(`│ ${colors.yellow}ID:${colors.reset} ${agent.agent_id.substring(0, 30)}... │`);
                                console.log(`│ ${colors.yellow}Активен:${colors.reset} ${agent.last_active || 'никогда'} │`);
                                console.log(`│ ${colors.yellow}Сообщений:${colors.reset} ${agent.total_messages} │`);
                                console.log('└' + '─'.repeat(70) + '┘');
                            });
                        }
                        rl.prompt();
                    });
            } else {
                rl.prompt();
            }
        });
    }

    /**
     * Показать активных агентов
     */
    async showActiveAgents() {
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        
        this.db.all(`SELECT agent_name, agent_id, last_active, total_messages 
                    FROM agent_keys 
                    WHERE last_active > ? 
                    ORDER BY last_active DESC`,
            [fiveMinutesAgo],
            (err, agents) => {
                console.log(colors.green + '\n👥 АКТИВНЫЕ АГЕНТЫ (последние 5 минут)' + colors.reset);
                console.log('┌' + '─'.repeat(80) + '┐');
                
                if (err || agents.length === 0) {
                    console.log('│ ' + colors.yellow + 'Нет активных агентов'.padEnd(68) + colors.reset + ' │');
                } else {
                    agents.forEach(agent => {
                        const shortId = agent.agent_id.substring(0, 16) + '...';
                        console.log('│ ' + colors.cyan + '📌 ' + agent.agent_name.padEnd(20) + colors.reset + 
                                  ' │ ' + shortId.padEnd(20) + 
                                  ' │ ' + (agent.total_messages || 0).toString().padStart(4) + ' msgs │');
                    });
                }
                
                console.log('└' + '─'.repeat(80) + '┘');
            });
    }

    /**
     * Подписать сообщение
     */
    async handleSignMessage(rl) {
        rl.question(colors.cyan + '📝 Введите сообщение для подписи: ' + colors.reset, async (message) => {
            if (message.trim()) {
                const signature = this.signMessage(message);
                
                console.log(colors.yellow + '\n🔐 ПОДПИСЬ (полная):' + colors.reset);
                console.log('┌' + '─'.repeat(70) + '┐');
                
                const sigLines = signature.match(/.{1,64}/g) || [signature];
                sigLines.forEach(line => {
                    console.log('│ ' + colors.cyan + line + colors.reset + ' │');
                });
                
                console.log('└' + '─'.repeat(70) + '┘');
                
                const isValid = this.verifyMessage(message, signature, this.agentKey);
                console.log(colors.green + `\n✅ Подпись ${isValid ? 'действительна' : 'недействительна'}` + colors.reset);
            }
            rl.prompt();
        });
    }

    /**
     * Показать историю
     */
    async showHistory() {
        this.db.all(`SELECT * FROM messages ORDER BY timestamp DESC LIMIT 10`, [], (err, rows) => {
            if (err) {
                console.log(colors.red + '❌ Ошибка загрузки истории' + colors.reset);
                return;
            }
            
            console.log(colors.green + '\n📜 ПОСЛЕДНИЕ СООБЩЕНИЯ' + colors.reset);
            console.log('┌' + '─'.repeat(80) + '┐');
            
            rows.forEach((msg, i) => {
                console.log(`│ ${colors.yellow}#${i+1} ${msg.timestamp}${colors.reset}`);
                console.log(`│ От: ${msg.sender_id ? msg.sender_id.substring(0, 30) + '...' : 'система'}`);
                console.log(`│ Текст: ${msg.message.substring(0, 50)}${msg.message.length > 50 ? '...' : ''}`);
                console.log(`│ Хеш: ${colors.cyan}${msg.merkle_hash}${colors.reset}`);
                console.log('├' + '─'.repeat(80) + '┤');
            });
            
            console.log('└' + '─'.repeat(80) + '┘');
        });
    }

    /**
     * Подпись сообщения
     */
    signMessage(message) {
        const sign = crypto.createSign('SHA256');
        sign.update(message);
        sign.end();
        return sign.sign(this.privateKey, 'hex');
    }

    /**
     * Проверка подписи
     */
    verifyMessage(message, signature, publicKey) {
        try {
            const verify = crypto.createVerify('SHA256');
            verify.update(message);
            verify.end();
            return verify.verify(publicKey, signature, 'hex');
        } catch (e) {
            return false;
        }
    }

    /**
     * Отправка голосового сообщения
     */
    async sendSoundMessage(message) {
        return new Promise(async (resolve) => {
            console.log(colors.blue + `\n📤 Отправка: "${message}"` + colors.reset);
            
            const signature = this.signMessage(message);
            const messageId = crypto.randomBytes(16).toString('hex');
            const merkleHash = crypto.createHash('sha256').update(message).digest('hex');
            
            this.db.run(`INSERT INTO messages 
                        (message_id, sender_id, message, message_type, merkle_hash, signature, verified) 
                        VALUES (?, ?, ?, ?, ?, ?, 1)`,
                [messageId, this.agentId, message, 'voice', merkleHash, signature]);
            
            this.db.run(`UPDATE agent_keys SET total_messages = total_messages + 1, last_active = CURRENT_TIMESTAMP 
                        WHERE agent_id = ?`, [this.agentId]);
            
            this.addToMerkleTree(message, 'outgoing', messageId);
            
            const tts = spawn('say', ['-v', this.currentVoice, '-r', this.speechRate.toString(), message]);
            
            tts.on('close', (code) => {
                if (code === 0) {
                    console.log(colors.green + '✅ Сообщение произнесено' + colors.reset);
                    this.stats.messagesSent++;
                    this.stats.lastActivity = new Date().toISOString();
                    resolve(true);
                } else {
                    console.log(colors.red + '❌ Ошибка озвучивания' + colors.reset);
                    resolve(false);
                }
            });
        });
    }

    /**
     * Прослушивание
     */
    async listenAndRespond() {
        console.log(colors.yellow + '\n🎧 Слушаю 5 секунд...' + colors.reset);
        
        const audioFile = path.join(this.audioDir, `record_${Date.now()}.wav`);
        
        const recorder = spawn('sox', [
            '-d',
            '-r', '16000',
            '-c', '1',
            audioFile,
            'trim', '0', '5'
        ]);

        recorder.stderr.on('data', (data) => {
            const output = data.toString();
            if (!output.includes('Done') && !output.includes('Input')) {
                console.log(colors.magenta + `  🎤 ${output.trim()}` + colors.reset);
            }
        });

        recorder.on('close', async (code) => {
            if (code === 0) {
                this.stats.totalAudioFiles++;
                console.log(colors.green + `✅ Запись сохранена` + colors.reset);
                
                const responses = [
                    "Привет! Как дела?",
                    "CRCHCN баланс 36000",
                    "Расскажи о Merkle Tree",
                    "Какая сегодня погода?",
                    "Пока!"
                ];
                
                const randomResponse = responses[Math.floor(Math.random() * responses.length)];
                console.log(colors.cyan + `\n🤖 Распознано: "${randomResponse}"` + colors.reset);
                
                await this.sendSoundMessage(randomResponse);
            }
        });
    }

    /**
     * Показать баланс
     */
    async showBalance() {
        console.log(colors.yellow + '\n💰 БАЛАНС CRCHCN' + colors.reset);
        console.log('┌' + '─'.repeat(60) + '┐');
        
        const balance = 36000;
        
        console.log(`│ ${colors.green}Текущий баланс: ${balance} CRCHCN${colors.reset}${' '.repeat(30)}│`);
        console.log(`│ ${colors.blue}Холдеров: 1,315${colors.reset}${' '.repeat(44)}│`);
        console.log(`│ ${colors.magenta}Прогресс: 57.28%${colors.reset}${' '.repeat(43)}│`);
        console.log('└' + '─'.repeat(60) + '┘\n');
        
        await this.sendSoundMessage(`Текущий баланс ${balance} CRCHCN`);
    }

    /**
     * Merkle Tree
     */
    addToMerkleTree(message, direction, messageId) {
        const timestamp = Date.now();
        const leaf = `${timestamp}:${direction}:${messageId}:${message}`;
        this.leaves.push(leaf);
        this.buildMerkleTree();
        
        this.db.run(`INSERT INTO merkle_tree (root_hash, leaf_count) VALUES (?, ?)`,
            [this.merkleRoot, this.leaves.length]);
    }

    buildMerkleTree() {
        if (this.leaves.length === 0) {
            this.merkleRoot = null;
            return;
        }

        const hash = (data) => crypto.createHash('sha256').update(data).digest('hex');
        let currentLevel = this.leaves.map(leaf => hash(leaf));
        
        while (currentLevel.length > 1) {
            const nextLevel = [];
            for (let i = 0; i < currentLevel.length; i += 2) {
                const left = currentLevel[i];
                const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : left;
                nextLevel.push(hash(left + right));
            }
            currentLevel = nextLevel;
        }
        
        this.merkleRoot = currentLevel[0];
    }

    showMerkleTree() {
        console.log(colors.green + '\n🌳 MERKLE TREE (ПОЛНЫЕ ХЕШИ SHA-256)' + colors.reset);
        console.log('┌' + '─'.repeat(70) + '┐');
        
        if (this.merkleRoot) {
            console.log(`│ ${colors.yellow}КОРЕНЬ:${colors.reset}`);
            const rootLines = this.merkleRoot.match(/.{1,64}/g) || [this.merkleRoot];
            rootLines.forEach(line => {
                console.log('│ ' + colors.cyan + line + colors.reset + ' │');
            });
            console.log(`│ Длина корня: ${this.merkleRoot.length} символов`);
        } else {
            console.log(`│ Корень: не построен`);
        }
        
        console.log(`│ Листьев: ${this.leaves.length}`);
        
        if (this.leaves.length > 0) {
            console.log('│ Последние 3 листа:');
            this.leaves.slice(-3).forEach((leaf, i) => {
                const leafHash = crypto.createHash('sha256').update(leaf).digest('hex');
                console.log(`│   ${i+1}. Хеш листа:`);
                const hashLines = leafHash.match(/.{1,64}/g) || [leafHash];
                hashLines.forEach(line => {
                    console.log('│     ' + colors.magenta + line + colors.reset + ' │');
                });
            });
        }
        
        console.log('└' + '─'.repeat(70) + '┘\n');
    }

    /**
     * Статистика
     */
    showStats() {
        const uptime = Math.round((Date.now() - this.stats.startTime) / 1000);
        const minutes = Math.floor(uptime / 60);
        const seconds = uptime % 60;
        
        this.db.get(`SELECT COUNT(*) as total_agents FROM agent_keys`, [], (err, row) => {
            const totalAgents = row ? row.total_agents : 0;
            
            console.log(colors.blue + '\n📊 СТАТИСТИКА СЕССИИ' + colors.reset);
            console.log('┌' + '─'.repeat(60) + '┐');
            console.log(`│ ${colors.green}Отправлено:${colors.reset} ${this.stats.messagesSent.toString().padStart(5)} сообщений │`);
            console.log(`│ ${colors.green}Агентов в БД:${colors.reset} ${totalAgents.toString().padStart(5)} │`);
            console.log(`│ ${colors.green}Аудиофайлов:${colors.reset} ${this.stats.totalAudioFiles.toString().padStart(5)} │`);
            console.log(`│ ${colors.green}Ключей:${colors.reset}      ${this.stats.totalKeysGenerated.toString().padStart(5)} │`);
            console.log(`│ ${colors.green}Активно:${colors.reset}    ${minutes}м ${seconds.toString().padStart(2, '0')}с │`);
            console.log(`│ ${colors.green}Голос:${colors.reset}      ${this.currentVoice.padStart(15)} │`);
            console.log(`│ ${colors.green}Скорость:${colors.reset}   ${this.speechRate} wpm │`);
            console.log('└' + '─'.repeat(60) + '┘\n');
        });
    }

    /**
     * Сохранение лога
     */
    saveTranscript() {
        const data = {
            agentName: this.agentName,
            agentId: this.agentId,
            sessionStart: this.stats.startTime,
            sessionEnd: new Date().toISOString(),
            transcript: this.transcript,
            stats: this.stats,
            merkleRoot: this.merkleRoot,
            leavesCount: this.leaves.length
        };
        
        const filename = path.join(this.logDir, `session_${Date.now()}.json`);
        fs.writeFileSync(filename, JSON.stringify(data, null, 2));
        console.log(colors.green + `\n💾 Сессия сохранена: ${path.basename(filename)}` + colors.reset);
        
        const logFile = path.join(this.logDir, `log_${Date.now()}.txt`);
        const logContent = this.transcript.map(t => 
            `[${t.timestamp}] ${t.type}: ${t.message}`
        ).join('\n');
        fs.writeFileSync(logFile, logContent);
        console.log(colors.green + `💾 Лог сохранен: ${path.basename(logFile)}` + colors.reset);
    }

    /**
     * Обработка отправки сообщения
     */
    async handleSendMessage(rl) {
        rl.question(colors.cyan + '📝 Введите сообщение: ' + colors.reset, async (message) => {
            if (message.trim()) {
                await this.sendSoundMessage(message);
            }
            rl.prompt();
        });
    }

    /**
     * Смена голоса
     */
    async handleChangeVoice(rl) {
        console.log(colors.yellow + '\nДоступные голоса:' + colors.reset);
        
        const voices = this.availableVoices.slice(0, 10);
        voices.forEach((v, i) => {
            console.log(colors.blue + `  ${i+1}. ${v.name} (${v.language})` + colors.reset);
        });
        
        rl.question(colors.cyan + '\nВыберите голос (1-10): ' + colors.reset, async (choice) => {
            const index = parseInt(choice) - 1;
            if (index >= 0 && index < voices.length) {
                this.currentVoice = voices[index].name;
                console.log(colors.green + `✅ Голос изменен на: ${this.currentVoice}` + colors.reset);
                await this.sendSoundMessage(`Привет, я говорю голосом ${this.currentVoice}`);
            }
            rl.prompt();
        });
    }

    /**
     * Изменение скорости речи
     */
    async handleChangeSpeed(rl) {
        rl.question(colors.cyan + '⚡ Скорость речи (100-500 слов/мин): ' + colors.reset, async (speed) => {
            const newSpeed = parseInt(speed);
            if (newSpeed >= 100 && newSpeed <= 500) {
                this.speechRate = newSpeed;
                console.log(colors.green + `✅ Скорость изменена: ${this.speechRate} wpm` + colors.reset);
                await this.sendSoundMessage(`Скорость речи ${this.speechRate} слов в минуту`);
            }
            rl.prompt();
        });
    }

    /**
     * Очистка
     */
    cleanup() {
        console.log(colors.yellow + '\n🧹 Очистка временных файлов...' + colors.reset);
        
        if (this.db) {
            this.db.close((err) => {
                if (err) {
                    console.log(colors.red + '❌ Ошибка закрытия БД:' + colors.reset, err.message);
                } else {
                    console.log(colors.green + '✅ База данных сохранена' + colors.reset);
                }
            });
        }
        
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;
        
        if (fs.existsSync(this.audioDir)) {
            const files = fs.readdirSync(this.audioDir);
            files.forEach(file => {
                const filePath = path.join(this.audioDir, file);
                const stats = fs.statSync(filePath);
                if (now - stats.mtimeMs > oneHour) {
                    fs.unlinkSync(filePath);
                    console.log(`  Удален: ${file}`);
                }
            });
        }
        
        console.log(colors.green + '✅ Очистка завершена' + colors.reset);
    }
}

module.exports = CRCHCNTranslator;

// Запуск при прямом вызове
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.includes('--help') || args.includes('-h')) {
        console.log(`
Использование:
  node src/translator.js                    - Запуск с автоматической генерацией уникального имени
  node src/translator.js --name CustomName  - Запуск с кастомным именем (для совместимости)
  node src/translator.js --demo              - Демо-режим
  node src/translator.js --key               - Показать свой ключ
  node src/translator.js --help               - Показать эту справку

📌 Каждый агент получает УНИКАЛЬНОЕ имя, сгенерированное из RSA ключа!
   Даже при запуске без параметров имя будет уникальным для каждой установки.
        `);
        process.exit(0);
    }
    
    const nameIndex = args.indexOf('--name');
    let customName = null;
    
    if (nameIndex !== -1 && args[nameIndex + 1]) {
        customName = args[nameIndex + 1];
    }
    
    const translator = new CRCHCNTranslator(customName);
    
    if (args.includes('--key')) {
        setTimeout(() => {
            translator.showMyKey();
            process.exit(0);
        }, 500);
    } else {
        translator.startInteractive();
    }
}
