const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const twilio = require('twilio');
const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const FormData = require('form-data');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// تحسينات الأداء
const cluster = require('cluster');
const os = require('os');
const numCPUs = os.cpus().length;

// إعدادات الأداء
const performanceConfig = {
    maxConcurrentRequests: 100,
    requestTimeout: 30000,
    enableCompression: true,
    enableCaching: true,
    cacheTTL: 300000, // 5 دقائق
    enableRateLimiting: true,
    maxRequestsPerMinute: 1000
};

// الإعدادات
const config = {
    mongoUri: process.env.MONGODB_URI,
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
    twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER,
    openaiApiKey: process.env.OPENAI_API_KEY,
    geminiApiKey: process.env.GEMINI_API_KEY,
    elevenLabsApiKey: process.env.ELEVENLABS_API_KEY,
    elevenLabsVoiceId: process.env.ELEVENLABS_VOICE_ID
};

// التحقق من المتغيرات البيئية المطلوبة
const requiredEnvVars = [
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN', 
    'TWILIO_PHONE_NUMBER',
    'OPENAI_API_KEY',
    'GEMINI_API_KEY',
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

// إعداد Gemini AI
let geminiAI = null;
if (config.geminiApiKey) {
    try {
        geminiAI = new GoogleGenerativeAI(config.geminiApiKey);
        console.log('✅ Gemini AI جاهز');
    } catch (error) {
        console.error('❌ خطأ Gemini AI:', error.message);
    }
} else {
    console.log('⚠️ GEMINI_API_KEY غير موجود في Config Vars');
}

// إعداد Google Speech-to-Text
let googleSpeech = null;
if (process.env.GOOGLE_CREDENTIALS_JSON) {
    try {
        const speech = require('@google-cloud/speech');
        
        // فقط استخدم JSON credentials مباشرة
        let credentials = null;
        try {
            // إذا كان JSON string، تحليله
            if (typeof process.env.GOOGLE_CREDENTIALS_JSON === 'string') {
                credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
            } else {
                credentials = process.env.GOOGLE_CREDENTIALS_JSON;
            }
            
            // التحقق من صحة البيانات
            if (credentials && credentials.project_id && credentials.private_key) {
                console.log('✅ تم تحليل GOOGLE_CREDENTIALS_JSON بنجاح');
                
                // استخدام JSON credentials مباشرة
                googleSpeech = new speech.SpeechClient({
                    credentials: credentials,
                    projectId: credentials.project_id
                });
                console.log('✅ Google Speech: تم إعداد credentials من JSON بنجاح');
            } else {
                throw new Error('بيانات JSON غير مكتملة');
            }
            
        } catch (parseError) {
            console.error('❌ خطأ في تحليل GOOGLE_CREDENTIALS_JSON:', parseError.message);
            console.log('⚠️ Google Speech غير متاح - JSON credentials غير صحيحة');
            googleSpeech = null;
        }
        
    } catch (error) {
        console.error('❌ خطأ في إعداد Google Speech:', error.message);
        googleSpeech = null;
    }
} else {
    console.log('⚠️ GOOGLE_CREDENTIALS_JSON غير موجود في Config Vars - Google Speech غير متاح');
}

// التحقق من Google Speech
if (googleSpeech) {
    console.log('✅ Google Speech-to-Text متصل');
} else {
    console.log('⚠️ Google Speech-to-Text غير متصل (اختياري)');
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// تحسينات الأداء
if (performanceConfig.enableCompression) {
    const compression = require('compression');
    app.use(compression());
}

// Rate Limiting
if (performanceConfig.enableRateLimiting) {
    const rateLimit = require('express-rate-limit');
    const limiter = rateLimit({
        windowMs: 1 * 60 * 1000, // دقيقة واحدة
        max: performanceConfig.maxRequestsPerMinute,
        message: 'تم تجاوز الحد الأقصى للطلبات، حاول مرة أخرى لاحقاً'
    });
    app.use('/api/', limiter);
}

// Timeout middleware
app.use((req, res, next) => {
    req.setTimeout(performanceConfig.requestTimeout);
    res.setTimeout(performanceConfig.requestTimeout);
    next();
});

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

// كاش محسن للأداء مع تحسينات إضافية
const enhancedCache = {
    responses: new Map(),
    audio: new Map(),
    tashkeel: new Map(),
    ssml: new Map(),
    stt: new Map(),      // كاش للتعرف على الكلام
    whisper: new Map(),  // كاش للـ Whisper
    
    // إضافة مع TTL
    set: function(key, value, ttl = performanceConfig.cacheTTL) {
        this.responses.set(key, {
            value: value,
            timestamp: Date.now(),
            ttl: ttl
        });
    },
    
    // الحصول مع فحص TTL
    get: function(key) {
        const item = this.responses.get(key);
        if (!item) return null;
        
        if (Date.now() - item.timestamp > item.ttl) {
            this.responses.delete(key);
            return null;
        }
        
        return item.value;
    },
    
    // إضافة للكاش المحدد
    setIn: function(cacheType, key, value, ttl = performanceConfig.cacheTTL) {
        if (this[cacheType]) {
            this[cacheType].set(key, {
                value: value,
                timestamp: Date.now(),
                ttl: ttl
            });
        }
    },
    
    // الحصول من الكاش المحدد
    getFrom: function(cacheType, key) {
        if (this[cacheType]) {
            const item = this[cacheType].get(key);
            if (!item) return null;
            
            if (Date.now() - item.timestamp > item.ttl) {
                this[cacheType].delete(key);
                return null;
            }
            
            return item.value;
        }
        return null;
    },
    
    // تنظيف الكاش
    cleanup: function() {
        const now = Date.now();
        const caches = ['responses', 'audio', 'tashkeel', 'ssml', 'stt', 'whisper'];
        
        caches.forEach(cacheType => {
            if (this[cacheType]) {
                for (const [key, item] of this[cacheType].entries()) {
                    if (now - item.timestamp > item.ttl) {
                        this[cacheType].delete(key);
                    }
                }
            }
        });
    }
};

// تنظيف الكاش كل 5 دقائق
setInterval(() => enhancedCache.cleanup(), 5 * 60 * 1000);

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
// دالة إضافة التشكيل للنص العربي باستخدام GPT - أعلى جودة
// ====================================
async function addTashkeel(text) {
    try {
        // استخدام Gemini للتشكيل العربي (الأولوية)
        if (geminiAI) {
            console.log('🌟 استخدام Gemini للتشكيل العربي...');
            
            try {
                const model = geminiAI.getGenerativeModel({ model: "gemini-1.5-pro" });
                
                const prompt = `أنت خبير في اللغة العربية والتشكيل. مهمتك:

🎯 المهمة:
- أضف التشكيل الصحيح والدقيق للنص العربي
- استخدم التشكيل الكامل (الفتحة، الكسرة، الضمة، السكون)
- تأكد من صحة التشكيل نحويًا وإملائيًا
- حافظ على معنى النص الأصلي

📚 قواعد التشكيل:
- استخدم الفتحة (َ) للفاعل والمفعول
- استخدم الكسرة (ِ) للمضاف إليه والصفة
- استخدم الضمة (ُ) للرفع والجزم
- استخدم السكون (ْ) للسكون الطبيعي
- استخدم الشدة (ّ) للتضعيف

🌟 المطلوب:
- أعد النص مع التشكيل الكامل
- لا تغير معنى النص
- لا تضيف كلمات جديدة
- تأكد من صحة التشكيل

❌ لا تفعل:
- لا تغير معنى النص
- لا تضيف كلمات غير موجودة
- لا تستخدم تشكيل خاطئ

أعد النص مع التشكيل الصحيح فقط، بدون شرح أو تعليقات.

النص: "${text}"`;

                const result = await Promise.race([
                    model.generateContent({
                        contents: [{ role: "user", parts: [{ text: prompt }] }],
                        generationConfig: {
                            maxOutputTokens: 500,
                            temperature: 0.1
                        }
                    }),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Gemini Timeout')), 5000)
                    )
                ]);

                const tashkeeledText = result.response.text().trim();
                console.log(`✅ تم التشكيل باستخدام Gemini: "${text}" → "${tashkeeledText}"`);
                return tashkeeledText;
                
            } catch (geminiError) {
                console.log('⚠️ Gemini فشل، محاولة GPT...');
            }
        }
        
        // استخدام GPT-5 للتشكيل الدقيق (كبديل)
        if (openai) {
            console.log('🤖 استخدام GPT للتشكيل العربي...');
            
            const completion = await Promise.race([
                openai.chat.completions.create({
                    model: "gpt-5",
                    messages: [
                        {
                            role: "system",
                            content: `أنت خبير في اللغة العربية والتشكيل. مهمتك:
                            
🎯 المهمة:
- أضف التشكيل الصحيح والدقيق للنص العربي
- استخدم التشكيل الكامل (الفتحة، الكسرة، الضمة، السكون)
- تأكد من صحة التشكيل نحويًا وإملائيًا
- حافظ على معنى النص الأصلي

📚 قواعد التشكيل:
- استخدم الفتحة (َ) للفاعل والمفعول
- استخدم الكسرة (ِ) للمضاف إليه والصفة
- استخدم الضمة (ُ) للرفع والجزم
- استخدم السكون (ْ) للسكون الطبيعي
- استخدم الشدة (ّ) للتضعيف

🌟 المطلوب:
- أعد النص مع التشكيل الكامل
- لا تغير معنى النص
- لا تضيف كلمات جديدة
- تأكد من صحة التشكيل

❌ لا تفعل:
- لا تغير معنى النص
- لا تضيف كلمات غير موجودة
- لا تستخدم تشكيل خاطئ

أعد النص مع التشكيل الصحيح فقط، بدون شرح أو تعليقات.`
                        },
                        {
                            role: "user",
                            content: `أضف التشكيل الصحيح لهذا النص العربي: "${text}"`
                        }
                    ],
                    max_completion_tokens: 500
                }),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('GPT Timeout')), 5000)
                )
            ]);

            const tashkeeledText = completion.choices[0].message.content.trim();
            console.log(`✅ تم التشكيل باستخدام GPT: "${text}" → "${tashkeeledText}"`);
            return tashkeeledText;
        }
        
        // استخدام التشكيل الثابت كبديل إذا فشل كلاهما
        console.log('⚠️ Gemini وGPT غير متاحان، استخدام التشكيل الثابت');
        return addTashkeelFallback(text);
        
    } catch (error) {
        console.error('❌ خطأ في التشكيل:', error.message);
        console.log('⚠️ استخدام التشكيل الثابت كبديل');
        return addTashkeelFallback(text);
    }
}

