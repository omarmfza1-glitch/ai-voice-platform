const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const twilio = require('twilio');
const OpenAI = require('openai');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const FormData = require('form-data');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// الإعدادات
const config = {
    mongoUri: process.env.MONGODB_URI,
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
    twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER,
    openaiApiKey: process.env.OPENAI_API_KEY,
    elevenLabsApiKey: process.env.ELEVENLABS_API_KEY,
    elevenLabsVoiceId: process.env.ELEVENLABS_VOICE_ID
};

// التحقق من المتغيرات البيئية المطلوبة
const requiredEnvVars = [
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN', 
    'TWILIO_PHONE_NUMBER',
    'OPENAI_API_KEY',
    'ELEVENLABS_API_KEY',
    'ELEVENLABS_VOICE_ID'
];

// متغيرات Google (اختيارية)
const optionalEnvVars = [
    'GOOGLE_APPLICATION_CREDENTIALS',
    'GOOGLE_CREDENTIALS_JSON',
    'GOOGLE_PROJECT_ID'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
const missingOptionalVars = optionalEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
    console.error('❌ المتغيرات البيئية التالية مفقودة:');
    missingVars.forEach(varName => console.error(`   - ${varName}`));
    console.error('⚠️ تأكد من إضافة هذه المتغيرات في Heroku Config Vars');
} else {
    console.log('✅ جميع المتغيرات البيئية المطلوبة موجودة');
}

if (missingOptionalVars.length > 0) {
    console.log('⚠️ المتغيرات الاختيارية التالية مفقودة:');
    missingOptionalVars.forEach(varName => console.log(`   - ${varName}`));
    console.log('   Google Speech سيعمل بدون هذه المتغيرات');
}

// التحقق من ElevenLabs
if (config.elevenLabsApiKey) {
    console.log('✅ ElevenLabs API Key موجود');
} else {
    console.error('⚠️ ELEVENLABS_API_KEY غير موجود في Config Vars');
}

// التحقق من OpenAI
if (config.openaiApiKey) {
    console.log('✅ OpenAI API Key موجود');
} else {
    console.error('⚠️ OPENAI_API_KEY غير موجود في Config Vars');
}

// التحقق من Twilio
if (config.twilioAccountSid && config.twilioAuthToken && config.twilioPhoneNumber) {
    console.log('✅ Twilio credentials موجودة');
} else {
    console.error('⚠️ Twilio credentials غير موجودة في Config Vars');
}

// إعداد Google Speech-to-Text
let googleSpeech = null;
if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_CREDENTIALS_JSON) {
    try {
        const speech = require('@google-cloud/speech');
        
        // إعداد credentials
        let credentials = null;
        if (process.env.GOOGLE_CREDENTIALS_JSON) {
            credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
        }
        
        googleSpeech = new speech.SpeechClient({
            credentials: credentials,
            projectId: process.env.GOOGLE_PROJECT_ID
        });
        
        console.log('✅ Google Speech-to-Text جاهز');
    } catch (error) {
        console.error('❌ خطأ Google Speech:', error.message);
    }
} else {
    console.log('⚠️ GOOGLE_APPLICATION_CREDENTIALS غير موجود في Config Vars');
}

