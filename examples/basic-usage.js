// examples/basic-usage.js - Пример использования переводчика
const CRCHCNTranslator = require('../src/translator');

console.log('🦞 ЗАПУСК ПРИМЕРА ИСПОЛЬЗОВАНИЯ CRCHCN TRANSLATOR\n');

// Создаем экземпляр переводчика
const translator = new CRCHCNTranslator('CrChCnBot');

// Имитация получения 3 сообщений
async function demo() {
    for (let i = 0; i < 3; i++) {
        console.log(`\n--- Сообщение ${i + 1} ---`);
        await translator.translate();
        
        // Пауза между сообщениями
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('\n✅ Демо завершено');
    console.log(`📊 Всего переведено: ${translator.transcript.length} сообщений`);
}

demo();
