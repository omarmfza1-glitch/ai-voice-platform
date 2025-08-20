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
    mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/aivoice',
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
    twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER,
    openaiApiKey: process.env.OPENAI_API_KEY
};

// التحقق من OpenAI
if (!config.openaiApiKey) {
    console.error('⚠️ OPENAI_API_KEY غير موجود!');
} else {
    console.log('✅ OpenAI API Key موجود');
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
            </div>
        </body>
        </html>
    `);
});

// ====================================
// دالة إضافة التشكيل للنص العربي
// ====================================
function addTashkeel(text) {
    // تشكيل بسيط للكلمات الشائعة
    const tashkeelMap = {
        'مرحبا': 'مَرْحَباً',
        'السلام عليكم': 'السَّلامُ عَلَيْكُم',
        'كيف': 'كَيْفَ',
        'يمكنني': 'يُمْكِنُنِي',
        'مساعدتك': 'مُسَاعَدَتُكَ',
        'موعد': 'مَوْعِد',
        'الأحد': 'الأَحَد',
        'الإثنين': 'الإثْنَيْن',
        'ريال': 'رِيَال',
        'شكرا': 'شُكْراً',
        'مع السلامة': 'مَعَ السَّلامَة',
        'وداعا': 'وَدَاعاً',
        'نعم': 'نَعَم',
        'لا': 'لا',
        'صباح': 'صَبَاح',
        'مساء': 'مَسَاء',
        'الخير': 'الخَيْر',
        'أهلا': 'أَهْلاً',
        'وسهلا': 'وَسَهْلاً'
    };
    
    // استبدال الكلمات بنسخها المشكلة
    let tashkeelText = text;
    for (const [word, tashkeel] of Object.entries(tashkeelMap)) {
        tashkeelText = tashkeelText.replace(new RegExp(word, 'g'), tashkeel);
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
    
    // ترحيب سريع مع SSML
    const greeting = generateSSML('أهلاً وسهلاً. تفضل بالحديث', true, 'friendly');
    twiml.say({
        voice: 'Polly.Zeina',
        language: 'arb'
    }, greeting);
    
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
    
    console.log(`🎤 سماع: "${SpeechResult}"`);
    
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
// معالجة سريعة للإدخال مع كاش
// ====================================
async function processUserInputFast(conversationId, text, res) {
    const conversation = conversations.get(conversationId);
    if (!conversation) return;
    
    console.log(`⚡ معالجة سريعة: "${text}"`);
    
    // حفظ الرسالة
    conversation.messages.push({
        type: 'user',
        text: text,
        timestamp: Date.now()
    });
    
    // كشف الوداع بالعربية والإنجليزية
    const farewellWords = [
        'مع السلامة', 'مع السلامه', 'وداعا', 'وداع', 'باي', 'خلاص', 
        'انتهى', 'شكرا لك', 'شكرا', 'كفى', 'توقف',
        'goodbye', 'bye', 'thank you', 'thanks', 'stop', 'end'
    ];
    
    const inputLower = text.toLowerCase();
    const wantsToEnd = farewellWords.some(word => 
        inputLower.includes(word)
    );
    
    if (wantsToEnd) {
        // وداع سريع مع SSML
        const farewellSSML = generateSSML(
            'شكراً لك. أتمنى لك يوماً سعيداً. مع السلامة!', 
            true, 
            'friendly'
        );
        
        const twiml = new twilio.twiml.VoiceResponse();
        twiml.say({
            voice: 'Polly.Zeina',
            language: 'arb'
        }, farewellSSML);
        twiml.hangup();
        
        res.type('text/xml');
        res.send(twiml.toString());
        return;
    }
    
    // البحث في الكاش أولاً
    const cacheKey = text.substring(0, 50);
    let responseText = responseCache.get(cacheKey);
    
    if (!responseText) {
        // توليد رد جديد
        responseText = await generateSmartResponse(text);
        // حفظ في الكاش
        responseCache.set(cacheKey, responseText);
        // حذف الكاش القديم إذا كبر
        if (responseCache.size > 100) {
            const firstKey = responseCache.keys().next().value;
            responseCache.delete(firstKey);
        }
    }
    
    // حفظ الرد
    conversation.messages.push({
        type: 'assistant',
        text: responseText,
        timestamp: Date.now()
    });
    
    // إنشاء رد SSML
    const responseSSML = generateSSML(responseText, true, 'friendly');
    
    const twiml = new twilio.twiml.VoiceResponse();
    
    // الرد مع إمكانية المقاطعة
    const gather = twiml.gather({
        input: 'speech dtmf', // صوت أو أزرار
        language: 'ar-SA',
        speechTimeout: 'auto',
        timeout: 2,
        action: `/api/voice/process-speech/${conversationId}`,
        method: 'POST',
        bargein: true, // السماح بالمقاطعة
        bargeInWords: 'stop,توقف,مرحبا' // كلمات المقاطعة
    });
    
    gather.say({
        voice: 'Polly.Zeina',
        language: 'arb'
    }, responseSSML);
    
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
    
    // ردود سريعة للأسئلة الشائعة
    const quickResponses = {
        'مرحبا': 'أهلاً وسهلاً بك! كيف يمكنني خدمتك اليوم؟',
        'السلام': 'وعليكم السلام ورحمة الله! تفضل كيف أساعدك؟',
        'موعد': 'يمكنك الحجز يوم الأحد العاشرة صباحاً، أو الإثنين الثانية ظهراً. أيهما تفضل؟',
        'سعر': 'سعر الاستشارة مائة ريال. هل تريد حجز موعد؟',
        'موقع': 'نحن في شارع الملك فهد، مبنى رقم مائة وثلاثة وعشرين.',
        'صباح': 'صباح النور والسرور! كيف أقدر أساعدك؟',
        'مساء': 'مساء الخير! تفضل كيف أخدمك؟'
    };
    
    // بحث سريع عن رد جاهز
    for (const [key, response] of Object.entries(quickResponses)) {
        if (input.includes(key)) {
            return response;
        }
    }
    
    // استخدام GPT إذا متاح
    if (openai) {
        try {
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
                            أضف التشكيل للكلمات المهمة.`
                        },
                        { role: "user", content: text }
                    ],
                    max_completion_tokens: 60,
                    temperature: 0.7
                }),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Timeout')), 2000)
                )
            ]);
            
            return completion.choices[0].message.content;
            
        } catch (error) {
            console.log('⚠️ استخدام رد افتراضي');
        }
    }
    
    // رد افتراضي
    return 'نعم، أفهمك. كيف يمكنني المساعدة؟';
}

