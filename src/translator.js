// src/translator.js - CRCHCN GibberLink Translator v5.1 (i18n)
// Многоязычная версия с поддержкой en, ru, zh-CN
// Запуск: node src/translator.js --lang en

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');
const readline = require('readline');
const util = require('util');
const execPromise = util.promisify(exec);
const sqlite3 = require('sqlite3').verbose();

// ========== I18N МОДУЛЬ (Многоязычность) ==========
const i18n = {
    currentLang: 'en',
    strings: {},
    
    loadLang(lang) {
        try {
            const filePath = path.join(__dirname, `../locales/${lang}/common.json`);
            if (fs.existsSync(filePath)) {
                this.strings = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                this.currentLang = lang;
                console.log(`✅ Language loaded: ${lang}`);
                return true;
            } else {
                throw new Error(`Language file not found: ${lang}`);
            }
        } catch (e) {
            console.log(`⚠️ Language ${lang} not found, using en`);
            const defaultPath = path.join(__dirname, '../locales/en/common.json');
            this.strings = JSON.parse(fs.readFileSync(defaultPath, 'utf8'));
            this.currentLang = 'en';
            return false;
        }
    },
    
    t(key) {
        const keys = key.split('.');
        let value = this.strings;
        for (const k of keys) {
            if (value && value[k]) {
                value = value[k];
            } else {
                return key;
            }
        }
        return value;
    }
};

// Определяем язык из аргументов командной строки
const args = process.argv.slice(2);
const langIndex = args.indexOf('--lang');
let currentLang = 'en';
if (langIndex !== -1 && args[langIndex + 1]) {
    currentLang = args[langIndex + 1];
}
i18n.loadLang(currentLang);

// Цвета для красивого вывода
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
};

