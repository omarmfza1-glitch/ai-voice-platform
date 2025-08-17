const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const twilio = require('twilio');
const OpenAI = require('openai');
const { v4: uuidv4 } = require('uuid');
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

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// إعداد OpenAI
const openai = config.openaiApiKey ? 
    new OpenAI({ apiKey: config.openaiApiKey }) : null;

// تخزين المحادثات ومعلومات المستخدمين
const conversations = new Map();
const userLanguages = new Map(); // حفظ لغة كل مستخدم

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

// الصفحة الرئيسية
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>منصة الاتصال الصوتي AI</title>
            <style>
                body {
                    font-family: 'Segoe UI', Arial, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    color: white;
                    margin: 0;
                }
                .container {
                    text-align: center;
                    padding: 40px;
                    background: rgba(255,255,255,0.1);
                    border-radius: 20px;
                    backdrop-filter: blur(10px);
                    max-width: 600px;
                }
                h1 { 
                    font-size: 2.5em; 
                    margin-bottom: 20px;
                    text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
                }
                .emoji { font-size: 4em; margin: 20px 0; }
                .status { 
                    background: #4CAF50; 
                    padding: 10px 20px; 
                    border-radius: 25px; 
                    display: inline-block;
                    margin: 20px 0;
                    animation: pulse 2s infinite;
                }
                @keyframes pulse {
                    0% { box-shadow: 0 0 0 0 rgba(76, 175, 80, 0.7); }
                    70% { box-shadow: 0 0 0 10px rgba(76, 175, 80, 0); }
                    100% { box-shadow: 0 0 0 0 rgba(76, 175, 80, 0); }
                }
                .phone {
                    font-size: 1.5em;
                    margin: 20px 0;
                    padding: 20px;
                    background: rgba(255,255,255,0.2);
                    border-radius: 15px;
                    border: 2px solid rgba(255,255,255,0.3);
                }
                .features {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
                    gap: 15px;
                    margin: 30px 0;
                }
                .feature {
                    padding: 15px;
                    background: rgba(255,255,255,0.15);
                    border-radius: 10px;
                    transition: transform 0.3s;
                }
                .feature:hover {
                    transform: translateY(-5px);
                    background: rgba(255,255,255,0.25);
                }
                .stats {
                    margin-top: 30px;
                    padding: 20px;
                    background: rgba(0,0,0,0.2);
                    border-radius: 10px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="emoji">🤖📞</div>
                <h1>منصة الاتصال الصوتي بالذكاء الاصطناعي</h1>
                <div class="status">✅ النظام يعمل بكفاءة 100%</div>
                
                <div class="phone">
                    📞 اتصل على:<br>
                    <strong style="font-size: 1.2em; color: #FFD700;">
                        ${config.twilioPhoneNumber || '+1 570 525 5521'}
                    </strong>
                </div>
                
                <div class="features">
                    <div class="feature">
                        <div style="font-size: 2em;">🌍</div>
                        <div>9 لغات</div>
                    </div>
                    <div class="feature">
                        <div style="font-size: 2em;">⚡</div>
                        <div>رد فوري</div>
                    </div>
                    <div class="feature">
                        <div style="font-size: 2em;">🧠</div>
                        <div>ذكاء اصطناعي</div>
                    </div>
                    <div class="feature">
                        <div style="font-size: 2em;">💾</div>
                        <div>حفظ المحادثات</div>
                    </div>
                </div>
                
                <div class="stats">
                    <p>🕐 الوقت: ${new Date().toLocaleString('ar-SA')}</p>
                    <p>💬 المحادثات النشطة: ${conversations.size}</p>
                    <p>🔧 حالة الخدمات: OpenAI ${openai ? '✅' : '❌'} | MongoDB ${mongoose.connection.readyState === 1 ? '✅' : '❌'}</p>
                </div>
            </div>
        </body>
        </html>
    `);
});

// فحص صحة النظام
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date(),
        services: {
            mongodb: mongoose.connection.readyState === 1,
            twilio: !!config.twilioAccountSid,
            openai: !!config.openaiApiKey
        },
        stats: {
            activeConversations: conversations.size,
            totalUsers: userLanguages.size
        }
    });
});

// ====================================
// استقبال المكالمات - محسّن للعربية
// ====================================
app.post('/api/voice/incoming', async (req, res) => {
    console.log('📞 مكالمة واردة من:', req.body.From);
    
    try {
        const { From: phoneNumber, CallSid: callSid } = req.body;
        const conversationId = uuidv4();
        
        // حفظ المحادثة
        conversations.set(conversationId, {
            phoneNumber,
            callSid,
            startTime: new Date(),
            messages: [],
            language: userLanguages.get(phoneNumber) || 'ar' // افتراضي: العربية
        });

        const twiml = new twilio.twiml.VoiceResponse();
        
        // رسالة ترحيب ثنائية اللغة
        twiml.say({
            voice: 'Polly.Zeina',
            language: 'arb'
        }, 'أهلاً وسهلاً بك. يمكنك التحدث بالعربية أو الإنجليزية.');
        
        twiml.say({
            voice: 'Polly.Joanna',
            language: 'en-US'
        }, 'Welcome. You can speak in Arabic or English.');
        
        // الاستماع للمستخدم مع وقت انتظار أطول
        const gather = twiml.gather({
            input: 'speech',
            language: 'ar-SA en-US', // دعم اللغتين
            timeout: 5, // انتظار 5 ثواني
            speechTimeout: 3, // السماح بـ 3 ثواني صمت
            action: `/api/voice/process/${conversationId}`,
            method: 'POST',
            partialResultCallback: `/api/voice/partial/${conversationId}` // للكشف المبكر
        });
        
        gather.say({
            voice: 'Polly.Zeina',
            language: 'arb'
        }, 'كيف يمكنني مساعدتك اليوم؟');
        
        // في حالة عدم الرد
        twiml.redirect(`/api/voice/no-input/${conversationId}`);
        
        res.type('text/xml');
        res.send(twiml.toString());
        
    } catch (error) {
        console.error('❌ خطأ:', error);
        const twiml = new twilio.twiml.VoiceResponse();
        twiml.say({
            voice: 'Polly.Zeina',
            language: 'arb'
        }, 'عذراً، حدث خطأ. الرجاء الاتصال مرة أخرى.');
        res.type('text/xml');
        res.send(twiml.toString());
    }
});

// ====================================
// معالجة الكلام - محسّن مع دعم أفضل للعربية
// ====================================
app.post('/api/voice/process/:conversationId', async (req, res) => {
    const { conversationId } = req.params;
    const { SpeechResult, Language } = req.body;
    
    console.log(`🎤 استلام: "${SpeechResult}" [${Language}]`);
    
    try {
        const conversation = conversations.get(conversationId);
        if (!conversation) {
            throw new Error('المحادثة غير موجودة');
        }
        
        // تحديد اللغة المستخدمة
        const isArabic = Language?.includes('ar') || 
                         /[\u0600-\u06FF]/.test(SpeechResult) || // كشف الأحرف العربية
                         SpeechResult.includes('مرحبا') ||
                         SpeechResult.includes('السلام');
        
        // حفظ لغة المستخدم
        conversation.language = isArabic ? 'ar' : 'en';
        userLanguages.set(conversation.phoneNumber, conversation.language);
        
        // حفظ رسالة المستخدم
        conversation.messages.push({
            type: 'user',
            text: SpeechResult,
            language: conversation.language,
            timestamp: new Date()
        });
        
        // كشف نية إنهاء المحادثة
        const endKeywords = [
            'goodbye', 'bye', 'thank you', 'thanks', 'no thank',
            'مع السلامة', 'وداعا', 'شكرا', 'لا شكرا', 'انتهى', 'خلاص'
        ];
        
        const wantsToEnd = endKeywords.some(word => 
            SpeechResult.toLowerCase().includes(word.toLowerCase())
        );
        
        // توليد الرد
        let responseText = '';
        
        if (wantsToEnd) {
            // رسالة وداع
            responseText = isArabic ? 
                'شكراً لاتصالك. أتمنى لك يوماً سعيداً. مع السلامة!' :
                'Thank you for calling. Have a great day. Goodbye!';
                
            // إنشاء رد الوداع
            const twiml = new twilio.twiml.VoiceResponse();
            twiml.say({
                voice: isArabic ? 'Polly.Zeina' : 'Polly.Joanna',
                language: isArabic ? 'arb' : 'en-US'
            }, responseText);
            twiml.hangup(); // إنهاء المكالمة
            
            res.type('text/xml');
            res.send(twiml.toString());
            return;
        }
        
        // توليد رد ذكي
        if (openai && config.openaiApiKey) {
            try {
                const systemPrompt = isArabic ? 
                    "أنت مساعد ذكي ودود يتحدث العربية. رد بشكل طبيعي ومختصر. إذا سُئلت عن موعد، اقترح أوقات محددة. إذا سُئلت عن الأسعار، اذكر أرقام تقريبية. كن مفيداً وودوداً." :
                    "You are a helpful and friendly assistant. Keep responses brief and natural. If asked about appointments, suggest specific times. If asked about prices, give approximate numbers. Be helpful and friendly.";
                
                const completion = await openai.chat.completions.create({
                    model: "gpt-3.5-turbo",
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: SpeechResult }
                    ],
                    max_tokens: 100,
                    temperature: 0.7
                });
                
                responseText = completion.choices[0].message.content;
            } catch (aiError) {
                console.error('خطأ OpenAI:', aiError.message);
                responseText = generateSmartResponse(SpeechResult, isArabic);
            }
        } else {
            responseText = generateSmartResponse(SpeechResult, isArabic);
        }
        
        // حفظ الرد
        conversation.messages.push({
            type: 'assistant',
            text: responseText,
            timestamp: new Date()
        });
        
        // إنشاء رد TwiML
        const twiml = new twilio.twiml.VoiceResponse();
        
        // الرد بالصوت المناسب
        twiml.say({
            voice: isArabic ? 'Polly.Zeina' : 'Polly.Joanna',
            language: isArabic ? 'arb' : 'en-US'
        }, responseText);
        
        // الاستماع للرد التالي
        const gather = twiml.gather({
            input: 'speech',
            language: isArabic ? 'ar-SA en-US' : 'en-US ar-SA',
            timeout: 5,
            speechTimeout: 3,
            action: `/api/voice/process/${conversationId}`,
            method: 'POST'
        });
        
        // سؤال المتابعة
        gather.say({
            voice: isArabic ? 'Polly.Zeina' : 'Polly.Joanna',
            language: isArabic ? 'arb' : 'en-US'
        }, isArabic ? 'هل تحتاج أي شيء آخر؟' : 'Is there anything else?');
        
        // في حالة عدم الرد
        twiml.say({
            voice: isArabic ? 'Polly.Zeina' : 'Polly.Joanna',
            language: isArabic ? 'arb' : 'en-US'
        }, isArabic ? 'شكراً لاتصالك. مع السلامة!' : 'Thank you for calling. Goodbye!');
        twiml.hangup();
        
        res.type('text/xml');
        res.send(twiml.toString());
        
    } catch (error) {
        console.error('❌ خطأ في المعالجة:', error);
        const twiml = new twilio.twiml.VoiceResponse();
        twiml.say({
            voice: 'Polly.Zeina',
            language: 'arb'
        }, 'عذراً، حدث خطأ. شكراً لاتصالك.');
        twiml.hangup();
        res.type('text/xml');
        res.send(twiml.toString());
    }
});

// ====================================
// معالجة عدم الإدخال
// ====================================
app.post('/api/voice/no-input/:conversationId', (req, res) => {
    const { conversationId } = req.params;
    const conversation = conversations.get(conversationId);
    const isArabic = conversation?.language === 'ar';
    
    const twiml = new twilio.twiml.VoiceResponse();
    
    // إعطاء فرصة أخرى
    const gather = twiml.gather({
        input: 'speech',
        language: 'ar-SA en-US',
        timeout: 5,
        speechTimeout: 3,
        action: `/api/voice/process/${conversationId}`,
        method: 'POST'
    });
    
    gather.say({
        voice: 'Polly.Zeina',
        language: 'arb'
    }, 'عذراً، لم أسمعك. هل يمكنك التحدث مرة أخرى؟');
    
    // إنهاء إذا لم يتحدث
    twiml.say({
        voice: 'Polly.Zeina',
        language: 'arb'
    }, 'لم أستطع سماعك. شكراً لاتصالك.');
    twiml.hangup();
    
    res.type('text/xml');
    res.send(twiml.toString());
});

// ====================================
// دالة توليد ردود ذكية بدون AI
// ====================================
function generateSmartResponse(text, isArabic) {
    const input = text.toLowerCase();
    
    // قاموس الردود الذكية
    const responses = {
        ar: {
            greeting: ['مرحبا', 'أهلا', 'السلام', 'صباح', 'مساء'],
            response_greeting: 'أهلاً وسهلاً بك! كيف يمكنني خدمتك اليوم؟',
            
            appointment: ['موعد', 'حجز', 'أحجز', 'ميعاد'],
            response_appointment: 'يمكنني مساعدتك في حجز موعد. المواعيد المتاحة: الأحد 10 صباحاً، الإثنين 2 ظهراً، أو الثلاثاء 4 عصراً. أي وقت تفضل؟',
            
            price: ['سعر', 'كم', 'تكلفة', 'كلف'],
            response_price: 'أسعار خدماتنا تبدأ من 100 ريال للاستشارة الأساسية، و200 ريال للخدمة المتقدمة. هل تريد تفاصيل أكثر؟',
            
            location: ['موقع', 'عنوان', 'أين', 'فين'],
            response_location: 'نحن في شارع الملك فهد، مبنى رقم 123، الدور الثالث. ساعات العمل من 9 صباحاً إلى 6 مساءً.',
            
            thanks: ['شكر', 'مشكور'],
            response_thanks: 'العفو! هل هناك شيء آخر يمكنني مساعدتك فيه؟',
            
            default: 'نعم، أفهمك. يمكنني مساعدتك في حجز المواعيد، معرفة الأسعار، أو الإجابة على استفساراتك. كيف يمكنني خدمتك؟'
        },
        en: {
            greeting: ['hello', 'hi', 'hey', 'good'],
            response_greeting: 'Hello! Welcome! How can I help you today?',
            
            appointment: ['appointment', 'book', 'schedule', 'meeting'],
            response_appointment: 'I can help you book an appointment. Available times are: Sunday 10 AM, Monday 2 PM, or Tuesday 4 PM. Which would you prefer?',
            
            price: ['price', 'cost', 'how much', 'fee'],
            response_price: 'Our services start from 100 SAR for basic consultation and 200 SAR for advanced service. Would you like more details?',
            
            location: ['location', 'address', 'where'],
            response_location: 'We are located at King Fahd Street, Building 123, 3rd Floor. Open from 9 AM to 6 PM.',
            
            joke: ['joke', 'funny'],
            response_joke: 'Why don\'t scientists trust atoms? Because they make up everything! Would you like to know about our services?',
            
            thanks: ['thank', 'thanks'],
            response_thanks: 'You\'re welcome! Is there anything else I can help you with?',
            
            default: 'Yes, I understand. I can help you with appointments, pricing, or answer your questions. How can I assist you?'
        }
    };
    
    const lang = isArabic ? responses.ar : responses.en;
    
    // البحث عن الرد المناسب
    for (let category in lang) {
        if (category.startsWith('response_')) continue;
        
        if (Array.isArray(lang[category])) {
            if (lang[category].some(keyword => input.includes(keyword))) {
                return lang['response_' + category];
            }
        }
    }
    
    return lang.default;
}

// ====================================
// عرض المحادثات
// ====================================
app.get('/api/conversations', (req, res) => {
    const convArray = Array.from(conversations.entries()).map(([id, conv]) => ({
        id,
        ...conv,
        messageCount: conv.messages.length
    }));
    
    res.json({
        success: true,
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
    console.log(`📱 رقم Twilio: ${config.twilioPhoneNumber || 'غير محدد'}`);
    console.log(`🤖 OpenAI: ${config.openaiApiKey ? '✅ متصل' : '❌ غير متصل'}`);
    console.log(`💾 MongoDB: ${config.mongoUri ? '✅ محدد' : '❌ غير محدد'}`);
    console.log('=====================================');
    console.log('📞 النظام جاهز لاستقبال المكالمات!');
});