# منصة الاتصال الصوتي بالذكاء الاصطناعي
## AI Voice Platform with ElevenLabs

منصة ذكية للرد على المكالمات الهاتفية باستخدام الذكاء الاصطناعي مع دعم 10 لغات عالمية وأصوات طبيعية واقعية.

### 🌟 المميزات الرئيسية:
- 🌍 دعم 10 لغات (العربية، الإنجليزية، الهندية، البنغالية، الأوردو، الفلبينية، الأندونيسية، الأفغانية، السواحيلية، التركية)
- 🎵 أصوات طبيعية واقعية باستخدام ElevenLabs
- 🤖 ذكاء اصطناعي متقدم للرد على الاستفسارات
- 🎭 **التشكيل العربي**: GPT-4o للتشكيل الدقيق والكامل
- 🎭 **صياغة SSML**: GPT-4o لإنشاء SSML محسن للعربية
- 🎤 **تعرف عالي الجودة**: Google Speech-to-Text مع Whisper كبديل
- 💾 حفظ كامل للمحادثات
- 📊 إحصائيات وتحليلات مفصلة
- 🔒 أمان وتشفير عالي المستوى
- 🔄 إمكانية مقاطعة النظام في أي وقت

### 🛠️ التقنيات المستخدمة:
- **Node.js & Express.js** - إطار العمل
- **MongoDB Atlas** - قاعدة البيانات
- **Twilio Voice API** - المكالمات الصوتية
- **OpenAI GPT-4o** - الذكاء الاصطناعي والتشكيل العربي
- **ElevenLabs** - تحويل النص إلى صوت طبيعي
- **Redis Cache** - تحسين السرعة
- **Google Speech-to-Text** - التعرف على الكلام عالي الجودة

### 🚀 كيفية التشغيل:

#### 1. استنسخ المشروع:
```bash
git clone https://github.com/yourusername/ai-voice-platform.git
cd ai-voice-platform
```

#### 2. ثبت المكتبات:
```bash
npm install
```

#### 3. أنشئ ملف `.env` بالمفاتيح المطلوبة:
```env
# قاعدة البيانات
MONGODB_URI=mongodb://localhost:27017/aivoice

# Twilio (للمكالمات الصوتية)
TWILIO_ACCOUNT_SID=your_twilio_account_sid_here
TWILIO_AUTH_TOKEN=your_twilio_auth_token_here
TWILIO_PHONE_NUMBER=+966501234567

# OpenAI (للذكاء الاصطناعي)
OPENAI_API_KEY=your_openai_api_key_here

# ElevenLabs (للصوت الطبيعي)
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
ELEVENLABS_VOICE_ID=your_voice_id_here

# المنفذ
PORT=3000
```

**ملاحظة مهمة**: في بيئة الإنتاج (Heroku)، استخدم Config Vars بدلاً من ملف `.env`. راجع ملف `HEROKU_DEPLOY.md` للتعليمات.

#### 4. شغل الخادم:
```bash
npm start
```

### 🔑 كيفية الحصول على المفاتيح:

#### **Twilio (للمكالمات):**
1. اذهب إلى [https://www.twilio.com](https://www.twilio.com)
2. أنشئ حساب جديد
3. احصل على Account SID و Auth Token
4. اشترِ رقم هاتف

#### **OpenAI (للذكاء الاصطناعي):**
1. اذهب إلى [https://platform.openai.com](https://platform.openai.com)
2. أنشئ حساب جديد
3. احصل على API Key

#### **ElevenLabs (للصوت الطبيعي):**
1. اذهب إلى [https://elevenlabs.io](https://elevenlabs.io)
2. أنشئ حساب جديد
3. احصل على API Key
4. اختر الصوت المناسب للعربية

### 🎭 التشكيل العربي وSSML:
- **التشكيل الدقيق**: GPT-4o يضيف التشكيل الكامل (الفتحة، الكسرة، الضمة، السكون)
- **صياغة SSML**: GPT-4o ينشئ SSML محسن مع نبرة طبيعية وتوقفات مناسبة
- **جودة محسنة**: تحديث من GPT-5o-mini إلى GPT-4o للحصول على دقة أعلى
- **نبرة متغيرة**: نبرة استفهامية وتعجبية وطبيعية
- **توقفات طبيعية**: فواصل مناسبة بين الجمل والكلمات

### 🌍 اللغات المدعومة:
1. **العربية** - اللغة الأساسية مع التشكيل والـ SSML
2. **الإنجليزية** - English
3. **الهندية** - हिन्दी
4. **البنغالية** - বাংলা
5. **الأوردو** - اردو
6. **الفلبينية** - Filipino
7. **الأندونيسية** - Bahasa Indonesia
8. **الأفغانية** - پښتو
9. **السواحيلية** - Kiswahili
10. **التركية** - Türkçe

### 📱 كيفية الاستخدام:
1. اتصل برقم Twilio المحدد
2. سيرحب بك النظام باللغة العربية
3. تحدث بأي لغة من اللغات المدعومة
4. سيكتشف النظام لغتك ويجيبك بها
5. يمكنك مقاطعة النظام في أي وقت

### 🚀 النشر على Heroku:

#### 1. أنشئ تطبيق Heroku:
```bash
heroku create your-app-name
```

#### 2. أضف المتغيرات البيئية:
```bash
heroku config:set MONGODB_URI=your_mongodb_uri
heroku config:set TWILIO_ACCOUNT_SID=your_twilio_sid
heroku config:set TWILIO_AUTH_TOKEN=your_twilio_token
heroku config:set TWILIO_PHONE_NUMBER=your_twilio_number
heroku config:set OPENAI_API_KEY=your_openai_key
heroku config:set ELEVENLABS_API_KEY=your_elevenlabs_key
```

#### 3. ارفع الكود:
```bash
git add .
git commit -m "إضافة ElevenLabs للصوت الطبيعي"
git push heroku main
```

### 📊 إحصائيات النظام:
- **السرعة**: رد أقل من ثانية
- **الدقة**: 95%+ في فهم الكلام
- **اللغات**: 10 لغات عالمية
- **الأصوات**: طبيعية وواقعية
- **المقاطعة**: متاحة في أي وقت
- **التشكيل**: GPT-4o للتشكيل الدقيق
- **SSML**: GPT-4o لصياغة محسنة
- **التعرف**: Google Speech-to-Text عالي الجودة

### 🔮 التطوير المستقبلي:
- دعم Google Text-to-Speech
- إضافة المزيد من اللغات
- تحسين جودة الصوت
- إضافة تحليل المشاعر
- دعم الفيديو
- تحسين التشكيل العربي باستخدام نماذج متخصصة
- إضافة خيارات SSML متقدمة
- دعم اللهجات العربية المختلفة

### 📞 للتواصل:
- Email: your-email@example.com
- WhatsApp: +966501234567
- GitHub: [yourusername/ai-voice-platform](https://github.com/yourusername/ai-voice-platform)

---

تم التطوير بـ ❤️ بواسطة [اسمك]
**منصة المستقبل للاتصال الصوتي الذكي**
