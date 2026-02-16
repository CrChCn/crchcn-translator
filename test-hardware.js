// test-hardware.js - Тест микрофона и динамиков
const GGWaveIntegration = require('./src/ggwave-integration');

async function test() {
    const ggwave = new GGWaveIntegration();
    await ggwave.testHardware();
    ggwave.cleanup();
}

test().catch(console.error);
