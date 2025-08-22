# 🚀 دليل التشغيل السريع

## ⚡ التشغيل في 5 دقائق

### 1. تثبيت المكتبات
```bash
npm install
```

### 2. إنشاء ملف .env
```bash
# Windows
echo. > .env

# macOS/Linux
touch .env
```

### 3. إضافة المتغيرات الأساسية
```env
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_PHONE_NUMBER=your_phone_number
OPENAI_API_KEY=your_openai_key
ELEVENLABS_API_KEY=your_elevenlabs_key
ELEVENLABS_VOICE_ID=your_voice_id
```

### 4. تشغيل الخادم
```bash
npm run dev
```

### 5. اختبار النظام
- افتح `http://localhost:3000`
- اتصل برقم Twilio
- استمتع! 🎉

## 🔑 الحصول على المفاتيح

### Twilio (5 دقائق)
1. [https://www.twilio.com](https://www.twilio.com) → Sign Up
2. احصل على Account SID و Auth Token
3. اشترِ رقم هاتف

### OpenAI (3 دقائق)
1. [https://platform.openai.com](https://platform.openai.com) → Sign Up
2. احصل على API Key

### ElevenLabs (3 دقائق)
1. [https://elevenlabs.io](https://elevenlabs.io) → Sign Up
2. احصل على API Key
3. اختر صوت عربي

## 📱 اختبار سريع

```bash
# اختبار معلومات النظام
curl http://localhost:3000/api/info

# اختبار المحادثات
curl http://localhost:3000/api/conversations
```

## 🚨 حل المشاكل السريع

### لا يعمل؟
```bash
# 1. تأكد من المتغيرات
cat .env

# 2. أعد تشغيل الخادم
npm run dev

# 3. راجع السجلات
# (ستظهر في Terminal)
```

### منفذ مشغول؟
```bash
# غيّر المنفذ في .env
PORT=3001
```

## 🌐 النشر على Heroku

```bash
# 1. إنشاء تطبيق
heroku create your-app-name

# 2. إضافة المتغيرات
heroku config:set TWILIO_ACCOUNT_SID=your_sid
heroku config:set TWILIO_AUTH_TOKEN=your_token
heroku config:set TWILIO_PHONE_NUMBER=your_number
heroku config:set OPENAI_API_KEY=your_key
heroku config:set ELEVENLABS_API_KEY=your_key
heroku config:set ELEVENLABS_VOICE_ID=your_id

# 3. رفع الكود
git push heroku main

# 4. فتح التطبيق
heroku open
```

## 📚 المزيد من المعلومات

- **التشغيل المحلي**: `LOCAL_SETUP.md`
- **النشر على Heroku**: `HEROKU_DEPLOY.md`
- **إعداد GitHub**: `GITHUB_SETUP.md`
- **التوثيق الكامل**: `README.md`

---

**🎯 هدفك**: مركز اتصال ذكي بالذكاء الاصطناعي مع أصوات طبيعية!

**⏱️ الوقت المطلوب**: 15 دقيقة للتشغيل المحلي، 30 دقيقة للنشر على Heroku
