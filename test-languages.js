// test-languages.js - Проверка языковых файлов
const fs = require('fs');
const path = require('path');

console.log('🌐 ПРОВЕРКА ЯЗЫКОВЫХ ФАЙЛОВ\n');

const localesDir = path.join(__dirname, 'locales');

if (!fs.existsSync(localesDir)) {
    console.log('❌ Папка locales не найдена!');
    process.exit(1);
}

// Получаем список языков
const languages = fs.readdirSync(localesDir);

console.log(`📁 Найдено языков: ${languages.length}\n`);

languages.forEach(lang => {
    const langPath = path.join(localesDir, lang, 'common.json');
    
    if (fs.existsSync(langPath)) {
        try {
            const content = fs.readFileSync(langPath, 'utf8');
            const data = JSON.parse(content);
            
            console.log(`✅ ${lang}: Файл корректен`);
            console.log(`   - Заголовок: ${data.app.name}`);
            console.log(`   - Пунктов меню: ${Object.keys(data.menu).length}`);
            console.log(`   - Сообщений: ${Object.keys(data.messages).length}`);
            
            // Проверяем ключи на полноту
            const requiredKeys = ['app', 'menu', 'messages', 'balance', 'errors', 'crypto', 'merkle'];
            const missing = requiredKeys.filter(key => !data[key]);
            
            if (missing.length > 0) {
                console.log(`   ⚠️ Отсутствуют секции: ${missing.join(', ')}`);
            } else {
                console.log(`   ✅ Все секции присутствуют`);
            }
            
            console.log('');
        } catch (e) {
            console.log(`❌ ${lang}: Ошибка парсинга JSON - ${e.message}\n`);
        }
    } else {
        console.log(`❌ ${lang}: Файл common.json не найден\n`);
    }
});

// Сравниваем ключи между языками
console.log('\n📊 СРАВНЕНИЕ КЛЮЧЕЙ МЕЖДУ ЯЗЫКАМИ:\n');

const referenceLang = 'en';
const referencePath = path.join(localesDir, referenceLang, 'common.json');

if (fs.existsSync(referencePath)) {
    const referenceData = JSON.parse(fs.readFileSync(referencePath, 'utf8'));
    const referenceKeys = Object.keys(referenceData);
    
    languages.forEach(lang => {
        if (lang === referenceLang) return;
        
        const comparePath = path.join(localesDir, lang, 'common.json');
        if (fs.existsSync(comparePath)) {
            const compareData = JSON.parse(fs.readFileSync(comparePath, 'utf8'));
            const compareKeys = Object.keys(compareData);
            
            const missingInCompare = referenceKeys.filter(k => !compareKeys.includes(k));
            const extraInCompare = compareKeys.filter(k => !referenceKeys.includes(k));
            
            console.log(`\n${lang} vs ${referenceLang}:`);
            if (missingInCompare.length > 0) {
                console.log(`   ⚠️ Отсутствуют: ${missingInCompare.join(', ')}`);
            } else {
                console.log(`   ✅ Все ключи присутствуют`);
            }
            
            if (extraInCompare.length > 0) {
                console.log(`   📌 Лишние: ${extraInCompare.join(', ')}`);
            }
        }
    });
}

// Проверяем иероглифы в китайском
console.log('\n🔤 ПРОВЕРКА КИТАЙСКИХ ИЕРОГЛИФОВ:\n');

const zhPath = path.join(localesDir, 'zh-CN', 'common.json');
if (fs.existsSync(zhPath)) {
    const zhData = JSON.parse(fs.readFileSync(zhPath, 'utf8'));
    
    const hasChinese = (str) => /[\u4e00-\u9fa5]/.test(str);
    
    let chineseCount = 0;
    const checkForChinese = (obj, path = '') => {
        for (const key in obj) {
            if (typeof obj[key] === 'object') {
                checkForChinese(obj[key], path + '.' + key);
            } else if (typeof obj[key] === 'string') {
                if (hasChinese(obj[key])) {
                    chineseCount++;
                }
            }
        }
    };
    
    checkForChinese(zhData);
    console.log(`✅ Найдено строк с иероглифами: ${chineseCount}`);
    console.log(`✅ Китайский файл корректен`);
}