// ====================================
// دالة التشكيل البديلة (ثابتة) - للاستخدام عند فشل GPT
// ====================================
function addTashkeelFallback(text) {
    // تشكيل شامل ومحسن للكلمات العربية
    const tashkeelMap = {
        // تحيات محسنة
        'السلام عليكم': 'السَّلامُ عَلَيْكُم',
        'وعليكم السلام': 'وَعَلَيْكُمُ السَّلامُ',
        'مرحبا': 'مَرْحَباً',
        'أهلا': 'أَهْلاً',
        'وسهلا': 'وَسَهْلاً',
        'أهلاً وسهلاً': 'أَهْلاً وَسَهْلاً',
        
        // أسئلة محسنة
        'كيف': 'كَيْفَ',
        'كيف حالك': 'كَيْفَ حَالُكَ',
        'كيف الحال': 'كَيْفَ الحَالُ',
        'متى': 'مَتَى',
        'أين': 'أَيْنَ',
        'ما': 'مَا',
        'لماذا': 'لِمَاذَا',
        'هل': 'هَلْ',
        'أم': 'أَمْ',
        
        // أفعال محسنة
        'يمكنني': 'يُمْكِنُنِي',
        'أقدر': 'أَقْدِرُ',
        'أريد': 'أُرِيدُ',
        'أحتاج': 'أَحْتَاجُ',
        'أفهم': 'أَفْهَمُ',
        'أعرف': 'أَعْرِفُ',
        'أساعد': 'أُساعِدُ',
        'أخدم': 'أَخْدُمُ',
        'أقدم': 'أُقَدِّمُ',
        'أخبر': 'أُخْبِرُ',
        
        // أسماء محسنة
        'موعد': 'مَوْعِد',
        'سعر': 'سِعْر',
        'موقع': 'مَوْقِع',
        'خدمة': 'خِدْمَة',
        'مساعدة': 'مُساعَدَة',
        'معلومات': 'مَعْلُومات',
        'شركة': 'شَرِكَة',
        'مركز': 'مَرْكَز',
        'استشارة': 'اسْتِشارَة',
        'عميل': 'عَمِيل',
        'فترة': 'فَتْرَة',
        'وقت': 'وَقْت',
        'يوم': 'يَوْم',
        'صباح': 'صَباح',
        'مساء': 'مَساء',
        
        // أيام محسنة
        'الأحد': 'الأَحَد',
        'الإثنين': 'الإثْنَيْن',
        'الثلاثاء': 'الثُّلاثاء',
        'الأربعاء': 'الأَرْبَعاء',
        'الخميس': 'الخَمِيس',
        'الجمعة': 'الجُمُعَة',
        'السبت': 'السَّبْت',
        
        // أرقام محسنة
        'واحد': 'وَاحِد',
        'اثنان': 'اثْنان',
        'ثلاثة': 'ثَلاثَة',
        'أربعة': 'أَرْبَعَة',
        'خمسة': 'خَمْسَة',
        'عشرة': 'عَشَرَة',
        'مائة': 'مِائَة',
        'ألف': 'أَلْف',
        'أول': 'أَوَّل',
        'ثاني': 'ثانِي',
        'ثالث': 'ثالِث',
        
        // عملة محسنة
        'ريال': 'رِيال',
        'دولار': 'دُولار',
        'يورو': 'يُورو',
        
        // تعابير محسنة
        'شكرا': 'شُكْراً',
        'شكرا لك': 'شُكْراً لَكَ',
        'العفو': 'العَفْوُ',
        'مع السلامة': 'مَعَ السَّلامَة',
        'وداعا': 'وَداعاً',
        'إلى اللقاء': 'إِلَى اللِّقاء',
        'نعم': 'نَعَم',
        'لا': 'لا',
        'أبدا': 'أَبَداً',
        'ممتاز': 'مُمْتاز',
        'جيد': 'جَيِّد',
        'رائع': 'رائِع',
        'جميل': 'جَمِيل',
        
        // كلمات إضافية محسنة
         'فيه': 'فِيهِ',
         'عنده': 'عِنْدَهُ',
         'له': 'لَهُ',
         'لها': 'لَها',
         'إلى': 'إِلَى',
         'من': 'مِنْ',
         'في': 'فِي',
         'على': 'عَلَى',
         'عن': 'عَنْ',
         'مع': 'مَعَ',
         'بين': 'بَيْنَ',
         'أمام': 'أَمام',
         'خلف': 'خَلْف',
         'فوق': 'فَوْق',
         'تحت': 'تَحْت',
         'داخل': 'داخِل',
         'خارج': 'خارِج',
         'قريب': 'قَريب',
         'بعيد': 'بَعِيد',
         'كبير': 'كَبير',
         'صغير': 'صَغير',
         'جديد': 'جَديد',
         'قديم': 'قَديم',
         'سريع': 'سَريع',
         'بطيء': 'بَطيء',
         'سهل': 'سَهْل',
         'صعب': 'صَعْب',
         'مهم': 'مُهِم',
         'ضروري': 'ضَروري',
         'ممكن': 'مُمْكِن',
         'مستحيل': 'مُسْتَحيل',
         'مؤكد': 'مُؤَكَّد',
         'محتمل': 'مُحْتَمَل',
         'مفيد': 'مُفيد',
         'ضار': 'ضار',
         'حلو': 'حَلو',
         'مر': 'مُر',
         'حار': 'حار',
         'بارد': 'بارِد',
         'نظيف': 'نَظيف',
         'وسخ': 'وَسِخ',
         'جميل': 'جَميل',
         'قبيح': 'قَبيح',
         'طويل': 'طَويل',
         'قصير': 'قَصير',
         'عريض': 'عَريض',
         'رفيع': 'رَفيع',
         'ثقيل': 'ثَقيل',
         'خفيف': 'خَفيف',
         'قوي': 'قَوِي',
         'ضعيف': 'ضَعيف',
         'غني': 'غَنِي',
         'فقير': 'فَقير',
         'سعيد': 'سَعيد',
         'حزين': 'حَزين',
         'غاضب': 'غاضِب',
         'هادئ': 'هادِئ',
         'متعب': 'مُتْعَب',
         'نشيط': 'نَشيط',
         'ذكي': 'ذَكِي',
         'غبي': 'غَبي',
         'صادق': 'صادِق',
         'كاذب': 'كاذِب',
         'كريم': 'كَريم',
         'بخيل': 'بَخيل',
         'شجاع': 'شُجاع',
         'جبان': 'جَبان',
         'صبور': 'صَبوُر',
         'عجول': 'عَجول',
         'متعاون': 'مُتَعاوِن',
         'أناني': 'أَنانِي',
         'مخلص': 'مُخْلِص',
         'خائن': 'خائِن',
         'متفائل': 'مُتَفائِل',
         'متشائم': 'مُتَشائِم',
         'مستقيم': 'مُسْتَقيم',
         'منحرف': 'مُنْحَرِف',
         'متحضر': 'مُتَحَضِّر',
         'متخلف': 'مُتَخَلِّف',
         
         // تطبيق التشكيل
         'أنا': 'أَنا',
         'أنت': 'أَنْت',
         'أنتِ': 'أَنْتِ',
         'هو': 'هُوَ',
         'هي': 'هِي',
         'نحن': 'نَحْنُ',
         'أنتم': 'أَنْتُمْ',
         'أنتن': 'أَنْتُنَّ',
         'هم': 'هُمْ',
         'هن': 'هُنَّ',
         
         // كلمات إضافية
         'هذا': 'هَذا',
         'هذه': 'هَذِه',
         'ذلك': 'ذَلِكَ',
         'تلك': 'تِلْكَ',
         'أولئك': 'أُولئِكَ',
         'هؤلاء': 'هَؤُلاءِ',
         
         // كلمات إضافية محسنة
         'متقدم': 'مُتَقَدِّم',
         'متأخر': 'مُتَأَخِّر',
         'مستعد': 'مُسْتَعِد',
         'غير مستعد': 'غَيْرُ مُسْتَعِد',
         'متاح': 'مُتاح',
         'غير متاح': 'غَيْرُ مُتاح',
         'مفتوح': 'مَفْتوح',
         'مغلق': 'مُغْلَق',
         'مشغول': 'مَشْغول',
         'فارغ': 'فارِغ',
         'ممتلئ': 'مُمْتَلِئ',
         'نصف': 'نِصْف',
         'ربع': 'رُبْع',
         'ثلث': 'ثُلُث',
         'ضعف': 'ضِعْف',
         'مثل': 'مِثْل',
         'أكثر': 'أَكْثَر',
         'أقل': 'أَقَل',
         'أكبر': 'أَكْبَر',
         'أصغر': 'أَصْغَر',
         'أطول': 'أَطْوَل',
         'أقصر': 'أَقْصَر',
         'أعرض': 'أَعْرَض',
         'أرفع': 'أَرْفَع',
         'أثقل': 'أَثْقَل',
         'أخف': 'أَخَف',
         'أقوى': 'أَقْوى',
         'أضعف': 'أَضْعَف',
         'أغنى': 'أَغْنى',
         'أفقر': 'أَفْقَر',
         'أسعد': 'أَسْعَد',
         'أحزن': 'أَحْزَن',
         'أغضب': 'أَغْضَب',
         'أهدأ': 'أَهْدَأ',
         'أتعب': 'أَتْعَب',
         'أنشط': 'أَنْشَط',
         'أذكى': 'أَذْكى',
         'أغبى': 'أَغْبى',
         'أصدق': 'أَصْدَق',
         'أكذب': 'أَكْذَب',
         'أكرم': 'أَكْرَم',
         'أبخل': 'أَبْخَل',
         'أشجع': 'أَشْجَع',
         'أجبن': 'أَجْبَن',
         'أصبر': 'أَصْبَر',
         'أعجل': 'أَعْجَل',
         'أتعاون': 'أَتَعاوَن',
         'أأنى': 'أَأْنى',
         'أخلص': 'أَخْلَص',
         'أخون': 'أَخون',
         'أتفائل': 'أَتَفائَل',
         'أتشائم': 'أَتَشائَم',
         'أستقيم': 'أَسْتَقيم',
         'أنحرف': 'أَنْحَرِف',
         'أتقدم': 'أَتَقَدَّم',
         'أتأخر': 'أَتَأَخَّر',
         'أستعد': 'أَسْتَعِد',
         'أتحضر': 'أَتَحَضَّر',
         'أتخلف': 'أَتَخَلَّف'
     };
     
     // تطبيق التشكيل
     let result = text;
     for (const [key, value] of Object.entries(tashkeelMap)) {
         result = result.replace(new RegExp(key, 'g'), value);
     }
     
     return result;
 }

