const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const redis = require('redis');
const twilio = require('twilio');
const OpenAI = require('openai');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// إعداد التطبيق
const app = express();
const PORT = process.env.PORT || 3000;

// الإعدادات من ملف .env
const config = {
    mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/aivoice',
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
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
const twilioClient = twilio(config.twilioAccountSid, config.twilioAuthToken);

// إعداد OpenAI
const openai = new OpenAI({ apiKey: config.openaiApiKey });

// إعداد Redis (اختياري لـ Heroku)
let redisClient;
if (config.redisUrl) {
    redisClient = redis.createClient({ url: config.redisUrl });
    redisClient.on('error', (err) => console.log('Redis Client Error', err));
    redisClient.connect().catch(console.error);
}

// نموذج MongoDB للمحادثات
const ConversationSchema = new mongoose.Schema({
    conversationId: { type: String, unique: true, required: true },
    phoneNumber: { type: String, required: true },
    startTime: { type: Date, default: Date.now },
    endTime: Date,
    language: String,
    status: { 
        type: String, 
        enum: ['active', 'completed', 'failed'],
        default: 'active'
    },
    messages: [{
        timestamp: Date,
        type: { type: String, enum: ['user', 'assistant'] },
        text: String,
        intent: String
    }]
}, {
    timestamps: true
});

const Conversation = mongoose.model('Conversation', ConversationSchema);

// نموذج العميل
const CustomerSchema = new mongoose.Schema({
    phoneNumber: { type: String, unique: true, required: true },
    firstSeen: { type: Date, default: Date.now },
    lastSeen: Date,
    totalCalls: { type: Number, default: 0 },
    preferredLanguage: String
}, {
    timestamps: true
});

const Customer = mongoose.model('Customer', CustomerSchema);

// دعم اللغات
const SUPPORTED_LANGUAGES = {
    'ar': { name: 'Arabic', greeting: 'أهلاً وسهلاً! كيف يمكنني مساعدتك؟' },
    'en': { name: 'English', greeting: 'Hello! How can I help you today?' },
    'hi': { name: 'Hindi', greeting: 'नमस्ते! मैं आपकी कैसे मदद कर सकता हूं?' },
    'id': { name: 'Indonesian', greeting: 'Halo! Bagaimana saya bisa membantu?' },
    'tl': { name: 'Filipino', greeting: 'Kumusta! Paano kita matutulungan?' },
    'bn': { name: 'Bengali', greeting: 'হ্যালো! আমি কিভাবে সাহায্য করতে পারি?' },
    'ur': { name: 'Urdu', greeting: 'السلام علیکم! میں آپ کی کیسے مدد کر سکتا ہوں؟' },
    'ps': { name: 'Pashto', greeting: 'سلام! زه څنګه مرسته کولی شم؟' },
    'sw': { name: 'Swahili', greeting: 'Habari! Ninaweza kukusaidia vipi?' }
};

// ====================================
// المسارات (Routes)
// ====================================

// الصفحة الرئيسية
app.get('/', (req, res) => {
    res.json({
        message: 'مرحباً بك في منصة الاتصال الصوتي بالذكاء الاصطناعي',
        status: 'active',
        languages: Object.keys(SUPPORTED_LANGUAGES),
        endpoints: {
            health: '/health',
            incoming_call: '/api/voice/incoming',
            conversations: '/api/conversations/:phoneNumber'
        }
    });
});

// فحص صحة النظام
app.get('/health', async (req, res) => {
    const health = {
        status: 'healthy',
        timestamp: new Date(),
        services: {
            mongodb: mongoose.connection.readyState === 1,
            redis: redisClient ? redisClient.isOpen : false,
            twilio: !!config.twilioAccountSid,
            openai: !!config.openaiApiKey
        }
    };
    res.json(health);
});

// استقبال المكالمات من Twilio
app.post('/api/voice/incoming', async (req, res) => {
    try {
        const { From: phoneNumber, CallSid: callSid } = req.body;
        console.log(`مكالمة واردة من: ${phoneNumber}`);
        
        // إنشاء محادثة جديدة
        const conversationId = uuidv4();
        
        // التحقق من العميل
        let customer = await Customer.findOne({ phoneNumber });
        if (!customer) {
            customer = await Customer.create({
                phoneNumber,
                totalCalls: 1
            });
        } else {
            customer.totalCalls += 1;
            customer.lastSeen = new Date();
            await customer.save();
        }
        
        // إنشاء سجل المحادثة
        await Conversation.create({
            conversationId,
            phoneNumber,
            status: 'active'
        });
        
        // إنشاء رد TwiML
        const twiml = new twilio.twiml.VoiceResponse();
        
        // الترحيب بجميع اللغات
        twiml.say({
            voice: 'alice',
            language: 'ar-SA'
        }, 'أهلاً وسهلاً');
        
        twiml.say({
            voice: 'alice',
            language: 'en-US'
        }, 'Welcome! Please speak after the beep.');
        
        // تسجيل رد العميل
        twiml.record({
            action: `/api/voice/process/${conversationId}`,
            method: 'POST',
            maxLength: 120,
            timeout: 3,
            playBeep: true
        });
        
        res.type('text/xml');
        res.send(twiml.toString());
        
    } catch (error) {
        console.error('خطأ في استقبال المكالمة:', error);
        res.status(500).send('حدث خطأ');
    }
});

// معالجة التسجيل الصوتي
app.post('/api/voice/process/:conversationId', async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { RecordingUrl } = req.body;
        
        console.log(`معالجة التسجيل للمحادثة: ${conversationId}`);
        
        // هنا يمكنك إضافة معالجة الصوت باستخدام OpenAI Whisper
        // للتبسيط، سنستخدم رد تلقائي
        
        const twiml = new twilio.twiml.VoiceResponse();
        
        twiml.say({
            voice: 'alice',
            language: 'ar-SA'
        }, 'شكراً لك. سنقوم بمعالجة طلبك قريباً.');
        
        twiml.say({
            voice: 'alice',
            language: 'en-US'
        }, 'Thank you. We will process your request soon.');
        
        // إنهاء المكالمة
        twiml.hangup();
        
        // تحديث حالة المحادثة
        await Conversation.findOneAndUpdate(
            { conversationId },
            { 
                status: 'completed',
                endTime: new Date()
            }
        );
        
        res.type('text/xml');
        res.send(twiml.toString());
        
    } catch (error) {
        console.error('خطأ في معالجة التسجيل:', error);
        res.status(500).send('حدث خطأ');
    }
});

