# 🚀 دليل النشر على Heroku

## 📋 المتطلبات الأساسية

### 1. تثبيت Heroku CLI
```bash
# Windows
winget install --id=Heroku.HerokuCLI

# macOS
brew tap heroku/brew && brew install heroku

# Linux
curl https://cli-assets.heroku.com/install.sh | sh
```

### 2. تسجيل الدخول إلى Heroku
```bash
heroku login
```

## 🎯 خطوات النشر

### الخطوة 1: إنشاء تطبيق Heroku
```bash
# في مجلد المشروع
heroku create your-app-name-here
```

### الخطوة 2: إعداد قاعدة البيانات
```bash
# إضافة MongoDB Atlas
heroku addons:create mongolab:sandbox
```

### الخطوة 3: إعداد المتغيرات البيئية (Config Vars)

#### **أولاً: إضافة المتغيرات الأساسية**
```bash
# Twilio
heroku config:set TWILIO_ACCOUNT_SID=your_twilio_account_sid
heroku config:set TWILIO_AUTH_TOKEN=your_twilio_auth_token
heroku config:set TWILIO_PHONE_NUMBER=your_twilio_phone_number

# OpenAI
heroku config:set OPENAI_API_KEY=your_openai_api_key

# ElevenLabs
heroku config:set ELEVENLABS_API_KEY=your_elevenlabs_api_key
heroku config:set ELEVENLABS_VOICE_ID=your_voice_id

# قاعدة البيانات
heroku config:set MONGODB_URI=your_mongodb_atlas_uri
```

#### **ثانياً: إضافة متغيرات إضافية (اختيارية)**
```bash
# بيئة التشغيل
heroku config:set NODE_ENV=production

# منفذ مخصص
heroku config:set PORT=3000

# إعدادات إضافية
heroku config:set LOG_LEVEL=info
```

#### **ثالثاً: التحقق من المتغيرات**
```bash
# عرض جميع المتغيرات
heroku config

# عرض متغير محدد
heroku config:get TWILIO_ACCOUNT_SID
```

### الخطوة 4: رفع الكود
```bash
# إضافة جميع الملفات
git add .

# عمل commit
git commit -m "إضافة ElevenLabs للصوت الطبيعي"

# رفع الكود
git push heroku main
```

### الخطوة 5: تشغيل التطبيق
```bash
# تشغيل التطبيق
heroku open

# عرض السجلات
heroku logs --tail
```

## 🔧 إعداد Twilio

