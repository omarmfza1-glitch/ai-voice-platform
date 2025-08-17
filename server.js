const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const twilio = require('twilio');
const OpenAI = require('openai');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
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

// إعداد Twilio
const twilioClient = config.twilioAccountSid ? 
    twilio(config.twilioAccountSid, config.twilioAuthToken) : null;

// إعداد OpenAI
const openai = config.openaiApiKey ? 
    new OpenAI({ apiKey: config.openaiApiKey }) : null;

// تخزين المحادثات في الذاكرة (مؤقت)
const conversations = new Map();

// نموذج MongoDB بسيط
const ConversationSchema = new mongoose.Schema({
    conversationId: String,
    phoneNumber: String,
    startTime: { type: Date, default: Date.now },
    language: String,
    messages: Array,
    status: String
});

const Conversation = mongoose.model('Conversation', ConversationSchema);

// اتصال MongoDB (اختياري)
if (config.mongoUri && config.mongoUri !== 'mongodb://localhost:27017/aivoice') {
    mongoose.connect(config.mongoUri, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    }).then(() => {
        console.log('✅ تم الاتصال بـ MongoDB');
    }).catch(err => {
        console.log('⚠️ MongoDB غير متصل - العمل بدونه:', err.message);
    });
}

// ====================================
// الصفحة الرئيسية
// ====================================
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
                    font-family: Arial, sans-serif;
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
                }
                h1 { font-size: 2.5em; margin-bottom: 20px; }
                .status { 
                    background: #4CAF50; 
                    padding: 10px 20px; 
                    border-radius: 25px; 
                    display: inline-block;
                    margin: 20px 0;
                }
                .phone {
                    font-size: 1.5em;
                    margin: 20px 0;
                    padding: 15px;
                    background: rgba(255,255,255,0.2);
                    border-radius: 10px;
                }
                .features {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                    gap: 20px;
                    margin: 30px 0;
                }
                .feature {
                    padding: 20px;
                    background: rgba(255,255,255,0.2);
                    border-radius: 10px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🤖 منصة الاتصال الصوتي بالذكاء الاصطناعي</h1>
                <div class="status">✅ النظام يعمل بنجاح</div>
                <div class="phone">
                    📞 رقم الاتصال: <strong>${config.twilioPhoneNumber || 'غير محدد'}</strong>
                </div>
                <div class="features">
                    <div class="feature">🌍 9 لغات</div>
                    <div class="feature">⚡ رد فوري</div>
                    <div class="feature">💾 حفظ المحادثات</div>
                    <div class="feature">🤖 ذكاء اصطناعي</div>
                </div>
                <p>الوقت: ${new Date().toLocaleString('ar-SA')}</p>
            </div>
        </body>
        </html>
    `);
});

// ====================================
// فحص صحة النظام
// ====================================
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date(),
        services: {
            mongodb: mongoose.connection.readyState === 1,
            twilio: !!config.twilioAccountSid,
            openai: !!config.openaiApiKey
        },
        activeConversations: conversations.size
    });
});

// ====================================
// استقبال المكالمات الواردة
// ====================================
app.post('/api/voice/incoming', async (req, res) => {
    console.log('📞 مكالمة واردة:', req.body);
    
    try {
        const { From: phoneNumber, CallSid: callSid } = req.body;
        const conversationId = uuidv4();
        
        // حفظ المحادثة
        conversations.set(conversationId, {
            phoneNumber,
            callSid,
            startTime: new Date(),
            messages: []
        });

        // إنشاء رد TwiML
        const twiml = new twilio.twiml.VoiceResponse();
        
        // الترحيب بالعربية والإنجليزية
        twiml.say({
            voice: 'Polly.Zeina', // صوت عربي
            language: 'ar-SA'
        }, 'مرحباً بك في نظام الذكاء الاصطناعي. كيف يمكنني مساعدتك اليوم؟');
        
        // جمع الإدخال الصوتي مع إعدادات محسّنة
        const gather = twiml.gather({
            input: 'speech',
            language: 'ar-SA en-US', // دعم العربية والإنجليزية
            speechTimeout: 'auto',
            action: `/api/voice/process/${conversationId}`,
            method: 'POST'
        });
        
        gather.say({
            voice: 'Polly.Zeina',
            language: 'ar-SA'
        }, 'تفضل بالتحدث الآن.');

        // في حالة عدم التحدث
        twiml.say({
            voice: 'Polly.Zeina',
            language: 'ar-SA'
        }, 'عذراً، لم أسمع شيئاً. سأنهي المكالمة الآن.');
        
        res.type('text/xml');
        res.send(twiml.toString());
        
    } catch (error) {
        console.error('❌ خطأ في استقبال المكالمة:', error);
        
        const twiml = new twilio.twiml.VoiceResponse();
        twiml.say({
            voice: 'Polly.Zeina',
            language: 'ar-SA'
        }, 'عذراً، حدث خطأ في النظام. الرجاء المحاولة لاحقاً.');
        
        res.type('text/xml');
        res.send(twiml.toString());
    }
});

// ====================================
// معالجة الكلام
// ====================================
app.post('/api/voice/process/:conversationId', async (req, res) => {
    console.log('🎤 معالجة الكلام:', req.body);
    
    try {
        const { conversationId } = req.params;
        const { SpeechResult, Language } = req.body;
        
        const conversation = conversations.get(conversationId);
        if (!conversation) {
            throw new Error('المحادثة غير موجودة');
        }

        // حفظ رسالة المستخدم
        conversation.messages.push({
            type: 'user',
            text: SpeechResult,
            language: Language,
            timestamp: new Date()
        });

        // توليد رد ذكي
        let responseText = '';
        
        if (openai && config.openaiApiKey) {
            // استخدام OpenAI للرد الذكي
            try {
                const completion = await openai.chat.completions.create({
                    model: "gpt-3.5-turbo",
                    messages: [
                        {
                            role: "system",
                            content: "أنت مساعد ذكي ودود. رد بنفس لغة المستخدم. كن مختصراً ومفيداً. إذا سُئلت عن موعد، اقترح مواعيد متاحة. إذا سُئلت عن معلومات، قدم إجابة مفيدة."
                        },
                        {
                            role: "user",
                            content: SpeechResult
                        }
                    ],
                    max_tokens: 150,
                    temperature: 0.7
                });
                
                responseText = completion.choices[0].message.content;
            } catch (aiError) {
                console.error('خطأ OpenAI:', aiError);
                responseText = generateDefaultResponse(SpeechResult, Language);
            }
        } else {
            // رد افتراضي بدون OpenAI
            responseText = generateDefaultResponse(SpeechResult, Language);
        }

        // حفظ رد النظام
        conversation.messages.push({
            type: 'assistant',
            text: responseText,
            timestamp: new Date()
        });

        // إنشاء رد TwiML
        const twiml = new twilio.twiml.VoiceResponse();
        
        // الرد بالصوت المناسب
        const voiceConfig = Language && Language.includes('ar') ? 
            { voice: 'Polly.Zeina', language: 'ar-SA' } :
            { voice: 'Polly.Joanna', language: 'en-US' };
        
        twiml.say(voiceConfig, responseText);
        
        // السؤال عن المزيد
        const gather = twiml.gather({
            input: 'speech',
            language: 'ar-SA en-US',
            speechTimeout: 'auto',
            action: `/api/voice/process/${conversationId}`,
            method: 'POST'
        });
        
        gather.say(voiceConfig, 
            Language && Language.includes('ar') ? 
            'هل تحتاج شيئاً آخر؟' : 
            'Is there anything else I can help you with?'
        );
        
        // إنهاء المكالمة إذا لم يتحدث
        twiml.say(voiceConfig, 
            Language && Language.includes('ar') ? 
            'شكراً لاتصالك. مع السلامة!' : 
            'Thank you for calling. Goodbye!'
        );
        twiml.hangup();
        
        res.type('text/xml');
        res.send(twiml.toString());
        
    } catch (error) {
        console.error('❌ خطأ في معالجة الكلام:', error);
        
        const twiml = new twilio.twiml.VoiceResponse();
        twiml.say({
            voice: 'Polly.Zeina',
            language: 'ar-SA'
        }, 'عذراً، لم أتمكن من معالجة طلبك. شكراً لاتصالك.');
        twiml.hangup();
        
        res.type('text/xml');
        res.send(twiml.toString());
    }
});

// ====================================
// دالة للرد الافتراضي
// ====================================
function generateDefaultResponse(userText, language) {
    const text = userText.toLowerCase();
    const isArabic = language && language.includes('ar');
    
    // ردود ذكية بناءً على الكلمات المفتاحية
    if (text.includes('موعد') || text.includes('appointment')) {
        return isArabic ? 
            'يمكنني مساعدتك في حجز موعد. المواعيد المتاحة هي: الأحد الساعة 10 صباحاً، أو الإثنين الساعة 2 ظهراً. أيهما تفضل؟' :
            'I can help you book an appointment. Available times are: Sunday at 10 AM or Monday at 2 PM. Which would you prefer?';
    }
    
    if (text.includes('سعر') || text.includes('price') || text.includes('كم')) {
        return isArabic ?
            'أسعار خدماتنا تبدأ من 100 ريال. هل تريد معرفة تفاصيل أكثر عن خدمة معينة؟' :
            'Our services start from 100 SAR. Would you like more details about a specific service?';
    }
    
    if (text.includes('مرحبا') || text.includes('السلام') || text.includes('hello') || text.includes('hi')) {
        return isArabic ?
            'أهلاً وسهلاً بك! كيف يمكنني مساعدتك اليوم؟' :
            'Hello! Welcome! How can I help you today?';
    }
    
    if (text.includes('شكر') || text.includes('thank')) {
        return isArabic ?
            'العفو! هل تحتاج أي مساعدة أخرى؟' :
            'You\'re welcome! Do you need any other assistance?';
    }
    
    // رد عام
    return isArabic ?
        'نعم، أفهم طلبك. يمكنني مساعدتك في ذلك. هل تريد معرفة المزيد من التفاصيل؟' :
        'Yes, I understand your request. I can help you with that. Would you like more details?';
}

// ====================================
// عرض المحادثات
// ====================================
app.get('/api/conversations', (req, res) => {
    const convArray = Array.from(conversations.values());
    res.json({
        count: convArray.length,
        conversations: convArray
    });
});

// ====================================
// تشغيل الخادم
// ====================================
app.listen(PORT, () => {
    console.log(`🚀 الخادم يعمل على المنفذ ${PORT}`);
    console.log(`📱 Twilio: ${config.twilioPhoneNumber || 'غير محدد'}`);
    console.log(`🤖 OpenAI: ${config.openaiApiKey ? 'متصل' : 'غير متصل'}`);
    console.log(`💾 MongoDB: ${config.mongoUri ? 'محدد' : 'غير محدد'}`);
});