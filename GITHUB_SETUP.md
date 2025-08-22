# 📚 دليل إعداد GitHub

## 🎯 إنشاء مستودع جديد

### 1. إنشاء مستودع على GitHub
- اذهب إلى [https://github.com](https://github.com)
- اضغط على "New repository"
- أدخل اسم المستودع: `ai-voice-platform`
- اختر "Public" أو "Private"
- اضغط "Create repository"

### 2. تهيئة Git في المشروع المحلي
```bash
# في مجلد المشروع
git init
git add .
git commit -m "إضافة ElevenLabs للصوت الطبيعي"
```

### 3. ربط المستودع المحلي بـ GitHub
```bash
git remote add origin https://github.com/yourusername/ai-voice-platform.git
git branch -M main
git push -u origin main
```

## 🔐 إعدادات الأمان

### 1. إنشاء ملف .env
```bash
# أنشئ ملف .env في مجلد المشروع
touch .env
```

### 2. إضافة المتغيرات الحساسة
```env
# قاعدة البيانات
MONGODB_URI=mongodb://localhost:27017/aivoice

# Twilio
TWILIO_ACCOUNT_SID=your_twilio_account_sid_here
TWILIO_AUTH_TOKEN=your_twilio_auth_token_here
TWILIO_PHONE_NUMBER=+966501234567

# OpenAI
OPENAI_API_KEY=your_openai_api_key_here

# ElevenLabs
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM

# المنفذ
PORT=3000
```

### 3. التأكد من .gitignore
تأكد من أن ملف `.gitignore` يحتوي على:
```
.env
.env.local
.env.production
temp/
audio_*.mp3
```

## 📝 إدارة التحديثات

### 1. إضافة التغييرات
```bash
# إضافة ملف واحد
git add filename.js

# إضافة جميع الملفات
git add .

# إضافة ملفات محددة
git add *.js *.md
```

### 2. عمل commit
```bash
# commit بسيط
git commit -m "إضافة ميزة جديدة"

# commit مفصل
git commit -m "feat: إضافة دعم ElevenLabs للصوت الطبيعي

- دعم 10 لغات عالمية
- أصوات طبيعية وواقعية
- إمكانية المقاطعة
- تحسين الأداء"
```

### 3. رفع التحديثات
```bash
# رفع إلى الفرع الرئيسي
git push origin main

# رفع فرع جديد
git checkout -b feature/elevenlabs
git push origin feature/elevenlabs
```

## 🌿 إدارة الفروع

### 1. إنشاء فرع جديد
```bash
# إنشاء فرع جديد
git checkout -b feature/new-feature

# إنشاء فرع من فرع آخر
git checkout -b hotfix/urgent-fix main
```

### 2. التبديل بين الفروع
```bash
# الانتقال إلى فرع
git checkout branch-name

# إنشاء فرع جديد والانتقال إليه
git checkout -b new-branch-name
```

### 3. دمج الفروع
```bash
# العودة إلى الفرع الرئيسي
git checkout main

# دمج الفرع
git merge feature/new-feature

# حذف الفرع بعد الدمج
git branch -d feature/new-feature
```

## 🔄 سير العمل اليومي

### 1. بداية يوم العمل
```bash
# جلب التحديثات
git pull origin main

# فحص حالة الملفات
git status
```

### 2. أثناء العمل
```bash
# فحص التغييرات
git diff

# إضافة التغييرات
git add .

# عمل commit
git commit -m "تحديث: وصف التغيير"
```

### 3. نهاية يوم العمل
```bash
# رفع التغييرات
git push origin main

# أو رفع فرع جديد
git push origin feature/feature-name
```

## 📋 أفضل الممارسات

### 1. رسائل Commit
```bash
# استخدم أسماء واضحة
git commit -m "feat: إضافة دعم اللغة العربية"
git commit -m "fix: إصلاح مشكلة الصوت"
git commit -m "docs: تحديث README"
git commit -m "style: تحسين التنسيق"
git commit -m "refactor: إعادة هيكلة الكود"
```

### 2. تسمية الفروع
```bash
# ميزات جديدة
feature/user-authentication
feature/multi-language-support

# إصلاحات
hotfix/voice-quality-issue
bugfix/login-error

# إصدارات
release/v1.2.0
release/v2.0.0
```

### 3. تنظيم الكود
- احتفظ بالكود نظيفاً ومنظماً
- اكتب تعليقات واضحة
- استخدم أسماء متغيرات مفهومة
- اتبع معايير الترميز

## 🚨 حل المشاكل الشائعة

### 1. مشكلة في Push
```bash
# إذا كان هناك تضارب
git pull origin main
git push origin main

# إذا كان هناك تغييرات محلية
git stash
git pull origin main
git stash pop
```

### 2. إلغاء آخر commit
```bash
# إلغاء آخر commit مع الاحتفاظ بالتغييرات
git reset --soft HEAD~1

# إلغاء آخر commit مع حذف التغييرات
git reset --hard HEAD~1
```

### 3. استعادة ملف محذوف
```bash
# استعادة ملف من آخر commit
git checkout HEAD -- filename

# استعادة ملف من commit محدد
git checkout commit-hash -- filename
```

## 📊 مراقبة المستودع

### 1. فحص الإحصائيات
```bash
# فحص التغييرات
git log --oneline

# فحص التغييرات في ملف محدد
git log --follow filename

# فحص التغييرات في فترة زمنية
git log --since="2024-01-01" --until="2024-01-31"
```

### 2. فحص الفروع
```bash
# عرض جميع الفروع
git branch -a

# عرض الفروع المحلية
git branch

# عرض الفروع البعيدة
git branch -r
```

## 🔗 ربط GitHub بـ Heroku

### 1. إعداد GitHub Actions (اختياري)
```yaml
# .github/workflows/deploy.yml
name: Deploy to Heroku
on:
  push:
    branches: [ main ]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v2
    - name: Deploy to Heroku
      uses: akhileshns/heroku-deploy@v3.12.12
      with:
        heroku_api_key: ${{ secrets.HEROKU_API_KEY }}
        heroku_app_name: "your-app-name"
        heroku_email: "your-email@example.com"
```

### 2. إعداد Deploy Key
- في Heroku، اذهب إلى Settings
- أضف GitHub repository
- اختر الفرع الرئيسي للنشر التلقائي

## 📞 الدعم

إذا واجهت أي مشاكل:
1. راجع [GitHub Docs](https://docs.github.com)
2. ابحث في [GitHub Community](https://github.com/orgs/community/discussions)
3. تواصل مع الدعم الفني

---

**تذكر**: احتفظ دائماً بنسخة احتياطية من عملك وارفع التحديثات بانتظام!
