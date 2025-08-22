# 🏠 دليل التشغيل المحلي

## 📋 المتطلبات الأساسية

### 1. تثبيت Node.js
- تأكد من تثبيت Node.js 18.x أو أحدث
- تحقق من الإصدار: `node --version`

### 2. تثبيت npm
- تأكد من تثبيت npm 9.x أو أحدث
- تحقق من الإصدار: `npm --version`

## 🚀 خطوات التشغيل

### الخطوة 1: تثبيت المكتبات
```bash
npm install
```

### الخطوة 2: إنشاء ملف .env
```bash
# أنشئ ملف .env في مجلد المشروع
touch .env
```

### الخطوة 3: إضافة المتغيرات البيئية
```env
# قاعدة البيانات المحلية (اختياري)
MONGODB_URI=mongodb://localhost:27017/aivoice

# Twilio (مطلوب)
TWILIO_ACCOUNT_SID=your_twilio_account_sid_here
TWILIO_AUTH_TOKEN=your_twilio_auth_token_here
TWILIO_PHONE_NUMBER=your_twilio_phone_number

# OpenAI (مطلوب)
OPENAI_API_KEY=your_openai_api_key_here

# ElevenLabs (مطلوب)
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
ELEVENLABS_VOICE_ID=your_voice_id_here

# المنفذ
PORT=3000

# بيئة التشغيل
NODE_ENV=development
```

### الخطوة 4: تشغيل الخادم
```bash
# التشغيل العادي
npm start

# التشغيل مع إعادة التحميل التلقائي
npm run dev
```

## 🔧 إعداد الخدمات

### 1. Twilio
- اذهب إلى [https://www.twilio.com](https://www.twilio.com)
- أنشئ حساب جديد
- احصل على Account SID و Auth Token
- اشترِ رقم هاتف

### 2. OpenAI
- اذهب إلى [https://platform.openai.com](https://platform.openai.com)
- أنشئ حساب جديد
- احصل على API Key

### 3. ElevenLabs
- اذهب إلى [https://elevenlabs.io](https://elevenlabs.io)
- أنشئ حساب جديد
- احصل على API Key
- اختر صوت مناسب للعربية

### 4. MongoDB (اختياري)
- اذهب إلى [https://cloud.mongodb.com](https://cloud.mongodb.com)
- أنشئ حساب جديد
- أنشئ cluster جديد
- أو استخدم MongoDB محلي

## 📱 اختبار النظام

### 1. اختبار الويب
- افتح المتصفح
- اذهب إلى `http://localhost:3000`
- تأكد من ظهور الصفحة الرئيسية

### 2. اختبار API
```bash
# اختبار معلومات النظام
curl http://localhost:3000/api/info

# اختبار المحادثات
curl http://localhost:3000/api/conversations
```

### 3. اختبار المكالمات
- اتصل برقم Twilio
- تأكد من أن النظام يجيب
- اختبر المقاطعة

## 🔍 حل المشاكل الشائعة

### مشكلة: المكتبات لا تثبت
```bash
# حذف node_modules وإعادة التثبيت
rm -rf node_modules
npm install
```

### مشكلة: المنفذ مشغول
```bash
# تغيير المنفذ في ملف .env
PORT=3001

# أو إيقاف العملية التي تستخدم المنفذ
lsof -ti:3000 | xargs kill -9
```

### مشكلة: المتغيرات البيئية لا تعمل
```bash
# تأكد من وجود ملف .env
ls -la .env

# تأكد من صحة التنسيق
cat .env

# إعادة تشغيل الخادم
npm run dev
```

## 📊 مراقبة الأداء

### 1. مراقبة السجلات
```bash
# عرض السجلات في الوقت الفعلي
npm run dev

# أو استخدام tail
tail -f logs/app.log
```

### 2. مراقبة الموارد
```bash
# مراقبة استخدام الذاكرة
node --inspect server.js

# مراقبة العمليات
ps aux | grep node
```

## 🚀 التطوير

### 1. إضافة ميزات جديدة
```bash
# إنشاء فرع جديد
git checkout -b feature/new-feature

# التطوير والاختبار
npm run dev

# عمل commit
git add .
git commit -m "إضافة ميزة جديدة"
```

### 2. اختبار التغييرات
```bash
# اختبار الكود
npm test

# فحص الأخطاء
npm run lint
```

## 📁 هيكل المشروع

```
ai-voice-platform/
├── server.js              # الخادم الرئيسي
├── package.json           # تبعيات المشروع
├── .env                   # المتغيرات البيئية (لا ترفع للـ Git)
├── .gitignore            # الملفات المستبعدة
├── README.md             # دليل المشروع
├── HEROKU_DEPLOY.md      # دليل النشر على Heroku
├── GITHUB_SETUP.md       # دليل إعداد GitHub
├── LOCAL_SETUP.md        # دليل التشغيل المحلي
├── public/               # الملفات العامة
│   └── index.html        # الصفحة الرئيسية
└── temp/                 # الملفات المؤقتة (يتم إنشاؤها تلقائياً)
```

## 🔐 الأمان

### 1. حماية المفاتيح
- لا تشارك ملف `.env` في GitHub
- استخدم دائماً متغيرات بيئية
- راجع الأذونات بانتظام

### 2. بيئة التطوير
- استخدم `NODE_ENV=development`
- فعّل السجلات التفصيلية
- استخدم منافذ محلية

## 📞 الدعم

إذا واجهت أي مشاكل:
1. راجع السجلات في Terminal
2. تأكد من صحة المتغيرات البيئية
3. راجع ملفات التوثيق
4. تواصل مع الدعم الفني

---

**تذكر**: في بيئة الإنتاج، استخدم Heroku Config Vars بدلاً من ملف `.env`!
