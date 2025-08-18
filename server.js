const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const twilio = require('twilio');
const OpenAI = require('openai');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
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

// التحقق من وجود OpenAI API Key
if (!config.openaiApiKey) {
    console.error('⚠️ تحذير: OPENAI_API_KEY غير موجود!');
    console.log('الرجاء إضافته: heroku config:set OPENAI_API_KEY="sk-xxx"');
} else {
    console.log('✅ OpenAI API Key موجود');
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// إعداد OpenAI مع معالجة الأخطاء
let openai = null;
if (config.openaiApiKey) {
    try {
        openai = new OpenAI({ 
            apiKey: config.openaiApiKey,
            maxRetries: 3
        });
        console.log('✅ OpenAI تم تهيئته بنجاح');
    } catch (error) {
        console.error('❌ خطأ في تهيئة OpenAI:', error.message);
    }
}

// تخزين المحادثات
const conversations = new Map();
const userProfiles = new Map();

// MongoDB اختياري
if (config.mongoUri && config.mongoUri !== 'mongodb://localhost:27017/aivoice') {
    mongoose.connect(config.mongoUri, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    }).then(() => {
        console.log('✅ MongoDB متصل');
    }).catch(err => {
        console.log('⚠️ MongoDB غير متصل:', err.message);
    });
}

