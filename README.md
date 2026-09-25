# ⌨️ تایپ‌هاب | TypeHub

یادگیری انگلیسی از **صفرِ صفر** برای فارسی‌زبانان — با مدل **شنیدار + تایپ**:
صدای انگلیسی پخش می‌شود (متن مخفی است)، کاربر همزمان تایپ می‌کند،
کلمات لحظه‌ای سبز/قرمز می‌شوند و در پایان نمره (دقت، سرعت، امتیاز) می‌گیرد.

## ✨ امکانات

- **۷ سطح از الفبا تا B1** (۲۳۰+ تمرین): الفبا، کلمات ساده، جمله‌های خیلی ساده،
  مکالمه روزمره (A1)، زندگی روزمره (A2)، داستان و نظر (B1) + سطح ویژه «تمرکز فارسی»
  برای تله‌های رایج فارسی‌زبانان (th، w/v، ship/sheep، …)
- **🎯 تست تعیین سطح**: ۶ سؤال شنیداری و پیشنهاد خودکار سطح شروع
- **تشخیص خودکار جواب درست**: به‌محض کامل‌شدن جواب صحیح، خودش می‌رود سراغ کارنامه
- **معنی فارسی** همه کلمات و جمله‌ها + مرور خطاها (جعبه لایتنر ساده)
- **استریک روزانه، XP، آمار** (دقت، سرعت، کلمات صحیح)
- **حساب کاربری**: ثبت‌نام → تأیید ادمین → ورود؛ **پیشرفت در سرور ذخیره و بین دستگاه‌ها همگام می‌شود**
- **پنل ادمین**: تأیید/رد کاربران، نقش‌ها، آمار یادگیری تجمیعی، مشاهده پیشرفت هر کاربر، تنظیمات سایت
- **PWA**: نصب روی موبایل (Add to Home Screen)، آفلاین‌خوان (کش نسخه مهمان)

## 🚀 نصب روی سرور (اوبونتو)

```bash
git clone https://github.com/younih/typehub.git
cd typehub
sudo bash install.sh type.example.com
```

اسکریپت خودش انجام می‌دهد: نصب nginx/certbot/پایتون، انتشار فرانت در
`/var/www/typehub`، بک‌اند Flask+gunicorn در `/opt/typehub` (سرویس `typehub-api`)،
ساخت ادمین اولیه، کانفیگ nginx (پروکسی `/api/`) و گواهی HTTPS.

برای به‌روزرسانی نسخه بعدی، همین دستور را دوباره اجرا کنید —
دیتابیس و حساب‌ها حفظ می‌شوند.

| آدرس | کاربرد |
|---|---|
| `https://type.example.com/` | ورود / ثبت‌نام |
| `https://type.example.com/app.html` | اپ یادگیری (پنل کاربری) |
| `https://type.example.com/admin.html` | پنل ادمین |

## 🛠 توسعه محلی

```bash
python3 -m venv .venv && .venv/bin/pip install -r api/requirements.txt
TYPEHUB_DATA_DIR=./data .venv/bin/python api/app.py   # بک‌اند روی 127.0.0.1:8000
# فرانت را با یک static server روی همین پورت سرو کنید یا مستقیم فایل‌ها را باز کنید
```

## 📁 ساختار

```
index.html        صفحه ورود / ثبت‌نام
app.html          اپ یادگیری (پنل کاربری)
admin.html        پنل ادمین
css/style.css     استایل
js/content.js     محتوای آموزشی (۷ سطح، ۲۳۰+ آیتم)
js/engine.js      موتور TTS و نمره‌دهی
js/app.js         منطق اپ + سینک سرور + تعیین سطح
js/auth.js        کمک‌های احراز هویت (مشترک)
api/app.py        بک‌اند Flask + SQLite
api/seed_admin.py ساخت ادمین اولیه
install.sh        نصب آسان روی VPS
```

## 🔌 API

- `POST /api/auth/signup` · `POST /api/auth/login` · `POST /api/auth/logout` · `GET /api/auth/me`
- `GET /api/th/progress` · `POST /api/th/progress` (ادغام هوشمند لوکال/سرور)
- `GET /api/admin/stats` · `GET /api/admin/users` · `POST /api/admin/users/<id>/{approve,reject,disable,enable}`
- `PUT /api/admin/users/<id>` (نقش) · `DELETE /api/admin/users/<id>`
- `GET /api/admin/users/<id>/progress` · `GET|PUT /api/admin/settings`
