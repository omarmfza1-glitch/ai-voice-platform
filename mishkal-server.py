#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
خادم Mishkal للتشكيل العربي
Mishkal Server for Arabic Diacritization
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import mishkal.tashkeel as tashkeel
import logging

# إعداد التسجيل
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# إنشاء كائن التشكيل
tashkeel_instance = tashkeel.TashkeelClass()

@app.route('/diacritize', methods=['POST'])
def diacritize():
    """إضافة التشكيل للنص العربي"""
    try:
        data = request.get_json()
        if not data or 'text' not in data:
            return jsonify({
                'success': False,
                'error': 'النص مطلوب',
                'service': 'Mishkal'
            }), 400
        
        text = data['text']
        logger.info(f'استلام نص للتشكيل: {text[:50]}...')
        
        # إضافة التشكيل
        diacritized_text = tashkeel_instance.tashkeel(text)
        
        logger.info(f'تم التشكيل بنجاح: {diacritized_text[:50]}...')
        
        return jsonify({
            'success': True,
            'text': diacritized_text,
            'confidence': 0.9,
            'service': 'Mishkal'
        })
        
    except Exception as e:
        logger.error(f'خطأ في التشكيل: {str(e)}')
        return jsonify({
            'success': False,
            'error': str(e),
            'service': 'Mishkal'
        }), 500

@app.route('/health', methods=['GET'])
def health():
    """فحص صحة الخادم"""
    return jsonify({
        'status': 'healthy',
        'service': 'Mishkal',
        'version': '1.0.0'
    })

@app.route('/', methods=['GET'])
def home():
    """الصفحة الرئيسية"""
    return '''
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>خادم Mishkal للتشكيل العربي</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
            .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            h1 { color: #2c3e50; text-align: center; }
            .endpoint { background: #ecf0f1; padding: 15px; margin: 15px 0; border-radius: 5px; }
            .method { color: #e74c3c; font-weight: bold; }
            .url { color: #3498db; font-family: monospace; }
            .example { background: #2c3e50; color: white; padding: 15px; border-radius: 5px; margin: 10px 0; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🐪 خادم Mishkal للتشكيل العربي</h1>
            
            <h2>📚 المميزات:</h2>
            <ul>
                <li>تشكيل دقيق للنص العربي</li>
                <li>دعم كامل للغة العربية</li>
                <li>API بسيط وسهل الاستخدام</li>
                <li>مفتوح المصدر</li>
            </ul>
            
            <h2>🔗 النقاط النهائية (Endpoints):</h2>
            
            <div class="endpoint">
                <span class="method">POST</span> 
                <span class="url">/diacritize</span>
                <p>إضافة التشكيل للنص العربي</p>
                <div class="example">
                    <strong>مثال:</strong><br>
                    curl -X POST "http://localhost:8000/diacritize" \<br>
                    &nbsp;&nbsp;-H "Content-Type: application/json" \<br>
                    &nbsp;&nbsp;-d '{"text": "مرحبا كيف حالك"}'
                </div>
            </div>
            
            <div class="endpoint">
                <span class="method">GET</span> 
                <span class="url">/health</span>
                <p>فحص صحة الخادم</p>
            </div>
            
            <h2>⚡ كيفية الاستخدام:</h2>
            <ol>
                <li>أرسل طلب POST إلى <code>/diacritize</code></li>
                <li>أرفق النص في حقل <code>text</code></li>
                <li>ستحصل على النص المشكل في الاستجابة</li>
            </ol>
            
            <h2>🎯 مثال عملي:</h2>
            <div class="example">
                <strong>النص الأصلي:</strong> مرحبا كيف حالك<br>
                <strong>النص المشكل:</strong> مَرْحَباً كَيْفَ حَالُكَ
            </div>
        </div>
    </body>
    </html>
    '''

if __name__ == '__main__':
    logger.info('بدء تشغيل خادم Mishkal...')
    logger.info('الخادم يعمل على: http://localhost:8000')
    logger.info('اضغط Ctrl+C لإيقاف الخادم')
    
    app.run(
        host='0.0.0.0',
        port=8000,
        debug=False
    )