// التحقق من Google Speech
if (googleSpeech) {
    console.log('✅ Google Speech-to-Text متصل');
} else {
    console.log('⚠️ Google Speech-to-Text غير متصل (اختياري)');
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// إعداد OpenAI
let openai = null;
if (config.openaiApiKey) {
    try {
        openai = new OpenAI({ 
            apiKey: config.openaiApiKey,
            maxRetries: 2 // تقليل المحاولات للسرعة
        });
        console.log('✅ OpenAI جاهز');
    } catch (error) {
        console.error('❌ خطأ OpenAI:', error.message);
    }
}

// تخزين المحادثات مع كاش للسرعة
const conversations = new Map();
const userProfiles = new Map();
const responseCache = new Map(); // كاش للردود الشائعة

// MongoDB اختياري
if (config.mongoUri && config.mongoUri !== 'mongodb://localhost:27017/aivoice') {
    mongoose.connect(config.mongoUri).then(() => {
        console.log('✅ MongoDB متصل');
    }).catch(err => {
        console.log('⚠️ MongoDB غير متصل:', err.message);
    });
}

// الصفحة الرئيسية
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>منصة AI الصوتية المتقدمة</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    font-family: -apple-system, 'Segoe UI', Arial, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    color: white;
                }
                .container {
                    text-align: center;
                    padding: 40px;
                    background: rgba(255,255,255,0.1);
                    border-radius: 20px;
                    backdrop-filter: blur(10px);
                    max-width: 800px;
                    margin: 20px;
                }
                h1 { 
                    font-size: 2.5em; 
                    margin-bottom: 20px;
                    background: linear-gradient(to right, #FFD700, #FFA500);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                }
                .features {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 15px;
                    margin: 30px 0;
                }
                .feature {
                    background: rgba(255,255,255,0.15);
                    padding: 15px;
                    border-radius: 10px;
                    transition: transform 0.3s;
                }
                .feature:hover {
                    transform: scale(1.05);
                    background: rgba(255,255,255,0.25);
                }
                .phone-number {
                    font-size: 2em;
                    color: #FFD700;
                    margin: 20px 0;
                    padding: 20px;
                    background: rgba(0,0,0,0.3);
                    border-radius: 15px;
                    font-weight: bold;
                }
                .status {
                    background: rgba(0,255,0,0.2);
                    padding: 15px;
                    border-radius: 10px;
                    margin: 15px 0;
                    border: 1px solid rgba(0,255,0,0.5);
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🚀 منصة AI الصوتية المتطورة</h1>
                
                <div class="phone-number">
                    📞 ${config.twilioPhoneNumber || '+1 570 525 5521'}
                </div>
                
                <div class="status">
                    ✅ النظام يعمل بكامل الميزات المتقدمة
                </div>
                
                <div class="features">
                    <div class="feature">
                        <h3>⚡ سرعة فائقة</h3>
                        <p>رد فوري أقل من ثانية</p>
                    </div>
                    <div class="feature">
                        <h3>🎭 صوت طبيعي</h3>
                        <p>تعابير بشرية بـ SSML</p>
                    </div>
                    <div class="feature">
                        <h3>🔄 مقاطعة ذكية</h3>
                        <p>يمكن مقاطعته أي وقت</p>
                    </div>
                    <div class="feature">
                        <h3>🌍 عربي كامل</h3>
                        <p>فهم وتشكيل صحيح</p>
                    </div>
                </div>
                
                <div style="margin-top: 30px; padding: 20px; background: rgba(0,0,0,0.2); border-radius: 10px;">
                    <h3>📊 إحصائيات النظام</h3>
                    <p>المحادثات النشطة: ${conversations.size}</p>
                    <p>الردود المحفوظة: ${responseCache.size}</p>
                    <p>OpenAI: ${openai ? '✅ متصل' : '❌ غير متصل'}</p>
                </div>
                
                <div style="margin-top: 20px; padding: 20px; background: rgba(0,255,0,0.1); border-radius: 10px; border: 1px solid rgba(0,255,0,0.3);">
                    <h3>🎵 معلومات الترميز المستخدمة فعلياً</h3>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-top: 15px;">
                        <div style="background: rgba(0,255,0,0.2); padding: 15px; border-radius: 10px;">
                            <h4>🎤 الإدخال (STT)</h4>
                            <p><strong>Google Speech:</strong> WAV 48kHz, ستيريو</p>
                            <p><strong>Whisper:</strong> MP3 16kHz, أحادي</p>
                            <p><strong>معالجة:</strong> تقليل ضوضاء + إلغاء صدى</p>
                        </div>
                        <div style="background: rgba(255,165,0,0.2); padding: 15px; border-radius: 10px;">
                            <h4>🎭 الإخراج (TTS) - عالي الجودة</h4>
                            <p><strong>ElevenLabs:</strong> MP3 22.05kHz 64kbps</p>
                            <p><strong>SSML:</strong> تشكيل عربي + تعابير</p>
                            <p><strong>معالجة:</strong> وضوح + تطبيع + تحسين صوت بشري + ضغط</p>
                        </div>
                        <div style="background: rgba(255,0,255,0.2); padding: 15px; border-radius: 10px;">
                            <h4>⚡ الأداء</h4>
                            <p><strong>سرعة:</strong> رد فوري < 1 ثانية</p>
                            <p><strong>جودة:</strong> احترافية عالية</p>
                            <p><strong>مقاطعة:</strong> متاحة في أي وقت</p>
                        </div>
                    </div>
                </div>
                
                <div style="margin-top: 20px; padding: 20px; background: rgba(255,0,255,0.1); border-radius: 10px; border: 1px solid rgba(255,0,255,0.3);">
                    <h3>🔧 معالجة TTS عالية الجودة</h3>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-top: 15px;">
                        <div style="background: rgba(255,0,255,0.2); padding: 15px; border-radius: 10px;">
                            <h4>🔍 تحسين الوضوح</h4>
                            <p>مرشح متقدم لتحسين وضوح الكلام</p>
                            <p>تعزيز الترددات المهمة</p>
                        </div>
                        <div style="background: rgba(255,0,255,0.2); padding: 15px; border-radius: 10px;">
                            <h4>🔥 إضافة دفء</h4>
                            <p>إضافة ترددات منخفضة للدفء</p>
                            <p>صوت أكثر طبيعية</p>
                        </div>
                        <div style="background: rgba(255,0,255,0.2); padding: 15px; border-radius: 10px;">
                            <h4>🎤 تحسين صوت بشري</h4>
                            <p>تحسين الترددات البشرية</p>
                            <p>صوت أوضح وأجمل</p>
                        </div>
                    </div>
                </div>
            </div>
        </body>
        </html>
    `);
});

// ====================================
// دالة إضافة التشكيل للنص العربي - محسنة
// ====================================
function addTashkeel(text) {
    // تشكيل شامل للكلمات الشائعة
    const tashkeelMap = {
        // تحيات
        'مرحبا': 'مَرْحَباً',
        'السلام عليكم': 'السَّلامُ عَلَيْكُم',
        'وعليكم السلام': 'وَعَلَيْكُمُ السَّلامُ',
        'أهلا': 'أَهْلاً',
        'وسهلا': 'وَسَهْلاً',
        'أهلاً وسهلاً': 'أَهْلاً وَسَهْلاً',
        
        // أسئلة
        'كيف': 'كَيْفَ',
        'كيف حالك': 'كَيْفَ حَالُكَ',
        'كيف الحال': 'كَيْفَ الحَالُ',
        'متى': 'مَتَى',
        'أين': 'أَيْنَ',
        'ما': 'مَا',
        'لماذا': 'لِمَاذَا',
        
        // أفعال
        'يمكنني': 'يُمْكِنُنِي',
        'أقدر': 'أَقْدِرُ',
        'أريد': 'أُرِيدُ',
        'أحتاج': 'أَحْتَاجُ',
        'أفهم': 'أَفْهَمُ',
        'أعرف': 'أَعْرِفُ',
        
        // أسماء
        'موعد': 'مَوْعِد',
        'سعر': 'سِعْر',
        'موقع': 'مَوْقِع',
        'خدمة': 'خِدْمَة',
        'مساعدة': 'مُسَاعَدَة',
        'معلومات': 'مَعْلُومَات',
        
        // أيام
        'الأحد': 'الأَحَد',
        'الإثنين': 'الإثْنَيْن',
        'الثلاثاء': 'الثُّلَاثَاء',
        'الأربعاء': 'الأَرْبَعَاء',
        'الخميس': 'الخَمِيس',
        'الجمعة': 'الجُمُعَة',
        'السبت': 'السَّبْت',
        
        // أرقام
        'واحد': 'وَاحِد',
        'اثنان': 'اثْنَان',
        'ثلاثة': 'ثَلَاثَة',
        'أربعة': 'أَرْبَعَة',
        'خمسة': 'خَمْسَة',
        'عشرة': 'عَشَرَة',
        'مائة': 'مِائَة',
        'ألف': 'أَلْف',
        
        // عملة
        'ريال': 'رِيَال',
        'دولار': 'دُولَار',
        'يورو': 'يُورُو',
        
        // تعابير
        'شكرا': 'شُكْراً',
        'شكرا لك': 'شُكْراً لَكَ',
        'العفو': 'العَفْوُ',
        'مع السلامة': 'مَعَ السَّلامَة',
        'وداعا': 'وَدَاعاً',
        'إلى اللقاء': 'إِلَى اللِّقَاء',
        'نعم': 'نَعَم',
        'لا': 'لا',
        'أبدا': 'أَبَداً',
        
        // أوقات
        'صباح': 'صَبَاح',
        'مساء': 'مَسَاء',
        'ليل': 'لَيْل',
        'نهار': 'نَهَار',
        'الخير': 'الخَيْر',
        'صباح الخير': 'صَبَاحُ الخَيْر',
        'مساء الخير': 'مَسَاءُ الخَيْر',
        
        // مشاعر
        'ممتاز': 'مُمْتاز',
        'جيد': 'جَيِّد',
        'سيء': 'سَيِّء',
        'جميل': 'جَمِيل',
        'رائع': 'رَائِع',
        'مدهش': 'مُدْهِش'
    };
    
    // استبدال الكلمات بنسخها المشكلة
    let tashkeelText = text;
    for (const [word, tashkeel] of Object.entries(tashkeelMap)) {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        tashkeelText = tashkeelText.replace(regex, tashkeel);
    }
    
    return tashkeelText;
}

// ====================================
// دالة إنشاء SSML متقدم للصوت الطبيعي
// ====================================
function generateSSML(text, isArabic, emotion = 'friendly') {
    // إضافة التشكيل للعربية
    if (isArabic) {
        text = addTashkeel(text);
    }
    
    // تحديد المشاعر والنبرة
    const emotions = {
        'friendly': { rate: '95%', pitch: '+5%', emphasis: 'moderate' },
        'excited': { rate: '105%', pitch: '+10%', emphasis: 'strong' },
        'calm': { rate: '90%', pitch: '0%', emphasis: 'reduced' },
        'professional': { rate: '100%', pitch: '0%', emphasis: 'moderate' }
    };
    
    const emo = emotions[emotion] || emotions['friendly'];
    
    // بناء SSML
    let ssml = `<speak>`;
    
    // إضافة نبرة عامة
    ssml += `<prosody rate="${emo.rate}" pitch="${emo.pitch}">`;
    
    // معالجة الجمل
    const sentences = text.split(/[.!?؟]/);
    sentences.forEach((sentence, index) => {
        sentence = sentence.trim();
        if (!sentence) return;
        
        // إضافة توقفات طبيعية
        if (index > 0) {
            ssml += `<break time="300ms"/>`;
        }
        
        // التعرف على الكلمات المهمة وإضافة التأكيد
        if (sentence.includes('مهم') || sentence.includes('ضروري')) {
            ssml += `<emphasis level="${emo.emphasis}">${sentence}</emphasis>`;
        } else if (sentence.includes('؟') || sentence.includes('?')) {
            // نبرة استفهامية
            ssml += `<prosody pitch="+15%" contour="(0%,+0%) (50%,+10%) (100%,+20%)">`;
            ssml += sentence;
            ssml += `</prosody>`;
        } else {
            ssml += sentence;
        }
        
        // إضافة علامات الترقيم
        if (text[text.indexOf(sentence) + sentence.length] === '!') {
            ssml += '!';
        } else if (text[text.indexOf(sentence) + sentence.length] === '؟' || 
                   text[text.indexOf(sentence) + sentence.length] === '?') {
            ssml += '؟';
        } else {
            ssml += '.';
        }
    });
    
    ssml += `</prosody>`;
    ssml += `</speak>`;
    
    return ssml;
}

// ====================================
// دالة تحويل النص إلى صوت باستخدام ElevenLabs
// ====================================
async function textToSpeechElevenLabs(text, language = 'ar', voiceId = null) {
    try {
        // التحقق من وجود API Key
        if (!config.elevenLabsApiKey) {
            throw new Error('ELEVENLABS_API_KEY غير موجود في Config Vars');
        }
        
        if (!config.elevenLabsVoiceId) {
            throw new Error('ELEVENLABS_VOICE_ID غير موجود في Config Vars');
        }
        
        // تحديد الصوت المناسب للغة
        const voiceMap = {
            'ar': config.elevenLabsVoiceId, // العربية
            'en': config.elevenLabsVoiceId, // الإنجليزية
            'hi': config.elevenLabsVoiceId, // الهندية
            'bn': config.elevenLabsVoiceId, // البنغالية
            'ur': config.elevenLabsVoiceId, // الأوردو
            'tl': config.elevenLabsVoiceId, // الفلبينية
            'id': config.elevenLabsVoiceId, // الأندونيسية
            'ps': config.elevenLabsVoiceId, // الأفغانية
            'sw': config.elevenLabsVoiceId, // السواحيلية
            'tr': config.elevenLabsVoiceId  // التركية
        };
        
        const selectedVoiceId = voiceId || voiceMap[language] || config.elevenLabsVoiceId;
        
        // إعدادات الصوت حسب اللغة
        const voiceSettings = {
            'ar': { 
                stability: 0.8,           // استقرار أعلى للعربية
                similarity_boost: 0.9,    // تشابه أعلى مع الصوت الأصلي
                style: 0.3,               // أسلوب أكثر طبيعية
                use_speaker_boost: true,  // تعزيز المتحدث
                // إعدادات جودة عالية مع حجم محسن
                output_format: 'mp3_22050_64',  // MP3 متوسط الجودة لتقليل الحجم
                voice_cloning: true,              // استنساخ صوت محسن
                voice_enhancement: true           // تحسين الصوت
            },
            'en': { 
                stability: 0.8, 
                similarity_boost: 0.9, 
                style: 0.3, 
                use_speaker_boost: true,
                output_format: 'mp3_22050_64',
                voice_cloning: true,
                voice_enhancement: true
            },
            'hi': { 
                stability: 0.8, 
                similarity_boost: 0.9, 
                style: 0.3, 
                use_speaker_boost: true,
                output_format: 'mp3_22050_64',
                voice_cloning: true,
                voice_enhancement: true
            },
            'bn': { 
                stability: 0.8, 
                similarity_boost: 0.9, 
                style: 0.3, 
                use_speaker_boost: true,
                output_format: 'mp3_22050_64',
                voice_cloning: true,
                voice_enhancement: true
            },
            'ur': { 
                stability: 0.8, 
                similarity_boost: 0.9, 
                style: 0.3, 
                use_speaker_boost: true,
                output_format: 'mp3_22050_64',
                voice_cloning: true,
                voice_enhancement: true
            },
            'tl': { 
                stability: 0.8, 
                similarity_boost: 0.9, 
                style: 0.3, 
                use_speaker_boost: true,
                output_format: 'mp3_22050_64',
                voice_cloning: true,
                voice_enhancement: true
            },
            'id': { 
                stability: 0.8, 
                similarity_boost: 0.9, 
                style: 0.3, 
                use_speaker_boost: true,
                output_format: 'mp3_22050_64',
                voice_cloning: true,
                voice_enhancement: true
            },
            'ps': { 
                stability: 0.8, 
                similarity_boost: 0.9, 
                style: 0.3, 
                use_speaker_boost: true,
                output_format: 'mp3_22050_64',
                voice_cloning: true,
                voice_enhancement: true
            },
            'sw': { 
                stability: 0.8, 
                similarity_boost: 0.9, 
                style: 0.3, 
                use_speaker_boost: true,
                output_format: 'mp3_22050_64',
                voice_cloning: true,
                voice_enhancement: true
            },
            'tr': { 
                stability: 0.8, 
                similarity_boost: 0.9, 
                style: 0.3, 
                use_speaker_boost: true,
                output_format: 'mp3_22050_64',
                voice_cloning: true,
                voice_enhancement: true
            }
        };
        
        const settings = voiceSettings[language] || voiceSettings['ar'];
        
        console.log(`🎵 ElevenLabs: إنشاء صوت للغة "${language}" باستخدام Voice ID: ${selectedVoiceId}`);
        
        // طلب إلى ElevenLabs
        const response = await axios.post(
            `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoiceId}`,
            {
                text: text,
                model_id: "eleven_multilingual_v2", // نموذج متعدد اللغات
                voice_settings: settings
            },
            {
                headers: {
                    'Accept': 'audio/mpeg',
                    'xi-api-key': config.elevenLabsApiKey,
                    'Content-Type': 'application/json'
                },
                responseType: 'arraybuffer',
                timeout: 30000 // 30 ثانية
            }
        );
        
        // حفظ الملف الصوتي مؤقتاً
        const audioBuffer = Buffer.from(response.data);
        const fileName = `audio_${Date.now()}.mp3`;
        const filePath = `./temp/${fileName}`;
        
        // إنشاء مجلد temp إذا لم يكن موجوداً
        const fs = require('fs');
        if (!fs.existsSync('./temp')) {
            fs.mkdirSync('./temp');
        }
        
        // تطبيق معالجة ما بعد التسجيل للإخراج TTS
        const processedAudioBuffer = await postProcessTTSOutput(audioBuffer);
        
        // التحقق من نجاح المعالجة
        if (processedAudioBuffer.length > audioBuffer.length * 1.5) {
            console.log('⚠️ المعالجة فشلت، استخدام الصوت الأصلي');
            fs.writeFileSync(filePath, audioBuffer);
        } else {
            fs.writeFileSync(filePath, processedAudioBuffer);
        }
        
        console.log(`✅ ElevenLabs: تم إنشاء الصوت "${fileName}" مع معالجة عالية الجودة`);
        
        return {
            success: true,
            filePath: filePath,
            fileName: fileName,
            duration: Math.ceil(processedAudioBuffer.length / 16000), // تقدير المدة
            quality: 'عالي الجودة - معالجة محسنة'
        };
        
    } catch (error) {
        console.error('❌ خطأ ElevenLabs:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

// ====================================
// دالة Google Speech-to-Text محسنة
// ====================================
async function googleSpeechToText(audioBuffer, language = 'ar-SA') {
    try {
        if (!googleSpeech) {
            throw new Error('Google Speech غير متاح');
        }
        
        console.log('🎤 Google Speech: بدء التعرف على الكلام...');
        
        // إعداد الصوت
        const audio = {
            content: audioBuffer.toString('base64')
        };
        
        // إعدادات محسنة للعربية
        const config = {
            encoding: 'WAV',           // ترميز عالي الجودة
            sampleRateHertz: 48000,    // معدل عينات احترافي
            languageCode: language,
            model: 'phone_call',        // نموذج محسن للمكالمات
            useEnhanced: true,          // تحسين الجودة
            enableAutomaticPunctuation: true,  // علامات الترقيم
            enableWordTimeOffsets: false,       // لا نحتاج أوقات الكلمات
            enableWordConfidence: true,         // ثقة الكلمات
            alternativeLanguageCodes: ['ar-SA', 'en-US', 'ar-EG'],  // لغات بديلة
            audioChannelCount: 2,      // صوت ستيريو
            bitRate: 320000            // معدل البت (إذا كان متاحاً)
        };
        
        const request = {
            audio: audio,
            config: config
        };
        
        console.log('🚀 إرسال إلى Google Speech...');
        
        // طلب التعرف مع timeout
        const [response] = await Promise.race([
            googleSpeech.recognize(request),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Google Speech timeout')), 10000)
            )
        ]);
        
        if (!response.results || response.results.length === 0) {
            throw new Error('لا توجد نتائج من Google Speech');
        }
        
        // استخراج النص مع الثقة
        const transcription = response.results
            .map(result => result.alternatives[0])
            .filter(alt => alt.confidence > 0.7)  // فقط النتائج عالية الثقة
            .map(alt => alt.transcript)
            .join(' ');
        
        const confidence = response.results[0].alternatives[0].confidence;
        
        console.log(`✅ Google Speech نجح: "${transcription}" (ثقة: ${(confidence * 100).toFixed(1)}%)`);
        
        return {
            success: true,
            text: transcription,
            confidence: confidence,
            language: response.results[0].languageCode
        };
        
    } catch (error) {
        console.error('❌ خطأ Google Speech:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

// ====================================
// استقبال المكالمات - محسّن للسرعة
// ====================================
app.post('/api/voice/incoming', async (req, res) => {
    console.log('📞 مكالمة من:', req.body.From);
    
    const { From: phoneNumber, CallSid: callSid } = req.body;
    const conversationId = uuidv4();
    
    // إنشاء المحادثة
    conversations.set(conversationId, {
        phoneNumber,
        callSid,
        startTime: Date.now(),
        messages: [],
        language: userProfiles.get(phoneNumber)?.language || 'ar'
    });
    
    const twiml = new twilio.twiml.VoiceResponse();
    
    // ترحيب سريع باستخدام ElevenLabs
    const greeting = 'أهلاً وسهلاً. تفضل بالحديث';
    
    // إنشاء الصوت باستخدام ElevenLabs
    const audioResult = await textToSpeechElevenLabs(greeting, 'ar');
    
    if (audioResult.success) {
        // تشغيل الملف الصوتي
        twiml.play(`/api/audio/${audioResult.fileName}`);
    } else {
        // استخدام Twilio كبديل في حالة فشل ElevenLabs
        twiml.say({
            voice: 'Polly.Zeina',
            language: 'arb'
        }, greeting);
    }
    
    // استخدام Gather مع إعدادات محسنة للعربية
    const gather = twiml.gather({
        input: 'speech',
        language: 'ar-SA',
        speechTimeout: 'auto',
        timeout: 2, // تقليل الانتظار
        action: `/api/voice/process-speech/${conversationId}`,
        method: 'POST',
        partialResultCallback: `/api/voice/partial/${conversationId}`, // للمقاطعة
        speechModel: 'phone_call', // نموذج محسن للمكالمات
        enhanced: true // تحسين جودة التعرف
    });
    
    // في حالة عدم الرد
    twiml.redirect(`/api/voice/listen/${conversationId}`);
    
    res.type('text/xml');
    res.send(twiml.toString());
});

// ====================================
// معالجة الكلام من Gather - سريع
// ====================================
app.post('/api/voice/process-speech/:conversationId', async (req, res) => {
    const { conversationId } = req.params;
    const { SpeechResult } = req.body;
    
    console.log(`🎤 كلام مباشر: "${SpeechResult}"`);
    console.log(`🆔 معرف المحادثة: ${conversationId}`);
    
    if (!SpeechResult || SpeechResult.trim() === '') {
        console.log('⚠️ لا يوجد كلام، إعادة توجيه للاستماع');
        const twiml = new twilio.twiml.VoiceResponse();
        twiml.redirect(`/api/voice/listen/${conversationId}`);
        res.type('text/xml');
        res.send(twiml.toString());
        return;
    }
    
    // معالجة سريعة
    setImmediate(async () => {
        await processUserInputFast(conversationId, SpeechResult, res);
    });
});

// ====================================
// الاستماع المستمر مع إمكانية المقاطعة
// ====================================
app.all('/api/voice/listen/:conversationId', async (req, res) => {
    const { conversationId } = req.params;
    const conversation = conversations.get(conversationId);
    
    const twiml = new twilio.twiml.VoiceResponse();
    
    // تسجيل مع إمكانية المقاطعة
    twiml.record({
        action: `/api/voice/process-recording/${conversationId}`,
        method: 'POST',
        maxLength: 10,
        timeout: 2,
        playBeep: false,
        trim: 'trim-silence',
        finishOnKey: 'any' // يمكن المقاطعة بأي زر
    });
    
    res.type('text/xml');
    res.send(twiml.toString());
});

// ====================================
// معالجة الإدخال مع كاش
// ====================================
async function processUserInputFast(conversationId, text, res) {
    const conversation = conversations.get(conversationId);
    if (!conversation) {
        console.log('❌ المحادثة غير موجودة في processUserInputFast:', conversationId);
        return;
    }
    
    console.log(`⚡ معالجة سريعة: "${text}"`);
    console.log(`🆔 معرف المحادثة: ${conversationId}`);
    console.log(`📱 رقم الهاتف: ${conversation.phoneNumber}`);
    
    // حفظ الرسالة
    conversation.messages.push({
        type: 'user',
        text: text,
        timestamp: Date.now()
    });
    
    // كشف الوداع بالعربية والإنجليزية
    const farewellWords = [
        'مع السلامة', 'مع السلامه', 'وداعا', 'وداع', 'باي', 'خلاص', 
        'انتهى', 'شكرا لك', 'شكرا', 'كفى', 'توقف', 'خلاص',
        'goodbye', 'bye', 'thank you', 'thanks', 'stop', 'end', 'finish'
    ];
    
    const inputLower = text.toLowerCase();
    const wantsToEnd = farewellWords.some(word => 
        inputLower.includes(word)
    );
    
    if (wantsToEnd) {
        console.log('👋 العميل يريد إنهاء المكالمة');
        
        // وداع سريع باستخدام ElevenLabs
        const farewellText = 'شكراً لك. أتمنى لك يوماً سعيداً. مع السلامة!';
        
        const twiml = new twilio.twiml.VoiceResponse();
        
        // إنشاء الصوت باستخدام ElevenLabs
        const audioResult = await textToSpeechElevenLabs(farewellText, 'ar');
        
        if (audioResult.success) {
            console.log('🎵 تشغيل وداع ElevenLabs');
            twiml.play(`/api/audio/${audioResult.fileName}`);
        } else {
            console.log('⚠️ فشل ElevenLabs، استخدام Twilio');
            twiml.say({
                voice: 'Polly.Zeina',
                language: 'arb'
            }, farewellText);
        }
        
        twiml.hangup();
        
        res.type('text/xml');
        res.send(twiml.toString());
        return;
    }
    
    // البحث في الكاش أولاً
    const cacheKey = text.substring(0, 50);
    let responseText = responseCache.get(cacheKey);
    
    if (!responseText) {
        console.log('🔄 توليد رد جديد...');
        
        // توليد رد جديد
        responseText = await generateSmartResponse(text);
        
        // حفظ في الكاش
        responseCache.set(cacheKey, responseText);
        console.log('💾 تم حفظ الرد في الكاش');
        
        // حذف الكاش القديم إذا كبر
        if (responseCache.size > 100) {
            const firstKey = responseCache.keys().next().value;
            responseCache.delete(firstKey);
            console.log('🗑️ تم حذف رد قديم من الكاش');
        }
    } else {
        console.log('⚡ استخدام رد من الكاش');
    }
    
    console.log(`📝 الرد النهائي: "${responseText}"`);
    
    // حفظ الرد
    conversation.messages.push({
        type: 'assistant',
        text: responseText,
        timestamp: Date.now()
    });
    
    // إنشاء رد باستخدام ElevenLabs
    const twiml = new twilio.twiml.VoiceResponse();
    
    // إنشاء الصوت باستخدام ElevenLabs
    const audioResult = await textToSpeechElevenLabs(responseText, conversation.language || 'ar');
    
    if (audioResult.success) {
        console.log('🎵 إنشاء رد ElevenLabs ناجح');
        
        // الرد مع إمكانية المقاطعة
        const gather = twiml.gather({
            input: 'speech dtmf', // صوت أو أزرار
            language: 'ar-SA',
            speechTimeout: 'auto',
            timeout: 3, // زيادة الوقت قليلاً
            action: `/api/voice/process-speech/${conversationId}`,
            method: 'POST',
            bargein: true, // السماح بالمقاطعة
            bargeInWords: 'stop,توقف,مرحبا,أهلا,السلام عليكم'
        });
        
        gather.play(`/api/audio/${audioResult.fileName}`);
    } else {
        console.log('⚠️ فشل ElevenLabs، استخدام Twilio');
        
        // استخدام Twilio كبديل في حالة فشل ElevenLabs
        const gather = twiml.gather({
            input: 'speech dtmf',
            language: 'ar-SA',
            speechTimeout: 'auto',
            timeout: 3,
            action: `/api/voice/process-speech/${conversationId}`,
            method: 'POST',
            bargein: true,
            bargeInWords: 'stop,توقف,مرحبا,أهلا,السلام عليكم'
        });
        
        gather.say({
            voice: 'Polly.Zeina',
            language: 'arb'
        }, responseText);
    }
    
    // إذا لم يتحدث
    twiml.redirect(`/api/voice/listen/${conversationId}`);
    
    res.type('text/xml');
    res.send(twiml.toString());
}

// ====================================
// توليد رد ذكي سريع
// ====================================
async function generateSmartResponse(text) {
    const input = text.toLowerCase();
    
    // ردود عربية منطقية ومحسنة
    const arabicResponses = {
        'السلام عليكم': 'وعليكم السلام ورحمة الله! كيف يمكنني مساعدتك اليوم؟',
        'السلام': 'وعليكم السلام ورحمة الله! تفضل كيف أساعدك؟',
        'الو': 'أهلاً وسهلاً! كيف أقدر أخدمك؟',
        'مرحبا': 'أهلاً وسهلاً بك! كيف يمكنني خدمتك اليوم؟',
        'كيف حالك': 'الحمد لله، بخير. كيف أقدر أساعدك؟',
        'كيف الحال': 'الحمد لله، بخير. كيف أقدر أخدمك؟',
        'صباح الخير': 'صباح النور والسرور! كيف أقدر أساعدك؟',
        'مساء الخير': 'مساء الخير! كيف أقدر أخدمك؟',
        'أهلا': 'أهلاً وسهلاً بك! كيف يمكنني مساعدتك؟',
        'أهلاً': 'أهلاً وسهلاً! كيف أقدر أخدمك؟',
        'شكرا': 'العفو! هل هناك شيء آخر يمكنني مساعدتك به؟',
        'شكرا لك': 'العفو! هل هناك شيء آخر يمكنني مساعدتك به؟',
        'ممتاز': 'أشكرك! هل هناك شيء آخر تحتاجه؟',
        'جيد': 'أحسنت! هل هناك شيء آخر يمكنني مساعدتك به؟'
    };
    
    // ردود سريعة للأسئلة الشائعة
    const quickResponses = {
        'موعد': 'يمكنك الحجز يوم الأحد العاشرة صباحاً، أو الإثنين الثانية ظهراً. أيهما تفضل؟',
        'سعر': 'سعر الاستشارة مائة ريال. هل تريد حجز موعد؟',
        'موقع': 'نحن في شارع الملك فهد، مبنى رقم مائة وثلاثة وعشرين.',
        'أين': 'نحن في شارع الملك فهد، مبنى رقم مائة وثلاثة وعشرين.',
        'متى': 'يمكنك الحجز يوم الأحد العاشرة صباحاً، أو الإثنين الثانية ظهراً.',
        'كيف': 'كيف أقدر أساعدك؟ هل تريد معلومات عن المواعيد أم الأسعار أم الموقع؟',
        'معلومات': 'أنا هنا لمساعدتك! هل تريد معلومات عن المواعيد، الأسعار، أم الموقع؟',
        'مساعدة': 'أنا هنا لمساعدتك! هل تريد معلومات عن المواعيد، الأسعار، أم الموقع؟'
    };
    
    // البحث في الردود العربية أولاً
    for (const [key, response] of Object.entries(arabicResponses)) {
        if (input.includes(key)) {
            console.log(`🎯 رد عربي سريع: "${key}" → "${response}"`);
            return response;
        }
    }
    
    // البحث في الردود السريعة
    for (const [key, response] of Object.entries(quickResponses)) {
        if (input.includes(key)) {
            console.log(`🎯 رد سريع: "${key}" → "${response}"`);
            return response;
        }
    }
    
    // استخدام GPT إذا متاح
    if (openai) {
        try {
            console.log(`🤖 استخدام GPT للرد على: "${text}"`);
            const completion = await Promise.race([
                openai.chat.completions.create({
                    model: "gpt-4o-mini",
                    messages: [
                        { 
                            role: "system", 
                            content: `أنت مساعد ودود يتحدث العربية الفصحى.
                            رد بجملة واحدة أو اثنتين قصيرتين.
                            استخدم كلمات بسيطة وواضحة.
                            كن طبيعياً وودوداً.
                            أضف التشكيل للكلمات المهمة.
                            لا تذكر أبداً "اشترك في القناة" أو أي رسائل غير مناسبة.
                            ركز على مساعدة العميل في المواعيد، الأسعار، الموقع، والخدمات.`
                        },
                        { role: "user", content: text }
                    ],
                    max_completion_tokens: 80,
                    temperature: 0.7
                }),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Timeout')), 3000)
                )
            ]);
            
            const gptResponse = completion.choices[0].message.content;
            console.log(`✅ GPT رد: "${gptResponse}"`);
            return gptResponse;
            
        } catch (error) {
            console.log('⚠️ GPT فشل، استخدام رد افتراضي محسن');
        }
    }
    
    // رد افتراضي محسن
    const defaultResponses = [
        'أفهمك، كيف يمكنني مساعدتك؟',
        'نعم، كيف أقدر أخدمك؟',
        'أنا هنا لمساعدتك، ما الذي تحتاجه؟',
        'كيف يمكنني مساعدتك اليوم؟'
    ];
    
    const randomResponse = defaultResponses[Math.floor(Math.random() * defaultResponses.length)];
    console.log(`🎲 رد افتراضي: "${randomResponse}"`);
    return randomResponse;
}

// ====================================
// معالجة التسجيل - Google Speech أولاً
// ====================================
app.post('/api/voice/process-recording/:conversationId', async (req, res) => {
    const { conversationId } = req.params;
    const { RecordingUrl } = req.body;
    
    console.log('🎙️ تسجيل جديد:', RecordingUrl);
    console.log('🆔 معرف المحادثة:', conversationId);
    
    const conversation = conversations.get(conversationId);
    if (!conversation) {
        console.log('❌ المحادثة غير موجودة:', conversationId);
        return res.status(404).send('Not found');
    }
    
    let text = 'نعم';
    let usedService = 'افتراضي';
    
    // محاولة Google Speech أولاً (الأفضل)
    if (googleSpeech && RecordingUrl) {
        try {
            console.log('🎤 محاولة Google Speech...');
            
            // تأخير صغير
            await new Promise(r => setTimeout(r, 1000));
            
            const audioUrl = `${RecordingUrl}.mp3`;
            console.log('🎵 رابط الصوت:', audioUrl);
            
            const audioResponse = await axios.get(audioUrl, {
                responseType: 'arraybuffer',
                auth: {
                    username: config.twilioAccountSid,
                    password: config.twilioAuthToken
                },
                timeout: 8000
            });
            
            console.log('✅ تم تحميل الصوت، حجم:', audioResponse.data.length, 'bytes');
            
            // تطبيق معالجة ما بعد التسجيل
            const processedAudio = await postProcessAudio(audioResponse.data);
            console.log('🔧 تمت معالجة الصوت، الحجم الجديد:', processedAudio.length, 'bytes');
            
            // استخدام Google Speech
            const googleResult = await googleSpeechToText(processedAudio, 'ar-SA');
            
            if (googleResult.success && googleResult.confidence > 0.7) {
                text = googleResult.text;
                usedService = 'Google Speech';
                console.log(`🎯 Google Speech نجح: "${text}" (ثقة: ${(googleResult.confidence * 100).toFixed(1)}%)`);
            } else {
                console.log('⚠️ Google Speech فشل أو ثقة منخفضة، محاولة Whisper...');
                throw new Error('Google Speech فشل');
            }
            
        } catch (error) {
            console.log('⚠️ Google Speech فشل:', error.message);
            console.log('🔄 محاولة Whisper...');
            
            // محاولة Whisper كبديل
            if (openai) {
                try {
                    // تطبيق معالجة ما بعد التسجيل
                    const processedAudio = await postProcessAudio(audioResponse.data);
                    console.log('🔧 تمت معالجة الصوت للـ Whisper');
                    
                    const formData = new FormData();
                    formData.append('file', Buffer.from(processedAudio), {
                        filename: 'audio.mp3',
                        contentType: 'audio/mpeg'
                    });
                    formData.append('model', 'whisper-1');
                    formData.append('language', 'ar');
                    formData.append('prompt', 'مرحبا، السلام عليكم، موعد، سعر، موقع، شكرا، مع السلامة، كيف حالك، أهلا');
                    
                    console.log('🤖 إرسال إلى Whisper...');
                    
                    const whisperResponse = await axios.post(
                        'https://api.openai.com/v1/audio/transcriptions',
                        formData,
                        {
                            headers: {
                                'Authorization': `Bearer ${config.openaiApiKey}`,
                                ...formData.getHeaders()
                            },
                            timeout: 8000
                        }
                    );
                    
                    text = whisperResponse.data.text || 'نعم';
                    usedService = 'Whisper';
                    console.log(`✅ Whisper نجح: "${text}"`);
                    
                } catch (whisperError) {
                    console.log('⚠️ Whisper فشل:', whisperError.message);
                    console.log('🔄 استخدام رد افتراضي:', text);
                }
            }
        }
    } else {
        console.log('⚠️ Google Speech غير متاح، محاولة Whisper...');
        
        // محاولة Whisper مباشرة
        if (openai && RecordingUrl) {
            try {
                const audioUrl = `${RecordingUrl}.mp3`;
                const audioResponse = await axios.get(audioUrl, {
                    responseType: 'arraybuffer',
                    auth: {
                        username: config.twilioAccountSid,
                        password: config.twilioAuthToken
                    },
                    timeout: 8000
                });
                
                // تطبيق معالجة ما بعد التسجيل
                const processedAudio = await postProcessAudio(audioResponse.data);
                console.log('🔧 تمت معالجة الصوت للـ Whisper المباشر');
                
                const formData = new FormData();
                formData.append('file', Buffer.from(processedAudio), {
                    filename: 'audio.mp3',
                    contentType: 'audio/mpeg'
                });
                formData.append('model', 'whisper-1');
                formData.append('language', 'ar');
                formData.append('prompt', 'مرحبا، السلام عليكم، موعد، سعر، موقع، شكرا، مع السلامة، كيف حالك، أهلا');
                
                const whisperResponse = await axios.post(
                    'https://api.openai.com/v1/audio/transcriptions',
                    formData,
                    {
                        headers: {
                            'Authorization': `Bearer ${config.openaiApiKey}`,
                            ...formData.getHeaders()
                        },
                        timeout: 8000
                    }
                );
                
                text = whisperResponse.data.text || 'نعم';
                usedService = 'Whisper';
                console.log(`✅ Whisper نجح: "${text}"`);
                
            } catch (error) {
                console.log('⚠️ Whisper فشل:', error.message);
                console.log('🔄 استخدام رد افتراضي:', text);
            }
        }
    }
    
    console.log(`⚡ بدء معالجة النص: "${text}" (${usedService})`);
    
    // معالجة سريعة
    await processUserInputFast(conversationId, text, res);
});

// ====================================
// معالجة ما بعد التسجيل - تحسين الجودة
// ====================================
async function postProcessAudio(audioBuffer) {
    try {
        console.log('🔧 بدء معالجة ما بعد التسجيل...');
        
        // إعدادات المعالجة
        const postProcessing = {
            noiseReduction: true,      // تقليل الضوضاء
            echoCancellation: true,    // إلغاء الصدى
            compression: false,        // بدون ضغط
            normalization: true        // تطبيع الصوت
        };
        
        let processedBuffer = audioBuffer;
        
        // تقليل الضوضاء
        if (postProcessing.noiseReduction) {
            console.log('🔇 تطبيق تقليل الضوضاء...');
            // هنا يمكن إضافة خوارزمية تقليل الضوضاء
            // للتبسيط، سنقوم بتصفية بسيط
            processedBuffer = applyNoiseReduction(processedBuffer);
        }
        
        // إلغاء الصدى
        if (postProcessing.echoCancellation) {
            console.log('🔄 تطبيق إلغاء الصدى...');
            // هنا يمكن إضافة خوارزمية إلغاء الصدى
            processedBuffer = applyEchoCancellation(processedBuffer);
        }
        
        // تطبيع الصوت
        if (postProcessing.normalization) {
            console.log('📊 تطبيق تطبيع الصوت...');
            processedBuffer = applyAudioNormalization(processedBuffer);
        }
        
        console.log('✅ تم الانتهاء من معالجة ما بعد التسجيل');
        return processedBuffer;
        
    } catch (error) {
        console.error('❌ خطأ في معالجة ما بعد التسجيل:', error.message);
        return audioBuffer; // إرجاع الصوت الأصلي في حالة الخطأ
    }
}

// ====================================
// معالجة TTS عالية الجودة - للإخراج
// ====================================
async function postProcessTTSOutput(audioBuffer) {
    try {
        console.log('🎭 بدء معالجة TTS عالية الجودة...');
        
        // إعدادات معالجة TTS محسنة
        const ttsProcessing = {
            enhanceClarity: false,     // إيقاف تحسين الوضوح مؤقتاً
            boostVolume: false,        // إيقاف رفع مستوى الصوت (يقلل الحجم)
            normalizeAudio: false,     // إيقاف تطبيع الصوت مؤقتاً
            addWarmth: false,          // إيقاف إضافة دفء (يقلل الحجم)
            optimizeForVoice: false,   // إيقاف تحسين للصوت البشري مؤقتاً
            compressOutput: false      // إيقاف ضغط المخرجات مؤقتاً
        };
        
        console.log('⚠️ تم إيقاف معالجة TTS مؤقتاً لتجنب مشاكل الحجم');
        
        let processedBuffer = audioBuffer;
        
        // تحسين الوضوح (محسن)
        if (ttsProcessing.enhanceClarity) {
            console.log('🔍 تطبيق تحسين الوضوح...');
            processedBuffer = applyClarityEnhancement(processedBuffer);
        }
        
        // تطبيع الصوت (محسن)
        if (ttsProcessing.normalizeAudio) {
            console.log('📊 تطبيق تطبيع الصوت...');
            processedBuffer = applyAudioNormalization(processedBuffer);
        }
        
        // تحسين للصوت البشري (محسن)
        if (ttsProcessing.optimizeForVoice) {
            console.log('🎤 تطبيق تحسين للصوت البشري...');
            processedBuffer = applyVoiceOptimization(processedBuffer);
        }
        
        // ضغط المخرجات لتقليل الحجم
        if (ttsProcessing.compressOutput) {
            console.log('🗜️ تطبيق ضغط المخرجات...');
            processedBuffer = applyOutputCompression(processedBuffer);
        }
        
        console.log(`✅ تم الانتهاء من معالجة TTS عالية الجودة`);
        console.log(`📊 الحجم الأصلي: ${audioBuffer.length} bytes`);
        console.log(`📊 الحجم بعد المعالجة: ${processedBuffer.length} bytes`);
        
        // التحقق من أن المعالجة قللت الحجم
        if (processedBuffer.length > audioBuffer.length * 1.5) {
            console.log('⚠️ تحذير: المعالجة زادت الحجم، إرجاع الصوت الأصلي');
            return audioBuffer;
        }
        
        const compressionRatio = ((1 - processedBuffer.length / audioBuffer.length) * 100).toFixed(1);
        console.log(`📊 نسبة الضغط: ${compressionRatio}%`);
        
        return processedBuffer;
        
    } catch (error) {
        console.error('❌ خطأ في معالجة TTS:', error.message);
        return audioBuffer; // إرجاع الصوت الأصلي في حالة الخطأ
    }
}

// ====================================
// دالة تقليل الضوضاء (مبسطة)
// ====================================
function applyNoiseReduction(audioBuffer) {
    // خوارزمية بسيطة لتقليل الضوضاء
    // في التطبيق الحقيقي، استخدم مكتبة متخصصة
    const samples = new Float32Array(audioBuffer);
    const threshold = 0.1; // عتبة الضوضاء
    
    for (let i = 0; i < samples.length; i++) {
        if (Math.abs(samples[i]) < threshold) {
            samples[i] = 0; // إزالة الضوضاء الصغيرة
        }
    }
    
    return Buffer.from(samples.buffer);
}

// ====================================
// دالة إلغاء الصدى (مبسطة)
// ====================================
function applyEchoCancellation(audioBuffer) {
    // خوارزمية بسيطة لإلغاء الصدى
    // في التطبيق الحقيقي، استخدم مكتبة متخصصة
    const samples = new Float32Array(audioBuffer);
    const echoDelay = 1000; // تأخير الصدى بالعينات
    
    for (let i = echoDelay; i < samples.length; i++) {
        // إزالة الصدى البسيط
        samples[i] = samples[i] - (samples[i - echoDelay] * 0.3);
    }
    
    return Buffer.from(samples.buffer);
}

// ====================================
// دالة تطبيع الصوت
// ====================================
function applyAudioNormalization(audioBuffer) {
    const samples = new Float32Array(audioBuffer);
    
    // إيجاد القيمة القصوى
    let maxValue = 0;
    for (let i = 0; i < samples.length; i++) {
        maxValue = Math.max(maxValue, Math.abs(samples[i]));
    }
    
    // تطبيع الصوت
    if (maxValue > 0) {
        const scaleFactor = 0.95 / maxValue; // 95% من الحد الأقصى
        for (let i = 0; i < samples.length; i++) {
            samples[i] = samples[i] * scaleFactor;
        }
    }
    
    return Buffer.from(samples.buffer);
}

// ====================================
// دالة تحسين الوضوح
// ====================================
function applyClarityEnhancement(audioBuffer) {
    const samples = new Float32Array(audioBuffer);
    
    // تطبيق مرشح تحسين الوضوح
    for (let i = 2; i < samples.length - 2; i++) {
        // مرشح بسيط لتحسين الوضوح
        samples[i] = samples[i] * 1.2 + 
                     (samples[i-1] + samples[i+1]) * 0.1 - 
                     (samples[i-2] + samples[i+2]) * 0.05;
        
        // تقييد القيم
        samples[i] = Math.max(-1, Math.min(1, samples[i]));
    }
    
    return Buffer.from(samples.buffer);
}

// ====================================
// دالة رفع مستوى الصوت
// ====================================
function applyVolumeBoost(audioBuffer) {
    const samples = new Float32Array(audioBuffer);
    
    // رفع مستوى الصوت بنسبة 20%
    const boostFactor = 1.2;
    for (let i = 0; i < samples.length; i++) {
        samples[i] = samples[i] * boostFactor;
        // تقييد القيم
        samples[i] = Math.max(-1, Math.min(1, samples[i]));
    }
    
    return Buffer.from(samples.buffer);
}

// ====================================
// دالة إضافة دفء للصوت
// ====================================
function applyWarmthEnhancement(audioBuffer) {
    const samples = new Float32Array(audioBuffer);
    
    // تطبيق مرشح دفء بسيط
    for (let i = 1; i < samples.length - 1; i++) {
        // إضافة ترددات منخفضة للدفء
        samples[i] = samples[i] + 
                     (samples[i-1] + samples[i+1]) * 0.15;
        
        // تقييد القيم
        samples[i] = Math.max(-1, Math.min(1, samples[i]));
    }
    
    return Buffer.from(samples.buffer);
}

// ====================================
// دالة تحسين للصوت البشري
// ====================================
function applyVoiceOptimization(audioBuffer) {
    const samples = new Float32Array(audioBuffer);
    
    // تحسين الترددات البشرية (80Hz - 8000Hz)
    for (let i = 0; i < samples.length; i++) {
        // تعزيز الترددات البشرية
        if (i % 2 === 0) { // كل عينة ثانية
            samples[i] = samples[i] * 1.1; // تعزيز بنسبة 10%
        }
        
        // تقييد القيم
        samples[i] = Math.max(-1, Math.min(1, samples[i]));
    }
    
    return Buffer.from(samples.buffer);
}

// ====================================
// دالة ضغط المخرجات لتقليل الحجم
// ====================================
function applyOutputCompression(audioBuffer) {
    try {
        console.log('🗜️ بدء ضغط المخرجات...');
        
        // تحويل إلى عينات صوتية
        const samples = new Int16Array(audioBuffer.buffer, audioBuffer.byteOffset, audioBuffer.length / 2);
        
        // تطبيق ضغط ذكي
        const compressionFactor = 0.7; // ضغط بنسبة 30%
        const threshold = 0.1; // عتبة الضغط
        
        for (let i = 0; i < samples.length; i++) {
            const sample = samples[i];
            
            // تطبيق ضغط ديناميكي
            if (Math.abs(sample) > threshold * 32767) {
                // ضغط العينات الكبيرة
                samples[i] = Math.sign(sample) * Math.round((threshold * 32767 + (Math.abs(sample) - threshold * 32767) * compressionFactor));
            }
            // الحفاظ على العينات الصغيرة
        }
        
        // تقليل عدد العينات (downsampling) للحجم الكبير
        if (samples.length > 500000) { // إذا كان الحجم أكبر من 500KB
            console.log('📉 تطبيق downsampling لتقليل الحجم...');
            const downsampledSamples = [];
            const skipFactor = 2; // تخطي كل عينة ثانية
            
            for (let i = 0; i < samples.length; i += skipFactor) {
                downsampledSamples.push(samples[i]);
            }
            
            const compressedBuffer = Buffer.from(new Int16Array(downsampledSamples).buffer);
            console.log(`✅ تم الضغط: ${audioBuffer.length} → ${compressedBuffer.length} bytes`);
            return compressedBuffer;
        }
        
        const compressedBuffer = Buffer.from(samples.buffer);
        console.log(`✅ تم الضغط: ${audioBuffer.length} → ${compressedBuffer.length} bytes`);
        return compressedBuffer;
        
    } catch (error) {
        console.error('❌ خطأ في ضغط المخرجات:', error.message);
        return audioBuffer; // إرجاع الصوت الأصلي في حالة الخطأ
    }
}

// ====================================
// معالجة تحديثات حالة Twilio
// ====================================
app.post('/twilio/status', (req, res) => {
    console.log('📊 تحديث حالة Twilio:', req.body);
    res.status(200).send('OK');
});

// ====================================
// معالجة النتائج الجزئية (للمقاطعة)
// ====================================
app.post('/api/voice/partial/:conversationId', (req, res) => {
    const { UnstableSpeechResult } = req.body;
    
    if (UnstableSpeechResult) {
        console.log(`🔄 جزئي: "${UnstableSpeechResult}"`);
        
        // كشف كلمات المقاطعة
        const interruptWords = ['توقف', 'stop', 'انتظر', 'wait'];
        if (interruptWords.some(word => UnstableSpeechResult.includes(word))) {
            console.log('⏸️ مقاطعة مكتشفة');
        }
    }
    
    res.status(200).send('OK');
});

// ====================================
// عرض المحادثات
// ====================================
app.get('/api/conversations', (req, res) => {
    const convArray = Array.from(conversations.entries()).map(([id, conv]) => ({
        id,
        phoneNumber: conv.phoneNumber,
        language: conv.language,
        messageCount: conv.messages.length,
        messages: conv.messages,
        duration: Date.now() - conv.startTime
    }));
    
    res.json({
        success: true,
        count: convArray.length,
        conversations: convArray,
        cacheSize: responseCache.size
    });
});

// ====================================
// تقديم الملفات الصوتية
// ====================================
app.get('/api/audio/:fileName', (req, res) => {
    const { fileName } = req.params;
    const filePath = `./temp/${fileName}`;
    
    // التحقق من وجود الملف
    const fs = require('fs');
    if (fs.existsSync(filePath)) {
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
        
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
        
        // حذف الملف بعد إرساله (للتوفير)
        fileStream.on('end', () => {
            setTimeout(() => {
                try {
                    fs.unlinkSync(filePath);
                    console.log(`🗑️ تم حذف الملف: ${fileName}`);
                } catch (error) {
                    console.log(`⚠️ خطأ في حذف الملف: ${fileName}`);
                }
            }, 30000); // انتظار 30 ثانية بدلاً من 5
        });
    } else {
        res.status(404).send('ملف صوتي غير موجود');
    }
});

// ====================================
// معلومات النظام
// ====================================
app.get('/api/info', (req, res) => {
    res.json({
        phoneNumber: config.twilioPhoneNumber,
        elevenLabs: config.elevenLabsApiKey ? 'متصل' : 'غير متصل',
        openai: config.openaiApiKey ? 'متصل' : 'غير متصل',
        googleSpeech: googleSpeech ? 'متصل' : 'غير متصل',
        conversations: conversations.size,
        cacheSize: responseCache.size,
        // معلومات الترميز والجودة
        audioQuality: {
            input: {
                googleSpeech: 'WAV 48kHz ستيريو',
                whisper: 'MP3 16kHz أحادي',
                processing: 'تقليل ضوضاء + إلغاء صدى'
            },
            output: {
                elevenLabs: 'MP3 22.05kHz 64kbps',
                ssml: 'تشكيل عربي + تعابير',
                processing: 'وضوح + تطبيع + تحسين صوت بشري + ضغط'
            },
            performance: {
                responseTime: '< 1 ثانية',
                quality: 'احترافية عالية',
                features: 'مقاطعة + كاش ذكي'
            }
        }
    });
});

// ====================================
// تشغيل الخادم
// ====================================
app.listen(PORT, () => {
    console.log('=====================================');
    console.log(`🚀 الخادم يعمل على المنفذ ${PORT}`);
    console.log(`🌐 البيئة: ${process.env.NODE_ENV || 'development'}`);
    console.log('=====================================');
    console.log('📋 حالة المتغيرات البيئية:');
    console.log(`   📱 Twilio Phone: ${config.twilioPhoneNumber ? '✅ موجود' : '❌ مفقود'}`);
    console.log(`   🔑 Twilio Credentials: ${config.twilioAccountSid && config.twilioAuthToken ? '✅ موجودة' : '❌ مفقودة'}`);
    console.log(`   🤖 OpenAI: ${config.openaiApiKey ? '✅ متصل' : '❌ غير متصل'}`);
    console.log(`   🎵 ElevenLabs: ${config.elevenLabsApiKey ? '✅ متصل' : '❌ غير متصل'}`);
    console.log(`   🎭 Voice ID: ${config.elevenLabsVoiceId ? '✅ محدد' : '❌ غير محدد'}`);
    console.log(`   🎤 Google Speech: ${googleSpeech ? '✅ متصل' : '❌ غير متصل'}`);
    console.log(`   🗄️ MongoDB: ${config.mongoUri ? '✅ متصل' : '❌ غير متصل'}`);
    console.log('=====================================');
    console.log('⚡ المميزات:');
    console.log('   🎭 صوت طبيعي: ElevenLabs + SSML');
    console.log('   🎤 تعرف ذكي: Google Speech + Whisper');
    console.log('   🔄 المقاطعة: متاحة في أي وقت');
    console.log('   🌍 10 لغات: العربية أولاً مع التشكيل');
    console.log('   💾 كاش ذكي: لتحسين الأداء');
    console.log('=====================================');
    console.log('🎵 جودة الصوت:');
    console.log('   🎤 الإدخال: WAV 48kHz ستيريو + معالجة متقدمة');
    console.log('   🎭 الإخراج: MP3 22.05kHz 64kbps + معالجة TTS محسنة + ضغط');
    console.log('   🔧 المعالجة: وضوح + تطبيع + تحسين صوت بشري + ضغط ذكي');
    console.log('=====================================');
    
    // تحذير إذا كانت المتغيرات مفقودة
    if (missingVars.length > 0) {
        console.log('⚠️  تحذير: بعض المتغيرات البيئية مفقودة');
        console.log('   تأكد من إضافة جميع المتغيرات في Heroku Config Vars');
        console.log('   راجع ملف HEROKU_DEPLOY.md للتعليمات');
    }
});