// الحصول على سجل المحادثات
app.get('/api/conversations/:phoneNumber', async (req, res) => {
    try {
        const { phoneNumber } = req.params;
        const conversations = await Conversation.find({ phoneNumber })
            .sort({ startTime: -1 })
            .limit(10);
        
        res.json({
            success: true,
            count: conversations.length,
            conversations
        });
        
    } catch (error) {
        console.error('خطأ في جلب المحادثات:', error);
        res.status(500).json({ error: 'حدث خطأ' });
    }
});

// الحصول على معلومات العميل
app.get('/api/customer/:phoneNumber', async (req, res) => {
    try {
        const { phoneNumber } = req.params;
        const customer = await Customer.findOne({ phoneNumber });
        
        if (!customer) {
            return res.status(404).json({ error: 'العميل غير موجود' });
        }
        
        res.json({
            success: true,
            customer
        });
        
    } catch (error) {
        console.error('خطأ في جلب بيانات العميل:', error);
        res.status(500).json({ error: 'حدث خطأ' });
    }
});

// الإحصائيات
app.get('/api/analytics', async (req, res) => {
    try {
        const totalConversations = await Conversation.countDocuments();
        const totalCustomers = await Customer.countDocuments();
        const activeConversations = await Conversation.countDocuments({ status: 'active' });
        
        res.json({
            success: true,
            analytics: {
                totalConversations,
                totalCustomers,
                activeConversations,
                timestamp: new Date()
            }
        });
        
    } catch (error) {
        console.error('خطأ في جلب الإحصائيات:', error);
        res.status(500).json({ error: 'حدث خطأ' });
    }
});

// ====================================
// الاتصال بقاعدة البيانات وتشغيل الخادم
// ====================================

// الاتصال بـ MongoDB
mongoose.connect(config.mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('✅ تم الاتصال بقاعدة البيانات MongoDB');
}).catch(err => {
    console.error('❌ فشل الاتصال بقاعدة البيانات:', err);
});

// تشغيل الخادم
app.listen(PORT, () => {
    console.log(`🚀 الخادم يعمل على المنفذ ${PORT}`);
    console.log(`📱 يمكنك الوصول للموقع على: http://localhost:${PORT}`);
});
