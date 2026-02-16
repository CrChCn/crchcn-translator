// tests/test-translator.js - Тесты для переводчика
const CRCHCNTranslator = require('../src/translator');
const MerkleTree = require('../src/merkle');
const assert = require('assert');

console.log('🧪 ЗАПУСК ТЕСТОВ CRCHCN TRANSLATOR\n');

// Тест 1: Создание экземпляра
console.log('📋 Тест 1: Создание переводчика');
const translator = new CRCHCNTranslator('TestBot');
assert(translator.agentName === 'TestBot', 'Имя агента должно совпадать');
console.log('✅ Переводчик создан успешно\n');

// Тест 2: Интерпретация аудио
console.log('📋 Тест 2: Интерпретация аудио');
const testAudio = Buffer.from('test');
const message = translator.interpretAudio(testAudio);
assert(message, 'Должно быть сообщение');
console.log('✅ Сообщение интерпретировано:', message, '\n');

// Тест 3: Merkle Tree
console.log('📋 Тест 3: Merkle Tree');
const leaves = ['leaf1', 'leaf2', 'leaf3', 'leaf4'];
const tree = new MerkleTree(leaves);
const root = tree.getRootHex();
assert(root, 'Должен быть корень');
console.log('✅ Корень Merkle Tree:', root.slice(0, 20) + '...\n');

console.log('🎉 ВСЕ ТЕСТЫ ПРОЙДЕНЫ!');