// ====================================
// معالجة التسجيل (احتياطي)
// ====================================
app.post('/api/voice/process-recording/:conversationId', async (req, res) => {
    const { conversationId } = req.params;
    const { RecordingUrl } = req.body;
    
    console.log('🎙️ تسجيل:', RecordingUrl);
    
    const conversation = conversations.get(conversationId);
    if (!conversation) {
        return res.status(404).send('Not found');
    }
    
    let text = 'نعم';
    
    // محاولة Whisper إذا متاح
    if (openai && RecordingUrl) {
        try {
            // تأخير صغير
            await new Promise(r => setTimeout(r, 500));
            
            const audioUrl = `${RecordingUrl}.mp3`;
            const audioResponse = await axios.get(audioUrl, {
                responseType: 'arraybuffer',
                auth: {
                    username: config.twilioAccountSid,
                    password: config.twilioAuthToken
                },
                timeout: 3000
            });
            
            const formData = new FormData();
            formData.append('file', Buffer.from(audioResponse.data), {
                filename: 'audio.mp3',
                contentType: 'audio/mpeg'
            });
            formData.append('model', 'whisper-1');
            formData.append('language', 'ar');
            formData.append('prompt', 'مرحبا، موعد، سعر، شكرا، مع السلامة');
            
            const whisperResponse = await axios.post(
                'https://api.openai.com/v1/audio/transcriptions',
                formData,
                {
                    headers: {
                        'Authorization': `Bearer ${config.openaiApiKey}`,
                        ...formData.getHeaders()
                    },
                    timeout: 3000
                }
            );
            
            text = whisperResponse.data.text || 'نعم';
            console.log(`✅ Whisper: "${text}"`);
            
        } catch (error) {
            console.log('⚠️ Whisper فشل، استخدام افتراضي');
        }
    }
    
    // معالجة سريعة
    await processUserInputFast(conversationId, text, res);
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
// تشغيل الخادم
// ====================================
app.listen(PORT, () => {
    console.log('=====================================');
    console.log(`🚀 الخادم يعمل على المنفذ ${PORT}`);
    console.log(`📱 Twilio: ${config.twilioPhoneNumber}`);
    console.log(`🤖 OpenAI: ${openai ? '✅ متصل' : '❌ غير متصل'}`);
    console.log('⚡ السرعة: محسّنة للأداء الفائق');
    console.log('🎭 SSML: مفعّل للصوت الطبيعي');
    console.log('🔄 المقاطعة: متاحة');
    console.log('🌍 العربية: دعم كامل مع التشكيل');
    console.log('=====================================');
});