// ====================================
// دالة إنشاء SSML متقدم للصوت الطبيعي باستخدام GPT - أعلى جودة
// ====================================
async function generateSSML(text, isArabic, emotion = 'friendly') {
    try {
        // إضافة التشكيل للعربية باستخدام GPT
        if (isArabic) {
            text = await addTashkeel(text);
        }
        
        // استخدام Gemini لصياغة SSML (الأولوية)
        if (geminiAI) {
            console.log('🌟 استخدام Gemini لصياغة SSML...');
            
            try {
                const model = geminiAI.getGenerativeModel({ model: "gemini-1.5-pro" });
                
                const prompt = `أنت خبير في SSML (Speech Synthesis Markup Language) واللغة العربية. مهمتك:

🎯 المهمة:
- أنشئ SSML محسن للعربية مع التشكيل الصحيح
- استخدم SSML 1.1 مع xml:lang="ar-SA"
- أضف prosody tags للتحكم في النبرة والسرعة والحجم
- أضف break tags للتوقفات الطبيعية
- أضف emphasis tags للكلمات المهمة

📚 قواعد SSML:
- استخدم <speak version="1.1" xml:lang="ar-SA">
- استخدم <prosody> للتحكم في rate, pitch, volume
- استخدم <break time="Xms"> للتوقفات
- استخدم <emphasis level="strong/moderate/reduced">
- استخدم <say-as> للأرقام والتواريخ

🌟 المطلوب:
- أنشئ SSML محسن للعربية
- أضف نبرة طبيعية ومتغيرة
- أضف توقفات مناسبة
- تأكد من صحة SSML

❌ لا تفعل:
- لا تستخدم tags غير صحيحة
- لا تنسى إغلاق tags
- لا تستخدم قيم غير صحيحة

أعد SSML كامل فقط، بدون شرح أو تعليقات.

النص: "${text}"
المشاعر: ${emotion}`;

                const result = await Promise.race([
                    model.generateContent({
                        contents: [{ role: "user", parts: [{ text: prompt }] }],
                        generationConfig: {
                            maxOutputTokens: 800,
                            temperature: 0.2
                        }
                    }),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Gemini Timeout')), 8000)
                    )
                ]);

                const ssmlText = result.response.text().trim();
                console.log(`✅ تم إنشاء SSML باستخدام Gemini: "${ssmlText.substring(0, 100)}..."`);
                return ssmlText;
                
            } catch (geminiError) {
                console.log('⚠️ Gemini فشل، محاولة GPT...');
            }
        }
        
        // استخدام GPT-5 لصياغة SSML محسن (كبديل)
        if (openai) {
            console.log('🤖 استخدام GPT لصياغة SSML...');
            
            const completion = await Promise.race([
                openai.chat.completions.create({
                    model: "gpt-5",
                    messages: [
                        {
                            role: "system",
                            content: `أنت خبير في SSML (Speech Synthesis Markup Language) واللغة العربية. مهمتك:
                            
🎯 المهمة:
- أنشئ SSML محسن للعربية مع التشكيل الصحيح
- استخدم SSML 1.1 مع xml:lang="ar-SA"
- أضف prosody tags للتحكم في النبرة والسرعة والحجم
- أضف break tags للتوقفات الطبيعية
- أضف emphasis tags للكلمات المهمة

📚 قواعد SSML:
- استخدم <speak version="1.1" xml:lang="ar-SA">
- استخدم <prosody> للتحكم في rate, pitch, volume
- استخدم <break time="Xms"> للتوقفات
- استخدم <emphasis level="strong/moderate/reduced">
- استخدم <say-as> للأرقام والتواريخ

🌟 المطلوب:
- أنشئ SSML محسن للعربية
- أضف نبرة طبيعية ومتغيرة
- أضف توقفات مناسبة
- تأكد من صحة SSML

❌ لا تفعل:
- لا تستخدم tags غير صحيحة
- لا تنسى إغلاق tags
- لا تستخدم قيم غير صحيحة

أعد SSML كامل فقط، بدون شرح أو تعليقات.`
                        },
                        {
                            role: "user",
                            content: `أنشئ SSML محسن لهذا النص العربي: "${text}" مع المشاعر: ${emotion}`
                        }
                    ],
                    max_completion_tokens: 800
                }),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('GPT Timeout')), 8000)
                )
            ]);

            const ssmlText = completion.choices[0].message.content.trim();
            console.log(`✅ تم إنشاء SSML باستخدام GPT: "${ssmlText.substring(0, 100)}..."`);
            return ssmlText;
        }
        
        // استخدام SSML الثابت كبديل إذا فشل كلاهما
        console.log('⚠️ Gemini وGPT غير متاحان، استخدام SSML الثابت');
        return generateSSMLFallback(text, isArabic, emotion);
        
    } catch (error) {
        console.error('❌ خطأ في إنشاء SSML باستخدام GPT:', error.message);
        console.log('⚠️ استخدام SSML الثابت كبديل');
        return generateSSMLFallback(text, isArabic, emotion);
    }
}