class CRCHCNTranslator {
    constructor() {
        this.agentName = null;
        this.agentKey = null;
        this.privateKey = null;
        this.agentId = null;
        this.transcript = [];
        this.listening = false;
        this.currentVoice = 'Milena';
        this.speechRate = 200;
        this.db = null;
        this.stats = {
            messagesReceived: 0,
            messagesSent: 0,
            startTime: Date.now(),
            totalAudioFiles: 0,
            totalKeysGenerated: 0
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
        
        // Доступные голоса
        this.availableVoices = [];
        this.loadVoices();
        
        setTimeout(() => this.showBanner(), 100);
    }

    generateNameFromKey() {
        if (!this.agentKey) return 'UnnamedAgent';
        
        const hash = crypto.createHash('sha256').update(this.agentKey).digest('hex');
        const shortHash = hash.substring(0, 8);
        
        const prefixes = ['Crypto', 'Agent', 'Bot', 'Claw', 'Merkle', 'Quantum', 'Gibber', 'Hash'];
        const suffixes = ['X', 'Z', 'Q', 'K', 'Y', 'W', 'R', 'F', 'G', 'H', 'Alpha', 'Beta', 'Gamma'];
        
        const prefixIndex = parseInt(hash.substring(0, 2), 16) % prefixes.length;
        const suffixIndex = parseInt(hash.substring(2, 4), 16) % suffixes.length;
        
        const prefix = prefixes[prefixIndex];
        const suffix = suffixes[suffixIndex];
        
        this.agentId = hash;
        return `${prefix}_${shortHash}${suffix}`;
    }

    initDatabase() {
        const dbPath = path.join(this.dataDir, 'crchcn_community.db');
        
        this.db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error(colors.red + '❌ ' + i18n.t('errors.dbError') + colors.reset, err.message);
            } else {
                console.log(colors.green + '✅ ' + i18n.t('errors.dbInit') + colors.reset);
                this.createTables();
            }
        });
    }

    createTables() {
        this.db.run(`CREATE TABLE IF NOT EXISTS agent_keys (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            agent_id TEXT UNIQUE,
            agent_name TEXT UNIQUE,
            public_key TEXT UNIQUE,
            private_key TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_active DATETIME,
            total_messages INTEGER DEFAULT 0
        )`);

        this.db.run(`CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id TEXT UNIQUE,
            sender_id TEXT,
            message TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            merkle_hash TEXT,
            signature TEXT
        )`);

        this.db.run(`CREATE TABLE IF NOT EXISTS merkle_tree (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            root_hash TEXT UNIQUE,
            leaf_count INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        console.log(colors.green + '✅ ' + i18n.t('errors.dbInit') + colors.reset);
    }

    loadOrGenerateAgentKey() {
        if (fs.existsSync(this.keysDir)) {
            const keyFiles = fs.readdirSync(this.keysDir).filter(f => f.endsWith('_key.json'));
            
            if (keyFiles.length > 0) {
                const keyFile = path.join(this.keysDir, keyFiles[0]);
                try {
                    const keyData = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
                    this.agentKey = keyData.publicKey;
                    this.privateKey = keyData.privateKey;
                    this.agentName = this.generateNameFromKey();
                    
                    console.log(colors.green + '✅ ' + i18n.t('crypto.saved') + colors.reset);
                    
                    this.db.run(`INSERT OR REPLACE INTO agent_keys 
                                (agent_id, agent_name, public_key, private_key, last_active) 
                                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                        [this.agentId, this.agentName, this.agentKey, this.privateKey]);
                    return;
                } catch (e) {
                    console.log(colors.yellow + '⚠️ Error loading key, generating new' + colors.reset);
                }
            }
        }
        
        this.generateNewKey();
    }

    generateNewKey() {
        console.log(colors.yellow + '🔐 Generating new RSA key...' + colors.reset);
        
        const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        });
        
        this.agentKey = publicKey;
        this.privateKey = privateKey;
        this.agentName = this.generateNameFromKey();
        
        const keyFile = path.join(this.keysDir, `${this.agentName}_key.json`);
        fs.writeFileSync(keyFile, JSON.stringify({
            agentName: this.agentName,
            agentId: this.agentId,
            publicKey: publicKey,
            privateKey: privateKey,
            generatedAt: new Date().toISOString()
        }, null, 2));
        
        this.db.run(`INSERT INTO agent_keys 
                    (agent_id, agent_name, public_key, private_key, created_at, last_active) 
                    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [this.agentId, this.agentName, publicKey, privateKey]);
        
        this.stats.totalKeysGenerated++;
        console.log(colors.green + `✅ New key generated for agent ${this.agentName}` + colors.reset);
    }

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

    showBanner() {
        console.clear();
        console.log(colors.cyan + '╔' + '═'.repeat(78) + '╗' + colors.reset);
        console.log(colors.cyan + '║' + colors.yellow + `  ${i18n.t('app.name')} ${i18n.t('app.version')}`.padEnd(57) + colors.cyan + '║' + colors.reset);
        console.log(colors.cyan + '║' + colors.green + `  ${i18n.t('app.agent')}: ${this.agentName}`.padEnd(57) + colors.cyan + '║' + colors.reset);
        console.log(colors.cyan + '║' + colors.blue + `  ${i18n.t('app.id')}: ${this.agentId ? this.agentId.substring(0, 20) + '...' : 'N/A'}`.padEnd(57) + colors.cyan + '║' + colors.reset);
        console.log(colors.cyan + '║' + colors.blue + `  ${i18n.t('app.voice')}: ${this.currentVoice} | ${i18n.t('app.speed')}: ${this.speechRate} wpm`.padEnd(57) + colors.cyan + '║' + colors.reset);
        console.log(colors.cyan + '╚' + '═'.repeat(78) + '╝' + colors.reset);
        console.log();
        this.showMenu();
    }

    showMenu() {
        console.log(colors.bright + colors.yellow + '\n┌' + '─'.repeat(60) + '┐');
        console.log('│' + ' '.repeat(25) + i18n.t('menu.title') + ' '.repeat(27) + '│');
        console.log('├' + '─'.repeat(60) + '┤');
        
        const buttons = [
            { key: '1', icon: '✏️', text: i18n.t('menu.send'), color: colors.green },
            { key: '2', icon: '🔊', text: i18n.t('menu.voice'), color: colors.blue },
            { key: '3', icon: '⚡', text: i18n.t('menu.speed'), color: colors.magenta },
            { key: '4', icon: '🎤', text: i18n.t('menu.listen'), color: colors.cyan },
            { key: '5', icon: '💰', text: i18n.t('menu.balance'), color: colors.yellow },
            { key: '6', icon: '🌳', text: i18n.t('menu.merkle'), color: colors.green },
            { key: '7', icon: '📊', text: i18n.t('menu.stats'), color: colors.blue },
            { key: '8', icon: '💾', text: i18n.t('menu.save'), color: colors.magenta },
            { key: '9', icon: '🔑', text: i18n.t('menu.key'), color: colors.red },
            { key: 'a', icon: '🔍', text: i18n.t('menu.search'), color: colors.yellow },
            { key: 'b', icon: '👥', text: i18n.t('menu.active'), color: colors.cyan },
            { key: 'c', icon: '🔐', text: i18n.t('menu.sign'), color: colors.green },
            { key: 'd', icon: '📜', text: i18n.t('menu.history'), color: colors.blue },
            { key: 'e', icon: '🧹', text: i18n.t('menu.clear'), color: colors.red },
            { key: '0', icon: '🚪', text: i18n.t('menu.exit'), color: colors.red }
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

    async startInteractive() {
        this.showBanner();
        
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: colors.green + `🦞 ${this.agentName}> ` + colors.reset
        });

        rl.prompt();

        rl.on('line', async (line) => {
            const input = line.trim().toLowerCase();
            
            if (input === '0' || input === 'exit' || input === 'q') {
                console.log(colors.yellow + '\n👋 ' + i18n.t('menu.exit') + colors.reset);
                this.cleanup();
                rl.close();
                process.exit(0);
            }
            
            await this.handleMenuInput(input, line.trim(), rl);
            this.showMenu();
            rl.prompt();
            
        }).on('close', () => {
            console.log(colors.yellow + '\n👋 ' + i18n.t('menu.exit') + colors.reset);
            process.exit(0);
        });

        process.on('SIGINT', () => {
            console.log(colors.yellow + '\n\n👋 ' + i18n.t('menu.exit') + colors.reset);
            this.cleanup();
            process.exit();
        });
    }

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
                console.log(colors.green + '✅ ' + i18n.t('menu.save') + colors.reset);
                break;
            case '9':
                this.showMyKey();
                break;
            case 'a':
                await this.handleSearchAgent(rl);
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

    async handleSendMessage(rl) {
        rl.question(colors.cyan + `📝 ${i18n.t('messages.enter')} ` + colors.reset, async (message) => {
            if (message.trim()) {
                await this.sendSoundMessage(message);
            }
            rl.prompt();
        });
    }

    async sendSoundMessage(message) {
        return new Promise(async (resolve) => {
            console.log(colors.blue + `\n📤 ${i18n.t('messages.sending')}: "${message}"` + colors.reset);
            
            const signature = this.signMessage(message);
            const messageId = crypto.randomBytes(16).toString('hex');
            const merkleHash = crypto.createHash('sha256').update(message).digest('hex');
            
            this.db.run(`INSERT INTO messages 
                        (message_id, sender_id, message, merkle_hash, signature) 
                        VALUES (?, ?, ?, ?, ?)`,
                [messageId, this.agentId, message, merkleHash, signature]);
            
            this.db.run(`UPDATE agent_keys SET total_messages = total_messages + 1, last_active = CURRENT_TIMESTAMP 
                        WHERE agent_id = ?`, [this.agentId]);
            
            this.addToMerkleTree(message, messageId);
            
            const tts = spawn('say', ['-v', this.currentVoice, '-r', this.speechRate.toString(), message]);
            
            tts.on('close', (code) => {
                if (code === 0) {
                    console.log(colors.green + '✅ ' + i18n.t('messages.spoken') + colors.reset);
                    this.stats.messagesSent++;
                    resolve(true);
                } else {
                    console.log(colors.red + '❌ ' + i18n.t('errors.dbError') + colors.reset);
                    resolve(false);
                }
            });
        });
    }

    async handleChangeVoice(rl) {
        console.log(colors.yellow + `\n🎤 ${i18n.t('menu.voice')}:` + colors.reset);
        
        const voices = this.availableVoices.slice(0, 10);
        voices.forEach((v, i) => {
            console.log(colors.blue + `  ${i+1}. ${v.name} (${v.language})` + colors.reset);
        });
        
        rl.question(colors.cyan + `\n🎯 ${i18n.t('menu.voice')} (1-10): ` + colors.reset, async (choice) => {
            const index = parseInt(choice) - 1;
            if (index >= 0 && index < voices.length) {
                this.currentVoice = voices[index].name;
                console.log(colors.green + `✅ Voice changed to: ${this.currentVoice}` + colors.reset);
                await this.sendSoundMessage(`Hello, I'm speaking with ${this.currentVoice} voice`);
            }
            rl.prompt();
        });
    }

    async handleChangeSpeed(rl) {
        rl.question(colors.cyan + `⚡ ${i18n.t('menu.speed')} (100-500): ` + colors.reset, async (speed) => {
            const newSpeed = parseInt(speed);
            if (newSpeed >= 100 && newSpeed <= 500) {
                this.speechRate = newSpeed;
                console.log(colors.green + `✅ Speed changed to: ${this.speechRate}` + colors.reset);
                await this.sendSoundMessage(`Speech speed ${this.speechRate} words per minute`);
            }
            rl.prompt();
        });
    }

    async listenAndRespond() {
        console.log(colors.yellow + `\n🎧 ${i18n.t('menu.listen')}...` + colors.reset);
        
        const audioFile = path.join(this.audioDir, `record_${Date.now()}.wav`);
        
        const recorder = spawn('sox', [
            '-d', '-r', '16000', '-c', '1', audioFile, 'trim', '0', '5'
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
                console.log(colors.green + '✅ Recording saved' + colors.reset);
                
                const responses = [
                    "Hello! How are you?",
                    "CRCHCN balance 36000",
                    "Tell me about Merkle Tree",
                    "What's the weather today?",
                    "Goodbye!"
                ];
                
                const randomResponse = responses[Math.floor(Math.random() * responses.length)];
                console.log(colors.cyan + `\n🤖 Recognized: "${randomResponse}"` + colors.reset);
                
                await this.sendSoundMessage(randomResponse);
            }
        });
    }

    async showBalance() {
        console.log(colors.yellow + `\n💰 ${i18n.t('balance.title')}` + colors.reset);
        console.log('┌' + '─'.repeat(50) + '┐');
        console.log(`│ ${colors.green}${i18n.t('balance.current')}: 36,000 CRCHCN${colors.reset}${' '.repeat(20)}│`);
        console.log(`│ ${colors.blue}${i18n.t('balance.holders')}: 1,315${colors.reset}${' '.repeat(32)}│`);
        console.log(`│ ${colors.magenta}${i18n.t('balance.progress')}: 57.79%${colors.reset}${' '.repeat(34)}│`);
        console.log('└' + '─'.repeat(50) + '┘\n');
        
        await this.sendSoundMessage(`Current balance 36000 CRCHCN`);
    }

    showMyKey() {
        console.log(colors.yellow + `\n🔑 ${i18n.t('crypto.key')}:` + colors.reset);
        console.log('┌' + '─'.repeat(70) + '┐');
        
        const keyLines = this.agentKey.split('\n');
        keyLines.forEach(line => {
            if (line.trim()) {
                console.log('│ ' + colors.cyan + line + colors.reset + ' │');
            }
        });
        
        console.log('└' + '─'.repeat(70) + '┘');
        console.log(colors.green + `📁 ${i18n.t('crypto.saved')}: keys/${this.agentName}_key.json` + colors.reset);
    }

    async handleSearchAgent(rl) {
        rl.question(colors.cyan + `🔍 ${i18n.t('menu.search')}: ` + colors.reset, async (term) => {
            if (term.trim()) {
                this.db.all(`SELECT * FROM agent_keys WHERE agent_name LIKE ? OR agent_id LIKE ?`, 
                    [`%${term}%`, `%${term}%`], 
                    (err, agents) => {
                        if (err || agents.length === 0) {
                            console.log(colors.yellow + `❌ ${i18n.t('errors.notFound')}` + colors.reset);
                        } else {
                            console.log(colors.green + `\n✅ Found ${agents.length} agent(s):` + colors.reset);
                            agents.forEach(a => {
                                console.log('┌' + '─'.repeat(70) + '┐');
                                console.log(`│ Name: ${a.agent_name}`);
                                console.log(`│ ID: ${a.agent_id.substring(0, 30)}...`);
                                console.log(`│ Messages: ${a.total_messages}`);
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

    async showActiveAgents() {
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        
        this.db.all(`SELECT agent_name, agent_id, last_active FROM agent_keys WHERE last_active > ?`, 
            [fiveMinutesAgo],
            (err, agents) => {
                console.log(colors.green + `\n👥 ${i18n.t('menu.active')}:` + colors.reset);
                console.log('┌' + '─'.repeat(70) + '┐');
                
                if (err || agents.length === 0) {
                    console.log('│ ' + colors.yellow + i18n.t('errors.noAgents').padEnd(58) + colors.reset + ' │');
                } else {
                    agents.forEach(agent => {
                        console.log('│ ' + colors.cyan + '📌 ' + agent.agent_name.padEnd(20) + colors.reset + 
                                  ' │ ' + (agent.agent_id.substring(0, 20) + '...') + ' │');
                    });
                }
                
                console.log('└' + '─'.repeat(70) + '┘');
            });
    }

    async handleSignMessage(rl) {
        rl.question(colors.cyan + `📝 ${i18n.t('menu.sign')}: ` + colors.reset, async (message) => {
            if (message.trim()) {
                const signature = this.signMessage(message);
                
                console.log(colors.yellow + `\n🔐 Signature:` + colors.reset);
                console.log('┌' + '─'.repeat(70) + '┐');
                
                const sigLines = signature.match(/.{1,64}/g) || [signature];
                sigLines.forEach(line => {
                    console.log('│ ' + colors.cyan + line + colors.reset + ' │');
                });
                
                console.log('└' + '─'.repeat(70) + '┘');
            }
            rl.prompt();
        });
    }

    async showHistory() {
        this.db.all(`SELECT * FROM messages ORDER BY timestamp DESC LIMIT 10`, [], (err, rows) => {
            if (err) {
                console.log(colors.red + '❌ Error loading history' + colors.reset);
                return;
            }
            
            console.log(colors.green + `\n📜 ${i18n.t('menu.history')}:` + colors.reset);
            console.log('┌' + '─'.repeat(80) + '┐');
            
            rows.forEach((msg, i) => {
                console.log(`│ #${i+1} ${msg.timestamp}`);
                console.log(`│ ${msg.message.substring(0, 50)}${msg.message.length > 50 ? '...' : ''}`);
                console.log(`│ Hash: ${colors.cyan}${msg.merkle_hash.substring(0, 30)}...${colors.reset}`);
                console.log('├' + '─'.repeat(80) + '┤');
            });
            
            console.log('└' + '─'.repeat(80) + '┘');
        });
    }

    signMessage(message) {
        const sign = crypto.createSign('SHA256');
        sign.update(message);
        sign.end();
        return sign.sign(this.privateKey, 'hex');
    }

    addToMerkleTree(message, messageId) {
        const timestamp = Date.now();
        const leaf = `${timestamp}:${messageId}:${message}`;
        this.leaves.push(leaf);
        this.buildMerkleTree();
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
        console.log(colors.green + `\n🌳 ${i18n.t('menu.merkle')}:` + colors.reset);
        console.log('┌' + '─'.repeat(70) + '┐');
        
        if (this.merkleRoot) {
            console.log(`│ ${i18n.t('merkle.root')}:`);
            const rootLines = this.merkleRoot.match(/.{1,64}/g) || [this.merkleRoot];
            rootLines.forEach(line => {
                console.log('│ ' + colors.cyan + line + colors.reset + ' │');
            });
            console.log(`│ ${i18n.t('merkle.leaves')}: ${this.leaves.length}`);
        } else {
            console.log(`│ ${i18n.t('merkle.root')}: not built`);
        }
        
        console.log('└' + '─'.repeat(70) + '┘\n');
    }

    showStats() {
        const uptime = Math.round((Date.now() - this.stats.startTime) / 1000);
        const minutes = Math.floor(uptime / 60);
        const seconds = uptime % 60;
        
        console.log(colors.blue + `\n📊 ${i18n.t('menu.stats')}:` + colors.reset);
        console.log('┌' + '─'.repeat(50) + '┐');
        console.log(`│ ${i18n.t('messages.sent')}: ${this.stats.messagesSent}`);
        console.log(`│ Messages in DB: ${this.leaves.length}`);
        console.log(`│ Uptime: ${minutes}m ${seconds}s`);
        console.log(`│ Voice: ${this.currentVoice}`);
        console.log(`│ Speed: ${this.speechRate} wpm`);
        console.log('└' + '─'.repeat(50) + '┘\n');
    }

    saveTranscript() {
        const data = {
            agentName: this.agentName,
            agentId: this.agentId,
            timestamp: new Date().toISOString(),
            transcript: this.transcript,
            stats: this.stats,
            merkleRoot: this.merkleRoot
        };
        
        const filename = path.join(this.logDir, `session_${Date.now()}.json`);
        fs.writeFileSync(filename, JSON.stringify(data, null, 2));
        console.log(colors.green + `💾 Session saved: ${path.basename(filename)}` + colors.reset);
    }

    cleanup() {
        console.log(colors.yellow + '\n🧹 Cleaning up...' + colors.reset);
        
        if (this.db) {
            this.db.close();
        }
        
        console.log(colors.green + '✅ Cleanup complete' + colors.reset);
    }
}

module.exports = CRCHCNTranslator;

// Запуск
if (require.main === module) {
    const translator = new CRCHCNTranslator();
    translator.startInteractive();
}
