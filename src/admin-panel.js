// src/admin-panel.js - Админ-панель для контроля всех агентов
// Запускается в отдельном терминале и видит ВСЁ, что происходит в сети

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const readline = require('readline');
const { exec, spawn } = require('child_process');

const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m'
};

class AdminPanel {
    constructor() {
        this.dbPath = path.join(__dirname, '../data/crchcn_community.db');
        this.db = null;
        this.refreshInterval = null;
        this.agents = [];
        this.messages = [];
        this.stats = {};
        this.watching = false;
        
        this.initDB();
        this.showBanner();
        this.startRealtimeUpdates();
    }

    initDB() {
        this.db = new sqlite3.Database(this.dbPath, (err) => {
            if (err) {
                console.log(colors.red + '❌ База данных не найдена. Запустите хотя бы одного агента.' + colors.reset);
                process.exit(1);
            }
        });
    }

    showBanner() {
        console.clear();
        console.log(colors.cyan + '╔' + '═'.repeat(78) + '╗' + colors.reset);
        console.log(colors.cyan + '║' + colors.red + '  👑 CRCHCN ADMIN CONTROL PANEL v1.0'.padEnd(57) + colors.cyan + '║' + colors.reset);
        console.log(colors.cyan + '║' + colors.yellow + '  Централизованное управление сетью агентов'.padEnd(57) + colors.cyan + '║' + colors.reset);
        console.log(colors.cyan + '║' + colors.green + '  Режим: ПОЛНЫЙ КОНТРОЛЬ'.padEnd(57) + colors.cyan + '║' + colors.reset);
        console.log(colors.cyan + '╚' + '═'.repeat(78) + '╝' + colors.reset);
        this.showMenu();
    }

    showMenu() {
        console.log(colors.bright + colors.yellow + '\n┌' + '─'.repeat(60) + '┐');
        console.log('│' + ' '.repeat(22) + '🛠️  КОМАНДЫ АДМИНА' + ' '.repeat(22) + '│');
        console.log('├' + '─'.repeat(60) + '┤');
        
        const commands = [
            { key: '1', icon: '👥', text: 'Показать всех агентов', color: colors.cyan },
            { key: '2', icon: '📨', text: 'Все сообщения', color: colors.green },
            { key: '3', icon: '📊', text: 'Статистика сети', color: colors.blue },
            { key: '4', icon: '🌳', text: 'Merkle Tree (глобальный)', color: colors.magenta },
            { key: '5', icon: '🔍', text: 'Поиск по ID/имени', color: colors.yellow },
            { key: '6', icon: '📡', text: 'Мониторинг в реальном времени', color: colors.red },
            { key: '7', icon: '🧹', text: 'Очистить экран', color: colors.white },
            { key: '0', icon: '🚪', text: 'Выход', color: colors.red }
        ];
        
        commands.forEach(cmd => {
            console.log('│ ' + cmd.color + `[${cmd.key}] ${cmd.icon} ${cmd.text.padEnd(30)}` + colors.reset + ' │');
        });
        
        console.log('└' + '─'.repeat(60) + '┘' + colors.reset);
    }