// الصفحة الرئيسية محسّنة
app.get('/', (req, res) => {
    const hasOpenAI = !!openai;
    const openAIStatus = hasOpenAI ? 
        '<span style="color: #4CAF50;">✅ متصل - الذكاء الاصطناعي يعمل</span>' : 
        '<span style="color: #f44336;">❌ غير متصل - استخدام الردود الافتراضية</span>';
    
    res.send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>منصة AI الصوتية</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
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
                    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                }
                h1 { 
                    font-size: 2.5em; 
                    margin-bottom: 20px;
                    background: linear-gradient(to right, #FFD700, #FFA500);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                }
                .status-box {
                    background: rgba(255,255,255,0.2);
                    padding: 20px;
                    border-radius: 15px;
                    margin: 20px 0;
                }
                .phone-number {
                    font-size: 2em;
                    color: #FFD700;
                    margin: 20px 0;
                    padding: 20px;
                    background: rgba(0,0,0,0.3);
                    border-radius: 15px;
                    font-weight: bold;
                    letter-spacing: 2px;
                }
                .instructions {
                    text-align: right;
                    background: rgba(0,0,0,0.2);
                    padding: 25px;
                    border-radius: 15px;
                    margin-top: 30px;
                }
                .instructions h3 {
                    color: #FFD700;
                    margin-bottom: 15px;
                    font-size: 1.3em;
                }
                .instructions ul {
                    list-style: none;
                    padding: 0;
                }
                .instructions li {
                    margin: 10px 0;
                    padding-right: 25px;
                    position: relative;
                }
                .instructions li:before {
                    content: "✓";
                    position: absolute;
                    right: 0;
                    color: #4CAF50;
                    font-weight: bold;
                }
                .test-phrases {
                    background: rgba(255,255,255,0.1);
                    padding: 20px;
                    border-radius: 15px;
                    margin-top: 20px;
                }
                .phrase {
                    display: inline-block;
                    background: rgba(255,255,255,0.2);
                    padding: 8px 15px;
                    border-radius: 20px;
                    margin: 5px;
                    font-size: 1.1em;
                }
                .ar { direction: rtl; }
                .en { direction: ltr; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🤖 منصة الذكاء الاصطناعي الصوتية</h1>
                
                <div class="status-box">
                    <h3>حالة النظام</h3>
                    <p><strong>OpenAI:</strong> ${openAIStatus}</p>
                    <p><strong>Twilio:</strong> ${config.twilioAccountSid ? '✅ متصل' : '❌ غير متصل'}</p>
                    <p><strong>المحادثات النشطة:</strong> ${conversations.size}</p>
                </div>
                
                <div class="phone-number">
                    📞 ${config.twilioPhoneNumber || '+1 570 525 5521'}
                </div>
                
                <div class="instructions">
                    <h3>تعليمات الاستخدام ${hasOpenAI ? '(مع الذكاء الاصطناعي)' : '(بدون AI)'}</h3>
                    <ul>
                        <li>اتصل على الرقم أعلاه</li>
                        <li>انتظر رسالة الترحيب</li>
                        <li>${hasOpenAI ? 'تحدث بالعربية أو الإنجليزية بحرية' : 'استخدم الكلمات المفتاحية أدناه'}</li>
                        <li>انتظر الرد (قد يستغرق 2-3 ثواني)</li>
                        <li>قل "مع السلامة" أو "Goodbye" للإنهاء</li>
                    </ul>
                </div>
                
                <div class="test-phrases">
                    <h3>جمل للتجربة:</h3>
                    <div class="ar">
                        <span class="phrase">مرحبا</span>
                        <span class="phrase">أريد حجز موعد</span>
                        <span class="phrase">كم السعر</span>
                        <span class="phrase">أين موقعكم</span>
                    </div>
                    <div class="en">
                        <span class="phrase">Hello</span>
                        <span class="phrase">I need appointment</span>
                        <span class="phrase">What's the price</span>
                        <span class="phrase">Tell me a joke</span>
                    </div>
                </div>
            </div>
        </body>
        </html>
    `);
});

// فحص صحة النظام
app.get('/health', async (req, res) => {
    let openaiStatus = false;
    let openaiError = null;
    
    // اختبار OpenAI
    if (openai) {
        try {
            const test = await openai.chat.completions.create({
                model: "gpt-5-mini",
                messages: [{ role: "user", content: "test" }],
                max_tokens: 5
            });
            openaiStatus = true;
        } catch (error) {
            openaiError = error.message;
        }
    }
    
    res.json({
        status: 'healthy',
        timestamp: new Date(),
        services: {
            mongodb: mongoose.connection.readyState === 1,
            twilio: !!config.twilioAccountSid,
            openai: openaiStatus,
            openaiError: openaiError
        },
        stats: {
            activeConversations: conversations.size,
            totalUsers: userProfiles.size
        }
    });
});

// ====================================
// استقبال المكالمات الواردة
// ====================================
app.post('/api/voice/incoming', async (req, res) => {
    console.log('📞 مكالمة واردة من:', req.body.From);
    
    try {
        const { From: phoneNumber, CallSid: callSid } = req.body;
        const conversationId = uuidv4();
        
        // إنشاء/تحديث ملف المستخدم
        if (!userProfiles.has(phoneNumber)) {
            userProfiles.set(phoneNumber, {
                phoneNumber,
                firstCall: new Date(),
                lastCall: new Date(),
                totalCalls: 1,
                preferredLanguage: null,
                history: []
            });
        } else {
            const profile = userProfiles.get(phoneNumber);
            profile.lastCall = new Date();
            profile.totalCalls++;
        }
        
        // حفظ المحادثة
        conversations.set(conversationId, {
            phoneNumber,
            callSid,
            startTime: new Date(),
            messages: [],
            language: null
        });

        const twiml = new twilio.twiml.VoiceResponse();
        
        // رسالة ترحيب قصيرة
        twiml.say({
            voice: 'Polly.Zeina',
            language: 'arb'
        }, 'أهلاً بك.');
        
        twiml.say({
            voice: 'Polly.Joanna',
            language: 'en-US'
        }, 'Welcome.');
        
        // تسجيل الصوت مباشرة (أفضل للعربية)
        twiml.record({
            action: `/api/voice/process-recording/${conversationId}`,
            method: 'POST',
            maxLength: 15,
            timeout: 3,
            playBeep: false,
            finishOnKey: '#',
            transcribe: false // سنستخدم Whisper بدلاً من Twilio
        });
        
        res.type('text/xml');
        res.send(twiml.toString());
        
    } catch (error) {
        console.error('❌ خطأ:', error);
        const twiml = new twilio.twiml.VoiceResponse();
        twiml.say({
            voice: 'Polly.Zeina',
            language: 'arb'
        }, 'عذراً، حدث خطأ.');
        res.type('text/xml');
        res.send(twiml.toString());
    }
});

// ====================================
// معالجة التسجيل باستخدام OpenAI Whisper
// ====================================
app.post('/api/voice/process-recording/:conversationId', async (req, res) => {
    const { conversationId } = req.params;
    const { RecordingUrl, RecordingSid } = req.body;
    
    console.log('🎙️ معالجة التسجيل:', RecordingUrl);
    
    const conversation = conversations.get(conversationId);
    if (!conversation) {
        console.error('المحادثة غير موجودة');
        return res.status(404).send('Conversation not found');
    }
    
    try {
        let transcribedText = '';
        let detectedLanguage = 'en';
        
        // استخدام OpenAI Whisper للتعرف على الكلام
        if (openai && RecordingUrl) {
            try {
                // تحميل الصوت من Twilio
                const audioResponse = await axios.get(RecordingUrl, {
                    responseType: 'arraybuffer',
                    auth: {
                        username: config.twilioAccountSid,
                        password: config.twilioAuthToken
                    }
                });
                
                // تحويل لـ File object لـ OpenAI
                const audioBuffer = Buffer.from(audioResponse.data);
                const audioFile = new File([audioBuffer], 'audio.mp3', { type: 'audio/mp3' });
                
                // استخدام Whisper للتعرف على الكلام
                console.log('🎯 استخدام OpenAI Whisper...');
                const transcription = await openai.audio.transcriptions.create({
                    file: audioFile,
                    model: "whisper-1",
                    language: "ar", // تجربة العربية أولاً
                    response_format: "verbose_json"
                });
                
                transcribedText = transcription.text;
                detectedLanguage = transcription.language || 'ar';
                
                console.log(`✅ Whisper نتيجة: "${transcribedText}" [${detectedLanguage}]`);
                
            } catch (whisperError) {
                console.error('❌ خطأ Whisper:', whisperError.message);
                
                // محاولة بديلة - استخدام النموذج للترجمة
                try {
                    const fallbackTranscription = await openai.audio.translations.create({
                        file: audioFile,
                        model: "whisper-1"
                    });
                    transcribedText = fallbackTranscription.text;
                    console.log(`✅ Whisper ترجمة: "${transcribedText}"`);
                } catch (translationError) {
                    console.error('❌ خطأ الترجمة:', translationError.message);
                }
            }
        }
        
        // إذا لم نحصل على نص، استخدم نص افتراضي
        if (!transcribedText || transcribedText.trim() === '') {
            transcribedText = conversation.messages.length === 0 ? 
                'مرحبا' : 'نعم';
        }
        
        // معالجة النص
        await processUserInput(
            conversationId, 
            transcribedText, 
            detectedLanguage, 
            res
        );
        
    } catch (error) {
        console.error('❌ خطأ في معالجة التسجيل:', error);
        
        const twiml = new twilio.twiml.VoiceResponse();
        twiml.say({
            voice: 'Polly.Zeina',
            language: 'arb'
        }, 'عذراً، لم أفهم. حاول مرة أخرى.');
        
        // حاول مرة أخرى
        twiml.record({
            action: `/api/voice/process-recording/${conversationId}`,
            method: 'POST',
            maxLength: 15,
            timeout: 3,
            playBeep: false
        });
        
        res.type('text/xml');
        res.send(twiml.toString());
    }
});

// ====================================
// معالجة الإدخال وتوليد الرد
// ====================================
async function processUserInput(conversationId, text, language, res) {
    const conversation = conversations.get(conversationId);
    if (!conversation) return;
    
    console.log(`💬 معالجة: "${text}" [${language}]`);
    
    // كشف اللغة
    const arabicPattern = /[\u0600-\u06FF\u0750-\u077F]/;
    const isArabic = language === 'ar' || 
                    arabicPattern.test(text) || 
                    ['مرحبا', 'السلام', 'موعد', 'سعر', 'شكرا'].some(w => text.includes(w));
    
    // تحديث لغة المحادثة
    conversation.language = isArabic ? 'ar' : 'en';
    
    // حفظ رسالة المستخدم
    conversation.messages.push({
        type: 'user',
        text: text,
        language: conversation.language,
        timestamp: new Date()
    });
    
    // كشف نية الإنهاء
    const endKeywords = [
        'مع السلامة', 'وداعا', 'باي', 'خلاص', 'شكرا لك',
        'goodbye', 'bye', 'thank you', 'thanks', 'no'
    ];
    
    const wantsToEnd = endKeywords.some(word => 
        text.toLowerCase().includes(word)
    );
    
    if (wantsToEnd) {
        const farewellText = isArabic ? 
            'شكراً لاتصالك. أتمنى لك يوماً سعيداً. مع السلامة!' :
            'Thank you for calling. Have a great day. Goodbye!';
        
        const twiml = new twilio.twiml.VoiceResponse();
        twiml.say({
            voice: isArabic ? 'Polly.Zeina' : 'Polly.Joanna',
            language: isArabic ? 'arb' : 'en-US'
        }, farewellText);
        twiml.hangup();
        
        res.type('text/xml');
        res.send(twiml.toString());
        return;
    }
    
    // توليد رد ذكي باستخدام GPT
    let responseText = '';
    
    if (openai) {
        try {
            const systemPrompt = isArabic ? `
أنت مساعد ذكي في مركز خدمة عملاء. تحدث بالعربية الفصحى.
- رد بجملة أو جملتين قصيرتين فقط
- كن ودوداً ومحترماً
- للمواعيد: اقترح الأحد 10 صباحاً أو الإثنين 2 ظهراً
- للأسعار: الاستشارة بـ 100 ريال
- للموقع: شارع الملك فهد، مبنى 123
- إذا سُئلت عن شيء لا تعرفه، قل أنك ستحول للموظف المختص
            ` : `
You are a helpful customer service assistant. Be friendly and professional.
- Keep responses to 1-2 short sentences
- For appointments: Sunday 10 AM or Monday 2 PM
- For prices: Consultation is 100 SAR
- For location: King Fahd Street, Building 123
- If asked something you don't know, say you'll transfer to a specialist
            `;
            
            console.log('🤖 استخدام GPT-3.5...');
            const completion = await openai.chat.completions.create({
                model: "gpt-5-mini",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: text }
                ],
                max_tokens: 80,
                temperature: 0.7
            });
            
            responseText = completion.choices[0].message.content;
            console.log(`✅ GPT رد: "${responseText}"`);
            
        } catch (gptError) {
            console.error('❌ خطأ GPT:', gptError.message);
            responseText = generateFallbackResponse(text, isArabic);
        }
    } else {
        responseText = generateFallbackResponse(text, isArabic);
    }
    
    // حفظ الرد
    conversation.messages.push({
        type: 'assistant',
        text: responseText,
        timestamp: new Date()
    });
    
    // إنشاء رد TwiML
    const twiml = new twilio.twiml.VoiceResponse();
    
    // الرد الصوتي
    twiml.say({
        voice: isArabic ? 'Polly.Zeina' : 'Polly.Joanna',
        language: isArabic ? 'arb' : 'en-US'
    }, responseText);
    
    // الاستماع للرد التالي
    twiml.pause({ length: 1 });
    
    twiml.say({
        voice: isArabic ? 'Polly.Zeina' : 'Polly.Joanna',
        language: isArabic ? 'arb' : 'en-US'
    }, isArabic ? 'تفضل.' : 'Go ahead.');
    
    twiml.record({
        action: `/api/voice/process-recording/${conversationId}`,
        method: 'POST',
        maxLength: 15,
        timeout: 3,
        playBeep: false,
        finishOnKey: '#'
    });
    
    res.type('text/xml');
    res.send(twiml.toString());
}

// ====================================
// ردود احتياطية
// ====================================
function generateFallbackResponse(text, isArabic) {
    const input = text.toLowerCase();
    
    const responses = {
        ar: {
            'مرحبا': 'أهلاً وسهلاً! كيف يمكنني مساعدتك؟',
            'موعد': 'يمكنك الحجز يوم الأحد 10 صباحاً أو الإثنين 2 ظهراً.',
            'سعر': 'سعر الاستشارة 100 ريال.',
            'موقع': 'نحن في شارع الملك فهد، مبنى 123.',
            'default': 'نعم، كيف يمكنني مساعدتك؟'
        },
        en: {
            'hello': 'Hello! How can I help you?',
            'appointment': 'Available: Sunday 10 AM or Monday 2 PM.',
            'price': 'Consultation is 100 SAR.',
            'joke': 'Why don\'t scientists trust atoms? They make up everything!',
            'default': 'Yes, how can I help you?'
        }
    };
    
    const lang = isArabic ? responses.ar : responses.en;
    
    for (let key in lang) {
        if (key === 'default') continue;
        if (input.includes(key)) {
            return lang[key];
        }
    }
    
    return lang.default;
}

// ====================================
// عرض المحادثات للتحقق
// ====================================
app.get('/api/conversations', (req, res) => {
    const convArray = Array.from(conversations.entries()).map(([id, conv]) => ({
        id,
        phoneNumber: conv.phoneNumber,
        language: conv.language,
        messageCount: conv.messages.length,
        messages: conv.messages,
        startTime: conv.startTime
    }));
    
    res.json({
        success: true,
        openAI: !!openai,
        count: convArray.length,
        conversations: convArray
    });
});

// ====================================
// تشغيل الخادم
// ====================================
app.listen(PORT, () => {
    console.log('=====================================');
    console.log(`🚀 الخادم يعمل على المنفذ ${PORT}`);
    console.log(`📱 Twilio: ${config.twilioPhoneNumber || 'غير محدد'}`);
    console.log(`🤖 OpenAI: ${openai ? '✅ متصل بنجاح' : '❌ غير متصل'}`);
    if (openai) {
        console.log('✨ Whisper متاح للتعرف على العربية');
        console.log('✨ GPT-3.5 متاح للردود الذكية');
    }
    console.log('=====================================');
});