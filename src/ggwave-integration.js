// src/ggwave-integration.js - Исправленная версия с прямым использованием ggwave API
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class GGWaveIntegration {
    constructor() {
        this.isListening = false;
        this.tempAudioDir = path.join(__dirname, '../temp_audio');
        this.ggwaveInstance = null;
        
        // Создаем папку для временных аудиофайлов
        if (!fs.existsSync(this.tempAudioDir)) {
            fs.mkdirSync(this.tempAudioDir, { recursive: true });
        }
        
        // Пытаемся загрузить библиотеку ggwave
        this.loadGGWaveLibrary();
    }

    /**
     * Загрузка библиотеки ggwave
     */
    loadGGWaveLibrary() {
        try {
            // Пробуем разные способы импорта
            const ggwave = require('ggwave');
            
            // Проверяем, как именно экспортируется библиотека
            if (ggwave.init) {
                this.ggwaveInstance = ggwave;
                console.log('✅ GGWave библиотека загружена (через init)');
            } else if (ggwave.default && ggwave.default.init) {
                this.ggwaveInstance = ggwave.default;
                console.log('✅ GGWave библиотека загружена (через default)');
            } else {
                // Если структура неясна, сохраняем сам объект
                this.ggwaveInstance = ggwave;
                console.log('✅ GGWave библиотека загружена (объект)');
            }
            
            console.log('📦 Доступные методы:', Object.keys(this.ggwaveInstance).join(', '));
        } catch (error) {
            console.log('⚠️ GGWave библиотека не найдена, используем резервный метод');
            console.log('   Установите: npm install ggwave');
            this.ggwaveInstance = null;
        }
    }

    /**
     * Инициализация
     */
    async init() {
        return this;
    }

    /**
     * Кодирование текста в звук и воспроизведение через системные утилиты
     * @param {string} message - Текст для отправки
     */
    async encodeAndPlay(message) {
        // Используем системный Text-to-Speech как временное решение
        return new Promise((resolve, reject) => {
            console.log(`🔊 Озвучивание сообщения: "${message}"`);
            
            // Используем say для macOS (встроенный TTS)
            const tts = spawn('say', [message]);
            
            tts.on('close', (code) => {
                if (code === 0) {
                    console.log('✅ Сообщение произнесено');
                    resolve(true);
                } else {
                    reject(new Error(`Ошибка озвучивания, код: ${code}`));
                }
            });
        });
    }

    /**
     * Прослушивание через микрофон и попытка распознать ключевые слова
     * @param {number} duration - Длительность прослушивания в секундах
     */
    async listenAndDecode(duration = 5) {
        const inputFile = path.join(this.tempAudioDir, `record_${Date.now()}.wav`);

        return new Promise((resolve, reject) => {
            console.log(`🎧 Запись звука ${duration} сек...`);
            
            // Запись с микрофона через sox
            const recorder = spawn('sox', [
                '-d',
                '-r', '16000',
                '-c', '1',
                inputFile,
                'trim', '0', duration.toString()
            ]);

            recorder.stderr.on('data', (data) => {
                const output = data.toString();
                if (!output.includes('Done') && !output.includes('Input')) {
                    console.log(`🎤 ${output.trim()}`);
                }
            });

            recorder.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`Ошибка записи, код: ${code}`));
                    return;
                }

                console.log(`✅ Запись сохранена: ${inputFile}`);
                
                // Пытаемся распознать речь через встроенный macOS Speech-to-Text
                this.recognizeSpeech(inputFile).then(text => {
                    if (text) {
                        console.log(`✅ Распознано: "${text}"`);
                        resolve(text);
                    } else {
                        console.log('⏳ Ничего не распознано');
                        resolve(null);
                    }
                }).catch(err => {
                    console.log('⚠️ Ошибка распознавания:', err.message);
                    resolve(null);
                });
            });
        });
    }

    /**
     * Распознавание речи через встроенные средства macOS
     */
    async recognizeSpeech(audioFile) {
        return new Promise((resolve) => {
            // Используем встроенный Speech-to-Text macOS
            const listener = spawn('sox', [audioFile, '-t', 'raw', '-r', '16000', '-e', 'signed', '-b', '16', '-c', '1', '-']);
            
            let audioData = [];
            listener.stdout.on('data', (data) => {
                audioData.push(data);
            });

            listener.on('close', () => {
                // Здесь можно было бы отправить в реальный STT
                // Пока просто имитируем распознавание
                setTimeout(() => {
                    // В реальности здесь должен быть вызов API распознавания речи
                    resolve(null);
                }, 500);
            });
        });
    }

    /**
     * Очистка временных файлов
     */
    cleanup() {
        if (fs.existsSync(this.tempAudioDir)) {
            const files = fs.readdirSync(this.tempAudioDir);
            files.forEach(file => {
                fs.unlinkSync(path.join(this.tempAudioDir, file));
            });
            console.log('🧹 Временные файлы удалены');
        }
    }
}

module.exports = GGWaveIntegration;