### 1. إنشاء حساب Twilio
- اذهب إلى [https://www.twilio.com](https://www.twilio.com)
- أنشئ حساب جديد
- احصل على Account SID و Auth Token

### 2. شراء رقم هاتف
- في لوحة التحكم، اذهب إلى Phone Numbers
- اشترِ رقم هاتف
- سجل الرقم في المتغيرات البيئية

### 3. إعداد Webhook
- في إعدادات الرقم، اضبط Voice Webhook إلى:
```
https://your-app-name.herokuapp.com/api/voice/incoming
```

## 🤖 إعداد OpenAI

### 1. إنشاء حساب OpenAI
- اذهب إلى [https://platform.openai.com](https://platform.openai.com)
- أنشئ حساب جديد
- احصل على API Key

### 2. إضافة المفتاح
```bash
heroku config:set OPENAI_API_KEY=sk-your-key-here
```

## 🎵 إعداد ElevenLabs

### 1. إنشاء حساب ElevenLabs
- اذهب إلى [https://elevenlabs.io](https://elevenlabs.io)
- أنشئ حساب جديد
- احصل على API Key

### 2. اختيار الصوت المناسب
- اذهب إلى Voice Library
- اختر صوت مناسب للعربية
- انسخ Voice ID

### 3. إضافة المفاتيح
```bash
heroku config:set ELEVENLABS_API_KEY=your_elevenlabs_key
heroku config:set ELEVENLABS_VOICE_ID=your_voice_id
```

## 🗄️ إعداد MongoDB Atlas

### 1. إنشاء قاعدة بيانات
- اذهب إلى [https://cloud.mongodb.com](https://cloud.mongodb.com)
- أنشئ حساب جديد
- أنشئ cluster جديد

### 2. إعداد الاتصال
- في Security > Database Access، أنشئ مستخدم
- في Security > Network Access، أضف IP 0.0.0.0/0
- انسخ connection string

### 3. إضافة الرابط
```bash
heroku config:set MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/database
```

## 📱 اختبار النظام

### 1. اختبار الويب
```bash
heroku open
```

### 2. اختبار المكالمات
- اتصل برقم Twilio
- تأكد من أن النظام يجيب
- اختبر المقاطعة

### 3. مراقبة السجلات
```bash
heroku logs --tail
```

## 🔍 حل المشاكل الشائعة

### مشكلة: التطبيق لا يعمل
```bash
# إعادة تشغيل
heroku restart

# فحص السجلات
heroku logs --tail

# فحص المتغيرات
heroku config
```

### مشكلة: المتغيرات البيئية مفقودة
```bash
# فحص المتغيرات
heroku config

# إضافة المتغيرات المفقودة
heroku config:set MISSING_VAR=value

# إعادة تشغيل التطبيق
heroku restart
```

### مشكلة: قاعدة البيانات لا تتصل
```bash
# فحص المتغيرات
heroku config

# اختبار الاتصال
heroku run node -e "console.log(process.env.MONGODB_URI)"
```

### مشكلة: Twilio لا يعمل
- تأكد من صحة Webhook URL
- تأكد من صحة المفاتيح
- فحص سجلات Twilio

## 📊 مراقبة الأداء

### 1. إضافة أدوات المراقبة
```bash
# إضافة New Relic
heroku addons:create newrelic:wayne

# إضافة Logentries
heroku addons:create logentries:le_tryit
```

### 2. فحص الإحصائيات
```bash
# فحص استخدام الموارد
heroku ps

# فحص قاعدة البيانات
heroku addons:open mongolab
```

## 🚀 التحديثات المستقبلية

### 1. تحديث الكود
```bash
git add .
git commit -m "تحديث جديد"
git push heroku main
```

### 2. إعادة تشغيل
```bash
heroku restart
```

### 3. تحديث المتغيرات البيئية
```bash
# تحديث متغير موجود
heroku config:set VAR_NAME=new_value

# إضافة متغير جديد
heroku config:set NEW_VAR=value

# حذف متغير
heroku config:unset VAR_NAME
```

## 🔐 إدارة الأمان

### 1. حماية المتغيرات الحساسة
- لا تشارك المتغيرات في GitHub
- استخدم دائماً Heroku Config Vars
- راجع الأذونات بانتظام

### 2. مراقبة الوصول
```bash
# فحص المستخدمين
heroku access

# إضافة مستخدم
heroku access:add user@email.com

# إزالة مستخدم
heroku access:remove user@email.com
```

## 📞 الدعم

إذا واجهت أي مشاكل:
1. راجع السجلات: `heroku logs --tail`
2. راجع المتغيرات: `heroku config`
3. أعد تشغيل التطبيق: `heroku restart`
4. تواصل مع الدعم الفني

---

## 📋 قائمة المتغيرات البيئية المطلوبة

| المتغير | الوصف | مثال |
|---------|--------|-------|
| `TWILIO_ACCOUNT_SID` | معرف حساب Twilio | `AC1234567890abcdef...` |
| `TWILIO_AUTH_TOKEN` | رمز مصادقة Twilio | `1234567890abcdef...` |
| `TWILIO_PHONE_NUMBER` | رقم هاتف Twilio | `+966501234567` |
| `OPENAI_API_KEY` | مفتاح API لـ OpenAI | `sk-1234567890abcdef...` |
| `ELEVENLABS_API_KEY` | مفتاح API لـ ElevenLabs | `1234567890abcdef...` |
| `ELEVENLABS_VOICE_ID` | معرف الصوت في ElevenLabs | `21m00Tcm4TlvDq8ikWAM` |
| `MONGODB_URI` | رابط قاعدة البيانات | `mongodb+srv://...` |

**ملاحظة مهمة**: تأكد من عدم مشاركة المفاتيح الحساسة في GitHub أو أي مكان عام!