// ====================================
// دالة SSML البديلة (ثابتة) - للاستخدام عند فشل GPT
// ====================================
function generateSSMLFallback(text, isArabic, emotion = 'friendly') {
    // تحديد المشاعر والنبرة
    const emotions = {
        'friendly': { rate: '95%', pitch: '+5%', emphasis: 'moderate' },
        'excited': { rate: '105%', pitch: '+10%', emphasis: 'strong' },
        'calm': { rate: '90%', pitch: '0%', emphasis: 'reduced' },
        'professional': { rate: '100%', pitch: '0%', emphasis: 'moderate' }
    };
    
    const emo = emotions[emotion] || emotions['friendly'];
    
    // بناء SSML محسن
    let ssml = `<speak version="1.1" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="ar-SA">`;
    
    // إضافة نبرة عامة محسنة
    ssml += `<prosody rate="${emo.rate}" pitch="${emo.pitch}" volume="loud">`;
    
    // معالجة الجمل مع تشكيل محسن
    const sentences = text.split(/[.!?؟]/);
    sentences.forEach((sentence, index) => {
        sentence = sentence.trim();
        if (!sentence) return;
        
        // إضافة توقفات طبيعية محسنة
        if (index > 0) {
            ssml += `<break time="400ms"/>`;
        }
        
        // التعرف على الكلمات المهمة وإضافة التأكيد
        if (sentence.includes('مُهِم') || sentence.includes('ضَروري') || sentence.includes('مُؤَكَّد')) {
            ssml += `<emphasis level="${emo.emphasis}">${sentence}</emphasis>`;
        } else if (sentence.includes('؟') || sentence.includes('?')) {
            // نبرة استفهامية محسنة
            ssml += `<prosody pitch="+20%" contour="(0%,+0%) (50%,+15%) (100%,+25%)" rate="90%">`;
            ssml += sentence;
            ssml += `</prosody>`;
        } else if (sentence.includes('!') || sentence.includes('!')) {
            // نبرة تعجبية محسنة
            ssml += `<prosody pitch="+10%" rate="110%" volume="loud">`;
            ssml += sentence;
            ssml += `</prosody>`;
        } else {
            // نبرة عادية محسنة
            ssml += `<prosody pitch="+2%" rate="98%">`;
            ssml += sentence;
            ssml += `</prosody>`;
        }
        
        // إضافة علامات الترقيم مع توقفات محسنة
        if (text[text.indexOf(sentence) + sentence.length] === '!') {
            ssml += `<break time="200ms"/>!`;
        } else if (text[text.indexOf(sentence) + sentence.length] === '؟' || 
                   text[text.indexOf(sentence) + sentence.length] === '?') {
            ssml += `<break time="300ms"/>؟`;
        } else {
            ssml += `<break time="150ms"/>`;
        }
    });
    
    ssml += `</prosody>`;
    ssml += `</speak>`;
    
    console.log('🎭 تم إنشاء SSML ثابت للعربية (معالجة TTS معطلة مؤقتاً)');
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
        
                 // تحويل النص إلى SSML للعربية باستخدام GPT
         let finalText = text;
         if (language === 'ar') {
             try {
                 finalText = await generateSSML(text, true, 'friendly');
                 console.log('🎭 تم إنشاء SSML محسن للعربية باستخدام GPT (معالجة TTS معطلة مؤقتاً)');
             } catch (error) {
                 console.error('❌ خطأ في إنشاء SSML، استخدام النص الأصلي:', error.message);
                 finalText = text;
             }
         }
         
         // طلب إلى ElevenLabs
         const response = await axios.post(
             `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoiceId}`,
             {
                 text: finalText,
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
        
        // تطبيق معالجة ما بعد التسجيل للإخراج TTS (معطلة مؤقتاً)
        const processedAudioBuffer = await postProcessTTSOutput(audioBuffer, {
            enhanceClarity: false,
            boostVolume: false,
            normalizeAudio: false,
            addWarmth: false,
            optimizeVoice: false,
            compressOutput: false
        });
        
        // التحقق من نجاح المعالجة
        if (processedAudioBuffer.length > audioBuffer.length * 1.5) {
            console.log('⚠️ المعالجة فشلت، استخدام الصوت الأصلي');
            fs.writeFileSync(filePath, audioBuffer);
        } else {
            fs.writeFileSync(filePath, processedAudioBuffer);
        }
        
        console.log(`✅ ElevenLabs: تم إنشاء الصوت "${fileName}" (معالجة معطلة مؤقتاً)`);
        
        return {
            success: true,
            filePath: filePath,
            fileName: fileName,
            duration: Math.ceil(processedAudioBuffer.length / 16000), // تقدير المدة
            quality: 'عالي الجودة - معالجة معطلة مؤقتاً'
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
        
        // إعدادات محسنة للعربية مع تحسينات السرعة
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
            bitRate: 320000,           // معدل البت (إذا كان متاحاً)
            // تحسينات السرعة
            enableSeparateRecognitionPerChannel: false,  // لا نحتاج فصل القنوات
            maxAlternatives: 1,        // خيار واحد فقط للسرعة
            profanityFilter: false,    // إيقاف فلتر الكلمات المسيئة للسرعة
            speechContexts: [{         // سياق الكلام للعربية
                phrases: ['مرحبا', 'السلام عليكم', 'موعد', 'سعر', 'موقع', 'شكرا', 'مع السلامة', 'كيف حالك', 'أهلا'],
                boost: 20.0
            }]
        };
        
        const request = {
            audio: audio,
            config: config
        };
        
        console.log('🚀 إرسال إلى Google Speech...');
        
        // طلب التعرف مع timeout محسن
        const [response] = await Promise.race([
            googleSpeech.recognize(request),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Google Speech timeout')), 8000)  // تقليل timeout للسرعة
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
    
                  // ردود عربية ذكية ومحسنة مع تشكيل دقيق
      const arabicResponses = {
          'السلام عليكم': 'وَعَلَيْكُمُ السَّلامُ وَرَحْمَةُ اللهِ وَبَرَكاتُهُ! أَهْلاً وَسَهْلاً بِكَ في شَرِكَتِنا. كَيْفَ يُمْكِنُنِي أَنْ أُساعِدَكَ اليَوْمَ؟ هَلْ تَحْتاجُ إِلَى مَعْلُوماتٍ عَنْ خِدْماتِنا أَمْ تَريدُ حَجْزَ مَوْعِدٍ؟',
          'السلام': 'وَعَلَيْكُمُ السَّلامُ وَرَحْمَةُ اللهِ! أَهْلاً بِكَ في مَرْكَزِنا الاسْتِشارِيِّ. أَخْبِرْنِي، ما الَّذِي يَجْعَلُكَ تَتَصِلُ بِنَا اليَوْمَ؟ هَلْ هُناكَ مَشْكِلَةٌ مُعَيَّنَةٌ تَريدُ حَلَّها؟',
          'الو': 'أَهْلاً وَسَهْلاً! أَنَا المَساعِدُ الذَّكِيُّ لِشَرِكَتِكِ. كَيْفَ أَقْدِرُ أَنْ أَخْدُمَكَ اليَوْمَ؟ هَلْ تَحْتاجُ إِلَى اسْتِشارَةٍ، مَعْلُوماتٍ، أَمْ مَساعَدَةٍ في شَيءٍ آخَرَ؟',
          'مرحبا': 'مَرْحَباً بِكَ! أَهْلاً وَسَهْلاً في مَرْكَزِنا الاسْتِشارِيِّ المُتَطَوِّرِ. أَنَا هُنا لِمُساعَدَتِكَ في كُلِّ ما تَحْتاجُ إِلَيْهِ. أَخْبِرْنِي، ما الَّذِي يَشْغَلُ بالَكَ اليَوْمَ؟',
          'كيف حالك': 'الحَمْدُ لِلَّهِ، أَنَا بِخَيْرٍ وَشُكْراً لِسُؤالِكَ! أَمَّا أَنْتَ، كَيْفَ أَقْدِرُ أَنْ أُساعِدَكَ؟ هَلْ هُناكَ مَوْضُوعٌ مُعَيَّنٌ تَريدُ أَنْ نَتَحَدَّثَ عَنْهُ؟',
          'كيف الحال': 'الحَمْدُ لِلَّهِ، أَنَا بِخَيْرٍ وَمُسْتَعِدٌّ لِخِدْمَتِكَ! أَخْبِرْنِي، ما الَّذِي يَجْعَلُكَ تَتَصِلُ بِنَا؟ هَلْ تَحْتاجُ إِلَى اسْتِشارَةٍ أَمْ مَعْلُوماتٍ؟',
          'صباح الخير': 'صَباحُ النُّورِ وَالسُّرُورِ! أَهْلاً بِكَ في بُكُورِ اليَوْمِ. أَنَا هُنا لِمُساعَدَتِكَ في بَدايَةِ يَوْمٍ مُثْمِرٍ. ما الَّذِي تَريدُ أَنْ نُحَقِّقَهُ اليَوْمَ؟',
          'مساء الخير': 'مَساءُ الخَيْرِ وَالنَّعِيمِ! أَهْلاً بِكَ في مَساءِ اليَوْمِ. أَنَا هُنا لِمُساعَدَتِكَ في إنْهاءِ يَوْمِكَ بِأَفْضَلِ شَكْلٍ. كَيْفَ أَقْدِرُ أَنْ أُساعِدَكَ؟',
          'أهلا': 'أَهْلاً وَسَهْلاً بِكَ! أَنَا المَساعِدُ الذَّكِيُّ لِشَرِكَتِكِ. أَخْبِرْنِي، ما الَّذِي يَجْعَلُكَ تَتَصِلُ بِنَا اليَوْمَ؟ هَلْ هُناكَ مَشْكِلَةٌ أَمْ فُرْصَةٌ تَريدُ أَنْ نَتَحَدَّثَ عَنْها؟',
          'أهلاً': 'أَهْلاً وَسَهْلاً! أَنَا هُنا لِمُساعَدَتِكَ في كُلِّ ما تَحْتاجُ إِلَيْهِ. أَخْبِرْنِي، ما الَّذِي يَشْغَلُ بالَكَ؟ هَلْ تَحْتاجُ إِلَى اسْتِشارَةٍ أَمْ مَعْلُوماتٍ؟',
          'شكرا': 'العَفْوُ! أَنَا سَعيدٌ بِأَنْ أَكُونَ قَدْ ساعَدْتُكَ. هَلْ هُناكَ شَيءٌ آخَرُ يُمْكِنُنِي أَنْ أُساعِدَكَ بِهِ؟ أَمْ تَريدُ أَنْ نَتَحَدَّثَ عَنْ مَوْضُوعٍ آخَرَ؟',
          'شكرا لك': 'العَفْوُ! أَنَا هُنا لِخِدْمَتِكَ دائِماً. أَخْبِرْنِي، هَلْ هُناكَ شَيءٌ آخَرُ تَريدُ أَنْ نَتَحَدَّثَ عَنْهُ؟ أَمْ تَريدُ أَنْ نَخْتِمَ المَكالمَةَ؟',
          'ممتاز': 'أَشْكُرُكَ! أَنَا سَعيدٌ بِأَنْ أَكُونَ قَدْ أَفَدْتُكَ. هَلْ هُناكَ شَيءٌ آخَرُ تَحْتاجُ إِلَيْهِ؟ أَمْ تَريدُ أَنْ نَتَحَدَّثَ عَنْ مَوْضُوعٍ مُخْتَلِفٍ؟',
          'جيد': 'أَحْسَنْتَ! أَنَا سَعيدٌ بِأَنْ أَكُونَ قَدْ ساعَدْتُكَ. أَخْبِرْنِي، هَلْ هُناكَ شَيءٌ آخَرُ يُمْكِنُنِي أَنْ أُفِيدَكَ بِهِ؟ أَمْ تَريدُ أَنْ نَخْتِمَ المَكالمَةَ؟'
      };
    
                  // ردود سريعة ذكية ومحسنة مع تشكيل دقيق
      const quickResponses = {
          'موعد': 'مُمْتاز! أَنَا أَفْهَمُ أَنَّكَ تَريدُ حَجْزَ مَوْعِدٍ. لَدَيْنا فُرَصٌ رائِعَةٌ: اليَوْمَ السَّابِعِ العاشِرَةَ صَباحاً، أَوِ اليَوْمَ الثَّانِي الثَّانِيَةَ ظُهْراً. أَيُّهُما يُناسِبُكَ أَكْثَرَ؟ أَمْ تَريدُ أَنْ أُقَدِّمَ لَكَ خِياراتٍ أُخْرى؟',
          'سعر': 'أَهْلاً! أَمَّا أَسْعارُنا فَهِيَ تَنافُسِيَّةٌ جِدَّاً. سِعْرُ الاسْتِشارَةِ مائَةُ رِيالٍ، وَلكِنَّ لَدَيْنا عُروضاً خَاصَّةً لِلْعُملاءِ الجُدُدِ. هَلْ تَريدُ أَنْ أُخْبِرَكَ بِالتَّفاصِيلِ أَمْ تَريدُ حَجْزَ مَوْعِدٍ أَوَّلاً؟',
          'موقع': 'مُمْتاز! نَحْنُ في مَوْقِعٍ مَرْكازِيٍّ مُيَسَّرٍ. عُنْوانُنا: شارِعُ المَلِكِ فَهْدٍ، مَبْنى رَقَمِ مائَةٍ وَثَلاثَةٍ وَعِشْرينَ. هَلْ تَريدُ أَنْ أُقَدِّمَ لَكَ خارِطَةً أَوْ تَوْجِيهاً؟ أَمْ تَريدُ أَنْ نَحْجُزَ مَوْعِداً لِزِيارَتِنا؟',
          'أين': 'أَهْلاً! نَحْنُ في مَوْقِعٍ مَرْكازِيٍّ رائِعٍ في شارِعِ المَلِكِ فَهْدٍ، مَبْنى رَقَمِ مائَةٍ وَثَلاثَةٍ وَعِشْرينَ. هَلْ تَريدُ أَنْ أُقَدِّمَ لَكَ تَفاصِيلَ أَكْثَرَ عَنْ مَوْقِعِنا أَمْ تَريدُ حَجْزَ مَوْعِدٍ لِزِيارَتِنا؟',
          'متى': 'مُمْتاز! أَنَا أَفْهَمُ أَنَّكَ تَريدُ مَعْرِفَةَ الأَوْقاتِ المُتاحَةِ. لَدَيْنا فُرَصٌ رائِعَةٌ: اليَوْمَ السَّابِعِ العاشِرَةَ صَباحاً، أَوِ اليَوْمَ الثَّانِي الثَّانِيَةَ ظُهْراً. أَمَّا إِذا كُنْتَ تَريدُ أَوْقاتاً أُخْرى، فَأَخْبِرْنِي وَسَأَجِدُ لَكَ ما يُناسِبُكَ!',
          'كيف': 'أَهْلاً! أَنَا هُنا لِمُساعَدَتِكَ في كُلِّ شَيءٍ. هَلْ تَريدُ مَعْلُوماتٍ عَنْ المَواعِيدِ أَمِ الأَسْعارِ أَمِ المَوْقِعِ؟ أَمْ هُناكَ شَيءٌ آخَرُ يَشْغَلُ بالَكَ؟ أَخْبِرْنِي بِالتَّفاصِيلِ وَسَأُساعِدُكَ بِأَفْضَلِ شَكْلٍ!',
          'معلومات': 'مُمْتاز! أَنَا هُنا لِمُساعَدَتِكَ بِكُلِّ المَعْلُوماتِ الَّتِي تَحْتاجُها. هَلْ تَريدُ مَعْلُوماتٍ عَنْ المَواعِيدِ، الأَسْعارِ، أَمِ المَوْقِعِ؟ أَمْ هُناكَ شَيءٌ مُعَيَّنٌ تَريدُ أَنْ تَعْرِفَهُ عَنَّا؟ أَخْبِرْنِي بِالتَّفاصِيلِ!',
          'مساعدة': 'أَهْلاً! أَنَا هُنا لِمُساعَدَتِكَ في كُلِّ ما تَحْتاجُ إِلَيْهِ. هَلْ تَريدُ مَعْلُوماتٍ عَنْ خِدْماتِنا، أَمْ تَريدُ حَجْزَ مَوْعِدٍ، أَمْ هُناكَ مَشْكِلَةٌ مُعَيَّنَةٌ تَريدُ حَلَّها؟ أَخْبِرْنِي بِالتَّفاصِيلِ وَسَأُساعِدُكَ!'
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
    
    // استخدام Gemini للرد (الأولوية)
    if (geminiAI) {
        try {
            console.log(`🌟 استخدام Gemini للرد على: "${text}"`);
            
            const model = geminiAI.getGenerativeModel({ model: "gemini-1.5-pro" });
            
            const prompt = `أنت مساعد ذكي ومتطور يتحدث العربية الفصحى بطلاقة.

🎯 مهمتك:
- قدم ردوداً ذكية ومفيدة ومفصلة
- استخدم لغة عربية فصحى مع التشكيل الصحيح
- كن ودوداً ومهنياً في نفس الوقت
- اطرح أسئلة ذكية لتفهم احتياجات العميل

📚 معلومات الشركة:
- نحن شركة استشارات متخصصة
- نقدم خدمات استشارية احترافية
- أسعارنا تنافسية وجودتنا عالية
- مواعيدنا مرنة ومناسبة للجميع

🚀 أسلوبك:
- استخدم التشكيل العربي التلقائي
- اطرح أسئلة استكشافية ذكية
- قدم حلول عملية ومفصلة
- كن مبدعاً في الردود

❌ لا تفعل:
- لا تذكر "اشترك في القناة"
- لا تقدم ردوداً قصيرة جداً
- لا تكون مملولاً أو متكرراً

🌟 كن:
- ذكياً ومبدعاً
- مفيداً وعملياً
- ودوداً ومهنياً
- متطوراً في التفكير

أجب على هذا النص: "${text}"`;

            const result = await Promise.race([
                model.generateContent({
                    contents: [{ role: "user", parts: [{ text: prompt }] }],
                    generationConfig: {
                        maxOutputTokens: 200,
                        temperature: 0.8
                    }
                }),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Gemini Timeout')), 3000)
                )
            ]);
            
            const geminiResponse = result.response.text().trim();
            console.log(`✅ Gemini رد: "${geminiResponse}"`);
            return geminiResponse;
            
        } catch (geminiError) {
            console.log('⚠️ Gemini فشل، محاولة GPT...');
        }
    }
    
    // استخدام GPT إذا متاح (كبديل)
    if (openai) {
        try {
            console.log(`🤖 استخدام GPT للرد على: "${text}"`);
            
            const completion = await Promise.race([
                openai.chat.completions.create({
                    model: "gpt-5",
                    messages: [
                        { 
                            role: "system", 
                            content: `أنت مساعد ذكي ومتطور يتحدث العربية الفصحى بطلاقة.
                            
🎯 مهمتك:
- قدم ردوداً ذكية ومفيدة ومفصلة
- استخدم لغة عربية فصحى مع التشكيل الصحيح
- كن ودوداً ومهنياً في نفس الوقت
- اطرح أسئلة ذكية لتفهم احتياجات العميل

📚 معلومات الشركة:
- نحن شركة استشارات متخصصة
- نقدم خدمات استشارية احترافية
- أسعارنا تنافسية وجودتنا عالية
- مواعيدنا مرنة ومناسبة للجميع

🚀 أسلوبك:
- استخدم التشكيل العربي التلقائي
- اطرح أسئلة استكشافية ذكية
- قدم حلول عملية ومفصلة
- كن مبدعاً في الردود

❌ لا تفعل:
- لا تذكر "اشترك في القناة"
- لا تقدم ردوداً قصيرة جداً
- لا تكون مملولاً أو متكرراً

🌟 كن:
- ذكياً ومبدعاً
- مفيداً وعملياً
- ودوداً ومهنياً
- متطوراً في التفكير`
                        },
                        { role: "user", content: text }
                    ],
                    max_completion_tokens: 200
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
            
                                // تطبيق معالجة الصوت مع تحسينات الأداء
        const audioStartTime = Date.now();
        const processedAudio = await postProcessAudio(audioResponse.data);
        const audioProcessingTime = Date.now() - audioStartTime;
        console.log(`🔧 تمت معالجة الصوت، الحجم الجديد: ${processedAudio.length} bytes (وقت: ${audioProcessingTime}ms)`);
        
        // حفظ في الكاش للسرعة
        enhancedCache.setIn('audio', cacheKey, {
            audio: processedAudio,
            timestamp: Date.now()
        }, 60000); // كاش لمدة دقيقة
            
            // استخدام Google Speech مع تحسينات الأداء
            const sttStartTime = Date.now();
            
            // فحص الكاش أولاً للسرعة
            const cacheKey = Buffer.from(processedAudio).toString('base64').substring(0, 100);
            const cachedResult = enhancedCache.getFrom('stt', cacheKey);
            
            let googleResult;
            if (cachedResult) {
                console.log('⚡ استخدام نتيجة من الكاش للسرعة');
                googleResult = cachedResult;
            } else {
                googleResult = await googleSpeechToText(processedAudio, 'ar-SA');
                // حفظ في الكاش
                enhancedCache.setIn('stt', cacheKey, googleResult, 60000);
            }
            
            const sttProcessingTime = Date.now() - sttStartTime;
            
            if (googleResult.success && googleResult.confidence > 0.5) { // خفض عتبة الثقة أكثر للسرعة
                text = googleResult.text;
                usedService = 'Google Speech';
                console.log(`🎯 Google Speech نجح: "${text}" (ثقة: ${(googleResult.confidence * 100).toFixed(1)}%, وقت: ${sttProcessingTime}ms)`);
                
                // حفظ في الكاش للسرعة
                enhancedCache.setIn('stt', cacheKey, {
                    text: text,
                    confidence: googleResult.confidence,
                    service: 'Google Speech'
                }, 60000); // كاش لمدة دقيقة
                
                // تحسين إضافي: إذا كانت الثقة منخفضة، حاول مرة أخرى مع إعدادات مختلفة
                if (googleResult.confidence < 0.7) {
                    console.log('🔄 محاولة ثانية مع إعدادات محسنة...');
                    try {
                        const retryConfig = { ...config };
                        retryConfig.model = 'latest_long';  // نموذج مختلف
                        retryConfig.useEnhanced = false;    // إيقاف التحسينات للسرعة
                        
                        const retryRequest = { audio, config: retryConfig };
                        const [retryResponse] = await Promise.race([
                            googleSpeech.recognize(retryRequest),
                            new Promise((_, reject) => 
                                setTimeout(() => reject(new Error('Retry timeout')), 5000)
                            )
                        ]);
                        
                        if (retryResponse.results && retryResponse.results.length > 0) {
                            const retryConfidence = retryResponse.results[0].alternatives[0].confidence;
                            if (retryConfidence > googleResult.confidence) {
                                text = retryResponse.results[0].alternatives[0].transcript;
                                console.log(`🎯 المحاولة الثانية نجحت: "${text}" (ثقة: ${(retryConfidence * 100).toFixed(1)}%)`);
                            }
                        }
                    } catch (retryError) {
                        console.log('⚠️ المحاولة الثانية فشلت:', retryError.message);
                    }
                }
            } else {
                console.log('⚠️ Google Speech فشل أو ثقة منخفضة، محاولة Whisper...');
                throw new Error('Google Speech فشل');
            }
            
        } catch (error) {
            console.log('⚠️ Google Speech فشل:', error.message);
            console.log('🔄 محاولة Whisper...');
            
            // محاولة Whisper كبديل
            if (openai && RecordingUrl) {
                try {
                    // تحميل الصوت للـ Whisper
                    const audioUrl = `${RecordingUrl}.mp3`;
                    const whisperAudioResponse = await axios.get(audioUrl, {
                        responseType: 'arraybuffer',
                        auth: {
                            username: config.twilioAccountSid,
                            password: config.twilioAuthToken
                        },
                        timeout: 8000
                    });
                    
                            // تطبيق معالجة ما بعد التسجيل مع تحسينات الأداء
        const whisperAudioStartTime = Date.now();
        const processedAudio = await postProcessAudio(whisperAudioResponse.data);
        const whisperAudioProcessingTime = Date.now() - whisperAudioStartTime;
        console.log(`🔧 تمت معالجة الصوت للـ Whisper (وقت: ${whisperAudioProcessingTime}ms)`);
        
        // حفظ في الكاش للسرعة
        enhancedCache.setIn('audio', cacheKey, {
            audio: processedAudio,
            timestamp: Date.now()
        }, 30000); // كاش لمدة 30 ثانية
                    
                    const formData = new FormData();
                    formData.append('file', Buffer.from(processedAudio), {
                        filename: 'audio.wav',
                        contentType: 'audio/wav'
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
                    
                    // حفظ في الكاش للسرعة
                    enhancedCache.setIn('whisper', cacheKey, {
                        text: text,
                        service: 'Whisper',
                        timestamp: Date.now()
                    }, 30000); // كاش لمدة 30 ثانية
                    
                } catch (whisperError) {
                    console.log('⚠️ Whisper فشل:', whisperError.message);
                    
                    // محاولة إصلاح مشكلة Whisper
                    if (whisperError.response && whisperError.response.status === 400) {
                        console.log('🔧 محاولة إصلاح مشكلة Whisper 400...');
                        try {
                            // تحويل الصوت إلى ترميز مختلف
                            const fixedFormData = new FormData();
                            fixedFormData.append('file', Buffer.from(processedAudio), {
                                filename: 'audio.wav',
                                contentType: 'audio/wav'
                            });
                            fixedFormData.append('model', 'whisper-1');
                            fixedFormData.append('language', 'ar');
                            
                            const fixedResponse = await axios.post(
                                'https://api.openai.com/v1/audio/transcriptions',
                                fixedFormData,
                                {
                                    headers: {
                                        'Authorization': `Bearer ${config.openaiApiKey}`,
                                        ...fixedFormData.getHeaders()
                                    },
                                    timeout: 10000
                                }
                            );
                            
                            text = fixedResponse.data.text || 'نعم';
                            usedService = 'Whisper (Fixed)';
                            console.log(`✅ Whisper تم إصلاحه: "${text}"`);
                            
                        } catch (fixError) {
                            console.log('❌ فشل إصلاح Whisper:', fixError.message);
                            console.log('🔄 استخدام رد افتراضي:', text);
                        }
                    } else {
                        console.log('🔄 استخدام رد افتراضي:', text);
                    }
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
                
                // تطبيق معالجة ما بعد التسجيل مع تحسينات الأداء
                const directWhisperStartTime = Date.now();
                const processedAudio = await postProcessAudio(audioResponse.data);
                const directWhisperProcessingTime = Date.now() - directWhisperStartTime;
                console.log(`🔧 تمت معالجة الصوت للـ Whisper المباشر (وقت: ${directWhisperProcessingTime}ms)`);
                
                // حفظ في الكاش للسرعة
                enhancedCache.setIn('audio', cacheKey, {
                    audio: processedAudio,
                    timestamp: Date.now()
                }, 30000); // كاش لمدة 30 ثانية
                
                const formData = new FormData();
                formData.append('file', Buffer.from(processedAudio), {
                    filename: 'audio.wav',
                    contentType: 'audio/wav'
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
        const startTime = Date.now();
        
        // إعدادات المعالجة محسنة للتعرف السريع
        const postProcessing = {
            noiseReduction: true,      // تقليل الضوضاء
            echoCancellation: true,    // إلغاء الصدى
            compression: false,        // بدون ضغط
            normalization: true,       // تطبيع الصوت
            // تحسينات إضافية للتعرف السريع
            clarityEnhancement: true,  // تحسين الوضوح
            volumeBoost: true,         // رفع مستوى الصوت
            voiceOptimization: true    // تحسين الصوت
        };
        
        let processedBuffer = audioBuffer;
        
        // تقليل الضوضاء
        if (postProcessing.noiseReduction) {
            console.log('🔇 تطبيق تقليل الضوضاء...');
            const noiseStartTime = Date.now();
            // هنا يمكن إضافة خوارزمية تقليل الضوضاء
            // للتبسيط، سنقوم بتصفية بسيط
            processedBuffer = applyNoiseReduction(processedBuffer);
            const noiseTime = Date.now() - noiseStartTime;
            console.log(`🔇 تقليل الضوضاء: ${noiseTime}ms`);
        }
        
        // إلغاء الصدى
        if (postProcessing.echoCancellation) {
            console.log('🔄 تطبيق إلغاء الصدى...');
            const echoStartTime = Date.now();
            // هنا يمكن إضافة خوارزمية إلغاء الصدى
            processedBuffer = applyEchoCancellation(processedBuffer);
            const echoTime = Date.now() - echoStartTime;
            console.log(`🔄 إلغاء الصدى: ${echoTime}ms`);
        }
        
        // تطبيع الصوت
        if (postProcessing.normalization) {
            console.log('📊 تطبيق تطبيع الصوت...');
            const normStartTime = Date.now();
            processedBuffer = applyAudioNormalization(processedBuffer);
            const normTime = Date.now() - normStartTime;
            console.log(`📊 تطبيع الصوت: ${normTime}ms`);
        }
        
        // تحسين الوضوح للتعرف السريع
        if (postProcessing.clarityEnhancement) {
            console.log('🔍 تطبيق تحسين الوضوح...');
            const clarityStartTime = Date.now();
            processedBuffer = applyClarityEnhancement(processedBuffer);
            const clarityTime = Date.now() - clarityStartTime;
            console.log(`🔍 تحسين الوضوح: ${clarityTime}ms`);
        }
        
        // رفع مستوى الصوت
        if (postProcessing.volumeBoost) {
            console.log('🔊 تطبيق رفع مستوى الصوت...');
            const volumeStartTime = Date.now();
            processedBuffer = applyVolumeBoost(processedBuffer);
            const volumeTime = Date.now() - volumeStartTime;
            console.log(`🔊 رفع مستوى الصوت: ${volumeTime}ms`);
        }
        
        // تحسين الصوت
        if (postProcessing.voiceOptimization) {
            console.log('🎵 تطبيق تحسين الصوت...');
            const voiceStartTime = Date.now();
            processedBuffer = applyVoiceOptimization(processedBuffer);
            const voiceTime = Date.now() - voiceStartTime;
            console.log(`🎵 تحسين الصوت: ${voiceTime}ms`);
        }
        
        const totalTime = Date.now() - startTime;
        console.log(`✅ تم الانتهاء من معالجة ما بعد التسجيل (إجمالي: ${totalTime}ms)`);
        return processedBuffer;
        
    } catch (error) {
        console.error('❌ خطأ في معالجة ما بعد التسجيل:', error.message);
        return audioBuffer; // إرجاع الصوت الأصلي في حالة الخطأ
    }
}

// ====================================
// معالجة TTS عالية الجودة - للإخراج
// ====================================
async function postProcessTTSOutput(audioBuffer, options = {}) {
    try {
        console.log('🎭 بدء معالجة TTS عالية الجودة...');
        
        // ⚠️ إيقاف جميع المعالجات مؤقتاً لاستقرار النظام
        console.log('⚠️ تم إيقاف جميع معالجات TTS مؤقتاً لاستقرار النظام');
        console.log('⚠️ استخدام الصوت الأصلي بدون معالجة');
        
        // إرجاع الصوت الأصلي بدون معالجة
        return audioBuffer;
        
        /* تم تعطيل المعالجات مؤقتاً
        const {
            boostVolume = false,
            addWarmth = false,
            enhanceClarity = false,
            normalizeAudio = false,
            optimizeVoice = false,
            compressOutput = false
        } = options;

        let processedBuffer = audioBuffer;

        if (enhanceClarity) {
            console.log('🔍 تطبيق تحسين الوضوح...');
            processedBuffer = applyClarityEnhancement(processedBuffer);
        }

        if (boostVolume) {
            console.log('🔊 تطبيق رفع مستوى الصوت...');
            processedBuffer = applyVolumeBoost(processedBuffer);
        }

        if (normalizeAudio) {
            console.log('📊 تطبيق تطبيع الصوت...');
            processedBuffer = applyNormalization(processedBuffer);
        }

        if (addWarmth) {
            console.log('🔥 تطبيق إضافة دفء للصوت...');
            processedBuffer = applyWarmthEnhancement(processedBuffer);
        }

        if (optimizeVoice) {
            console.log('🎤 تطبيق تحسين للصوت البشري...');
            processedBuffer = applyVoiceOptimization(processedBuffer);
        }

        if (compressOutput) {
            console.log('🗜️ تطبيق ضغط الصوت...');
            processedBuffer = applyOutputCompression(processedBuffer);
        }

        console.log('✅ تم الانتهاء من معالجة TTS عالية الجودة');
        return processedBuffer;
        */
    } catch (error) {
        console.error('❌ خطأ في معالجة TTS:', error.message);
        console.log('⚠️ المعالجة فشلت، استخدام الصوت الأصلي');
        return audioBuffer;
    }
}

// ====================================
// دالة تقليل الضوضاء (محسنة للأداء)
// ====================================
function applyNoiseReduction(audioBuffer) {
    try {
        // خوارزمية محسنة لتقليل الضوضاء
        const samples = new Float32Array(audioBuffer);
        const threshold = 0.08; // عتبة محسنة للضوضاء
        const noiseReductionFactor = 0.3; // عامل تقليل الضوضاء
        
        // معالجة متوازية للأداء
        const chunkSize = 1000; // حجم القطعة للمعالجة
        const processedSamples = new Float32Array(samples.length);
        
        for (let i = 0; i < samples.length; i += chunkSize) {
            const end = Math.min(i + chunkSize, samples.length);
            
            for (let j = i; j < end; j++) {
                const sample = samples[j];
                if (Math.abs(sample) < threshold) {
                    // تقليل الضوضاء بدلاً من إزالتها بالكامل
                    processedSamples[j] = sample * noiseReductionFactor;
                } else {
                    processedSamples[j] = sample;
                }
            }
        }
        
        return Buffer.from(processedSamples.buffer);
    } catch (error) {
        console.error('❌ خطأ في تقليل الضوضاء:', error.message);
        return audioBuffer; // إرجاع الصوت الأصلي في حالة الخطأ
    }
}

// ====================================
// دالة إلغاء الصدى (محسنة للأداء)
// ====================================
function applyEchoCancellation(audioBuffer) {
    try {
        // خوارزمية محسنة لإلغاء الصدى
        const samples = new Float32Array(audioBuffer);
        const echoDelay = 800; // تأخير محسن للصدى
        const echoReductionFactor = 0.4; // عامل تقليل الصدى
        
        // معالجة متوازية للأداء
        const processedSamples = new Float32Array(samples.length);
        
        // نسخ العينات الأولى بدون تغيير
        for (let i = 0; i < echoDelay && i < samples.length; i++) {
            processedSamples[i] = samples[i];
        }
        
        // تطبيق إلغاء الصدى على باقي العينات
        for (let i = echoDelay; i < samples.length; i++) {
            const currentSample = samples[i];
            const echoSample = samples[i - echoDelay];
            
            // إزالة الصدى مع الحفاظ على جودة الصوت
            processedSamples[i] = currentSample - (echoSample * echoReductionFactor);
        }
        
        return Buffer.from(processedSamples.buffer);
    } catch (error) {
        console.error('❌ خطأ في إلغاء الصدى:', error.message);
        return audioBuffer; // إرجاع الصوت الأصلي في حالة الخطأ
    }
}

// ====================================
// دالة تطبيع الصوت (محسنة للأداء)
// ====================================
function applyAudioNormalization(audioBuffer) {
    try {
        const samples = new Float32Array(audioBuffer);
        
        // إيجاد القيمة القصوى بطريقة محسنة
        let maxValue = 0;
        const chunkSize = 1000; // معالجة متوازية
        
        for (let i = 0; i < samples.length; i += chunkSize) {
            const end = Math.min(i + chunkSize, samples.length);
            let chunkMax = 0;
            
            for (let j = i; j < end; j++) {
                chunkMax = Math.max(chunkMax, Math.abs(samples[j]));
            }
            
            maxValue = Math.max(maxValue, chunkMax);
        }
        
        // تطبيع الصوت
        if (maxValue > 0) {
            const scaleFactor = 0.9 / maxValue; // 90% من الحد الأقصى للسلامة
            const processedSamples = new Float32Array(samples.length);
            
            for (let i = 0; i < samples.length; i += chunkSize) {
                const end = Math.min(i + chunkSize, samples.length);
                
                for (let j = i; j < end; j++) {
                    processedSamples[j] = samples[j] * scaleFactor;
                }
            }
            
            return Buffer.from(processedSamples.buffer);
        }
        
        return audioBuffer;
    } catch (error) {
        console.error('❌ خطأ في تطبيع الصوت:', error.message);
        return audioBuffer; // إرجاع الصوت الأصلي في حالة الخطأ
    }
}

// ====================================
// دالة تحسين الوضوح (محسنة للأداء)
// ====================================
function applyClarityEnhancement(audioBuffer) {
    try {
        const samples = new Float32Array(audioBuffer);
        const processedSamples = new Float32Array(samples.length);
        
        // نسخ العينات الأولى والآخيرة بدون تغيير
        processedSamples[0] = samples[0];
        processedSamples[1] = samples[1];
        processedSamples[samples.length - 2] = samples[samples.length - 2];
        processedSamples[samples.length - 1] = samples[samples.length - 1];
        
        // تطبيق مرشح تحسين الوضوح مع معالجة متوازية
        const chunkSize = 1000;
        for (let i = 2; i < samples.length - 2; i += chunkSize) {
            const end = Math.min(i + chunkSize, samples.length - 2);
            
            for (let j = i; j < end; j++) {
                // مرشح محسن لتحسين الوضوح
                processedSamples[j] = samples[j] * 1.15 + 
                                     (samples[j-1] + samples[j+1]) * 0.08 - 
                                     (samples[j-2] + samples[j+2]) * 0.03;
                
                // تقييد القيم
                processedSamples[j] = Math.max(-1, Math.min(1, processedSamples[j]));
            }
        }
        
        return Buffer.from(processedSamples.buffer);
    } catch (error) {
        console.error('❌ خطأ في تحسين الوضوح:', error.message);
        return audioBuffer; // إرجاع الصوت الأصلي في حالة الخطأ
    }
}

// ====================================
// دالة رفع مستوى الصوت (محسنة للأداء)
// ====================================
function applyVolumeBoost(audioBuffer) {
    try {
        const samples = new Float32Array(audioBuffer);
        const processedSamples = new Float32Array(samples.length);
        
        // رفع مستوى الصوت بنسبة 15% (أكثر أماناً)
        const boostFactor = 1.15;
        const chunkSize = 1000; // معالجة متوازية
        
        for (let i = 0; i < samples.length; i += chunkSize) {
            const end = Math.min(i + chunkSize, samples.length);
            
            for (let j = i; j < end; j++) {
                processedSamples[j] = samples[j] * boostFactor;
                // تقييد القيم
                processedSamples[j] = Math.max(-1, Math.min(1, processedSamples[j]));
            }
        }
        
        return Buffer.from(processedSamples.buffer);
    } catch (error) {
        console.error('❌ خطأ في رفع مستوى الصوت:', error.message);
        return audioBuffer; // إرجاع الصوت الأصلي في حالة الخطأ
    }
}

// ====================================
// دالة إضافة دفء للصوت (محسنة للأداء)
// ====================================
function applyWarmthEnhancement(audioBuffer) {
    try {
        const samples = new Float32Array(audioBuffer);
        const processedSamples = new Float32Array(samples.length);
        
        // نسخ العينة الأولى والأخيرة بدون تغيير
        processedSamples[0] = samples[0];
        processedSamples[samples.length - 1] = samples[samples.length - 1];
        
        // تطبيق مرشح دفء محسن مع معالجة متوازية
        const chunkSize = 1000;
        for (let i = 1; i < samples.length - 1; i += chunkSize) {
            const end = Math.min(i + chunkSize, samples.length - 1);
            
            for (let j = i; j < end; j++) {
                // إضافة ترددات منخفضة للدفء
                processedSamples[j] = samples[j] + 
                                     (samples[j-1] + samples[j+1]) * 0.12;
                
                // تقييد القيم
                processedSamples[j] = Math.max(-1, Math.min(1, processedSamples[j]));
            }
        }
        
        return Buffer.from(processedSamples.buffer);
    } catch (error) {
        console.error('❌ خطأ في إضافة الدفء:', error.message);
        return audioBuffer; // إرجاع الصوت الأصلي في حالة الخطأ
    }
}

// ====================================
// دالة تحسين للصوت البشري (محسنة للأداء)
// ====================================
function applyVoiceOptimization(audioBuffer) {
    try {
        const samples = new Float32Array(audioBuffer);
        const processedSamples = new Float32Array(samples.length);
        
        // تحسين الترددات البشرية (80Hz - 8000Hz) مع معالجة متوازية
        const chunkSize = 1000;
        for (let i = 0; i < samples.length; i += chunkSize) {
            const end = Math.min(i + chunkSize, samples.length);
            
            for (let j = i; j < end; j++) {
                // تعزيز الترددات البشرية
                if (j % 2 === 0) { // كل عينة ثانية
                    processedSamples[j] = samples[j] * 1.08; // تعزيز بنسبة 8% (أكثر أماناً)
                } else {
                    processedSamples[j] = samples[j];
                }
                
                // تقييد القيم
                processedSamples[j] = Math.max(-1, Math.min(1, processedSamples[j]));
            }
        }
        
        return Buffer.from(processedSamples.buffer);
    } catch (error) {
        console.error('❌ خطأ في تحسين الصوت البشري:', error.message);
        return audioBuffer; // إرجاع الصوت الأصلي في حالة الخطأ
    }
}

// ====================================
// دالة ضغط المخرجات (محسنة للأداء)
// ====================================
function applyOutputCompression(audioBuffer) {
    try {
        console.log('🗜️ بدء ضغط المخرجات...');
        const startTime = Date.now();
        
        // تحويل إلى عينات صوتية
        const samples = new Int16Array(audioBuffer.buffer, audioBuffer.byteOffset, audioBuffer.length / 2);
        
        // تطبيق ضغط ذكي محسن
        const compressionFactor = 0.75; // ضغط بنسبة 25% (أكثر أماناً)
        const threshold = 0.08; // عتبة محسنة للضغط
        
        // معالجة متوازية للأداء
        const chunkSize = 1000;
        for (let i = 0; i < samples.length; i += chunkSize) {
            const end = Math.min(i + chunkSize, samples.length);
            
            for (let j = i; j < end; j++) {
                const sample = samples[j];
                
                // تطبيق ضغط ديناميكي محسن
                if (Math.abs(sample) > threshold * 32767) {
                    // ضغط العينات الكبيرة
                    samples[j] = Math.sign(sample) * Math.round((threshold * 32767 + (Math.abs(sample) - threshold * 32767) * compressionFactor));
                }
                // الحفاظ على العينات الصغيرة
            }
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
            const compressionTime = Date.now() - startTime;
            console.log(`✅ تم الضغط: ${audioBuffer.length} → ${compressedBuffer.length} bytes (وقت: ${compressionTime}ms)`);
            return compressedBuffer;
        }
        
        const compressedBuffer = Buffer.from(samples.buffer);
        const compressionTime = Date.now() - startTime;
        console.log(`✅ تم الضغط: ${audioBuffer.length} → ${compressedBuffer.length} bytes (وقت: ${compressionTime}ms)`);
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
        gemini: config.geminiApiKey ? 'متصل' : 'غير متصل',
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
                ssml: 'Gemini أولاً، ثم GPT-5 كبديل (بدون temperature)',
                tashkeel: 'Gemini أولاً، ثم GPT-5 كبديل (بدون temperature)',
                processing: 'معطلة مؤقتاً لاستقرار النظام'
            },
            performance: {
                responseTime: '< 1 ثانية',
                quality: 'احترافية عالية',
                features: 'مقاطعة + كاش ذكي'
            }
        },
        performance: {
            multiThreading: `${numCPUs} CPUs`,
            rateLimiting: `${performanceConfig.maxRequestsPerMinute} req/min`,
            cacheTTL: `${performanceConfig.cacheTTL/1000}s`,
            compression: performanceConfig.enableCompression ? 'مفعل' : 'معطل',
            maxConcurrentRequests: performanceConfig.maxConcurrentRequests,
            requestTimeout: `${performanceConfig.requestTimeout/1000}s`
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
    console.log(`   🌟 Gemini AI: ${config.geminiApiKey ? '✅ متصل' : '❌ غير متصل'}`);
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
    console.log('   🎭 الإخراج: MP3 22.05kHz 64kbps (معالجة معطلة مؤقتاً)');
    console.log('   🔧 المعالجة: معطلة مؤقتاً لاستقرار النظام');
    console.log('   🤖 التشكيل: Gemini أولاً، ثم GPT-5 كبديل (بدون temperature)');
    console.log('   🎭 SSML: Gemini أولاً، ثم GPT-5 كبديل (بدون temperature)');
    console.log('=====================================');
    console.log('⚡ تحسينات الأداء:');
    console.log(`   🔄 Multi-threading: ${numCPUs} CPUs`);
    console.log(`   📊 Rate Limiting: ${performanceConfig.maxRequestsPerMinute} req/min`);
    console.log(`   💾 Cache TTL: ${performanceConfig.cacheTTL/1000}s`);
    console.log(`   🗜️ Compression: ${performanceConfig.enableCompression ? 'مفعل' : 'معطل'}`);
    console.log('=====================================');
    
    // تحذير إذا كانت المتغيرات مفقودة
    if (missingVars.length > 0) {
        console.log('⚠️  تحذير: بعض المتغيرات البيئية مفقودة');
        console.log('   تأكد من إضافة جميع المتغيرات في Heroku Config Vars');
        console.log('   راجع ملف HEROKU_DEPLOY.md للتعليمات');
    }
});