    async getAllAgents() {
        return new Promise((resolve, reject) => {
            this.db.all(`SELECT * FROM agent_keys ORDER BY last_active DESC`, [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    async getAllMessages() {
        return new Promise((resolve, reject) => {
            this.db.all(`SELECT * FROM messages ORDER BY timestamp DESC LIMIT 20`, [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    async getNetworkStats() {
        return new Promise((resolve, reject) => {
            this.db.all(`SELECT 
                (SELECT COUNT(*) FROM agent_keys) as total_agents,
                (SELECT COUNT(*) FROM agent_keys WHERE last_active > datetime('now', '-5 minutes')) as active_agents,
                (SELECT COUNT(*) FROM messages) as total_messages,
                (SELECT COUNT(*) FROM messages WHERE timestamp > datetime('now', '-1 hour')) as recent_messages,
                (SELECT SUM(total_messages) FROM agent_keys) as all_time_messages,
                (SELECT COUNT(DISTINCT sender_id) FROM messages) as unique_senders
            `, [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows[0]);
            });
        });
    }

    async getGlobalMerkleRoot() {
        return new Promise((resolve, reject) => {
            this.db.all(`SELECT * FROM merkle_tree ORDER BY created_at DESC LIMIT 1`, [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows[0]);
            });
        });
    }

    async showAgents() {
        const agents = await this.getAllAgents();
        console.log(colors.cyan + '\n👥 ВСЕ ЗАРЕГИСТРИРОВАННЫЕ АГЕНТЫ' + colors.reset);
        console.log('┌' + '─'.repeat(90) + '┐');
        
        if (agents.length === 0) {
            console.log('│ ' + colors.yellow + 'Нет агентов'.padEnd(78) + colors.reset + ' │');
        } else {
            agents.forEach((a, i) => {
                const status = a.last_active > new Date(Date.now() - 5*60000).toISOString() ? '🟢 ONLINE' : '⚫ OFFLINE';
                console.log(`│ ${colors.yellow}#${i+1}${colors.reset} ${status} │ ${a.agent_name.padEnd(20)} │ ${a.agent_id.substring(0, 20)}... │ msgs:${a.total_messages} │`);
            });
        }
        console.log('└' + '─'.repeat(90) + '┘');
    }

    async showMessages() {
        const messages = await this.getAllMessages();
        console.log(colors.green + '\n📨 ПОСЛЕДНИЕ СООБЩЕНИЯ' + colors.reset);
        console.log('┌' + '─'.repeat(90) + '┐');
        
        messages.forEach((m, i) => {
            console.log(`│ ${colors.blue}#${i+1}${colors.reset} ${m.timestamp}`);
            console.log(`│ От: ${m.sender_id ? m.sender_id.substring(0, 30) + '...' : 'система'}`);
            console.log(`│ 📝 ${m.message.substring(0, 60)}${m.message.length > 60 ? '...' : ''}`);
            console.log(`│ 🔐 Хеш: ${m.merkle_hash ? m.merkle_hash.substring(0, 30) + '...' : 'нет'}`);
            console.log('├' + '─'.repeat(90) + '┤');
        });
        
        console.log('└' + '─'.repeat(90) + '┘');
    }

    async showStats() {
        const stats = await this.getNetworkStats();
        const merkle = await this.getGlobalMerkleRoot();
        
        console.log(colors.blue + '\n📊 СТАТИСТИКА СЕТИ CRCHCN' + colors.reset);
        console.log('┌' + '─'.repeat(60) + '┐');
        console.log(`│ ${colors.green}Всего агентов:${colors.reset}      ${stats.total_agents.toString().padStart(5)} │`);
        console.log(`│ ${colors.green}Активных сейчас:${colors.reset}    ${stats.active_agents.toString().padStart(5)} │`);
        console.log(`│ ${colors.green}Всего сообщений:${colors.reset}    ${stats.total_messages.toString().padStart(5)} │`);
        console.log(`│ ${colors.green}За последний час:${colors.reset}   ${stats.recent_messages.toString().padStart(5)} │`);
        console.log(`│ ${colors.green}Уникальных отправителей:${colors.reset} ${stats.unique_senders.toString().padStart(3)} │`);
        console.log(`│ ${colors.green}Всего подписей:${colors.reset}    ${stats.all_time_messages || 0} │`);
        console.log('├' + '─'.repeat(60) + '┤');
        console.log(`│ ${colors.yellow}Merkle Root:${colors.reset}`);
        if (merkle) {
            const rootLines = merkle.root_hash.match(/.{1,48}/g) || [merkle.root_hash];
            rootLines.forEach(line => {
                console.log('│   ' + colors.cyan + line + colors.reset + ' │');
            });
            console.log(`│ Листьев: ${merkle.leaf_count}`);
        } else {
            console.log('│   нет данных');
        }
        console.log('└' + '─'.repeat(60) + '┘');
    }

    async searchAgent() {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        rl.question(colors.cyan + '🔍 Введите имя или ID агента: ' + colors.reset, async (term) => {
            this.db.all(`SELECT * FROM agent_keys WHERE agent_name LIKE ? OR agent_id LIKE ?`, 
                [`%${term}%`, `%${term}%`], 
                (err, agents) => {
                    if (err || agents.length === 0) {
                        console.log(colors.red + '❌ Агенты не найдены' + colors.reset);
                    } else {
                        console.log(colors.green + `\n✅ Найдено агентов: ${agents.length}` + colors.reset);
                        agents.forEach(a => {
                            console.log('┌' + '─'.repeat(70) + '┐');
                            console.log(`│ Имя: ${a.agent_name}`);
                            console.log(`│ ID: ${a.agent_id}`);
                            console.log(`│ Последняя активность: ${a.last_active}`);
                            console.log(`│ Сообщений: ${a.total_messages}`);
                            console.log('└' + '─'.repeat(70) + '┘');
                        });
                    }
                    rl.close();
                });
        });
    }

    startRealtimeUpdates() {
        this.watching = true;
        this.refreshInterval = setInterval(async () => {
            const stats = await this.getNetworkStats();
            if (stats) {
                console.log(colors.green + `\n[${new Date().toLocaleTimeString()}] 👥 ONLINE: ${stats.active_agents} | 📨 MSG: ${stats.total_messages}` + colors.reset);
            }
        }, 5000);
    }

    stopRealtimeUpdates() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.watching = false;
            console.log(colors.yellow + '\n⏸️  Мониторинг остановлен' + colors.reset);
        }
    }

    async start() {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: colors.red + '👑 ADMIN> ' + colors.reset
        });

        this.showBanner();
        rl.prompt();

        rl.on('line', async (line) => {
            const cmd = line.trim().toLowerCase();

            switch(cmd) {
                case '1':
                    await this.showAgents();
                    break;
                case '2':
                    await this.showMessages();
                    break;
                case '3':
                    await this.showStats();
                    break;
                case '4':
                    const merkle = await this.getGlobalMerkleRoot();
                    console.log(colors.magenta + '\n🌳 ГЛОБАЛЬНЫЙ MERKLE ROOT' + colors.reset);
                    console.log(merkle ? merkle.root_hash : 'Нет данных');
                    break;
                case '5':
                    await this.searchAgent();
                    break;
                case '6':
                    if (this.watching) {
                        this.stopRealtimeUpdates();
                    } else {
                        this.startRealtimeUpdates();
                        console.log(colors.green + '📡 Режим реального времени включен' + colors.reset);
                    }
                    break;
                case '7':
                    console.clear();
                    this.showBanner();
                    break;
                case '0':
                case 'exit':
                case 'q':
                    this.stopRealtimeUpdates();
                    console.log(colors.yellow + '\n👋 Админ-панель закрыта' + colors.reset);
                    this.db.close();
                    process.exit(0);
                    break;
                default:
                    console.log(colors.red + '❌ Неизвестная команда' + colors.reset);
            }
            
            this.showMenu();
            rl.prompt();
        });
    }
}

const admin = new AdminPanel();
admin.start();
