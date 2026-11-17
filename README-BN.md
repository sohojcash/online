# সহজ ক্যাশ — Static Website + Google Sheets

এই প্যাকেজে রয়েছে:

- `index.html`, `styles.css`, `app.js` — সম্পূর্ণ responsive static website
- `assets/hero-cover.png` — আপনার দেওয়া কভার ছবি
- `assets/logo.png` — আপনার দেওয়া লোগো
- `assets/icon.jfif` — আপনার দেওয়া আইকন
- `backend/Code.gs` — Google Sheets-এ আবেদন সংরক্ষণের Apps Script

## গুরুত্বপূর্ণ হোস্টিং নোট

GitHub Pages কেবল static ফাইল পরিবেশন করে; সেখানে PHP/MySQL backend চলে না। আরও গুরুত্বপূর্ণ, GitHub-এর বর্তমান Pages policy অনলাইন ব্যবসা বা বাণিজ্যিক লেনদেন সহজতর করার জন্য Pages ব্যবহার অনুমোদন করে না। তাই GitHub-এ source code রাখতে পারেন, কিন্তু প্রকৃত আর্থিক/ঋণ আবেদন সাইট লাইভ করার আগে উপযুক্ত hosting provider বেছে নিন।

## ১. Google Sheet তৈরি করুন

1. আপনার Google অ্যাকাউন্টে একটি নতুন Google Sheet তৈরি করুন; নাম দিতে পারেন `Shohoj Cash Applications`.
2. Sheet URL থেকে `/d/` এবং `/edit`-এর মাঝের অংশটি কপি করুন। এটিই Spreadsheet ID.
3. Sheet-এর **Extensions → Apps Script** খুলুন.
4. Apps Script-এর `Code.gs`-এ এই প্যাকেজের `backend/Code.gs`-এর সম্পূর্ণ কোড বসান.
5. `CONFIG.SPREADSHEET_ID`-তে আপনার Spreadsheet ID দিন.
6. চাইলে `ADMIN_EMAIL`-এ আপনার নোটিফিকেশন ইমেইল দিন এবং `SEND_EMAIL_ALERTS: true` করুন.
7. Apps Script editor থেকে `setupSheet` function নির্বাচন করে **Run** করুন. প্রথমবার Google permission চাইলে প্রয়োজনীয় অনুমতি দিন.

## ২. Apps Script Web App deploy করুন

1. **Deploy → New deployment** নির্বাচন করুন.
2. Type হিসেবে **Web app** নির্বাচন করুন.
3. Execute as: **Me**.
4. Who has access: **Anyone** (কারণ public website থেকে form submit হবে).
5. Deploy করুন এবং `/exec` দিয়ে শেষ হওয়া Web App URL কপি করুন.
6. Google account-এর owner-ই Sheet-এর মালিক থাকবেন; visitor-দের Sheet access দেবেন না.

> Web app `Anyone` করা মানে public internet থেকে endpoint-এ POST করা সম্ভব। এই কারণে production launch-এর আগে CAPTCHA/Turnstile server-side validation, abuse/rate limiting, monitoring ও security review যোগ করুন। Sheet কখনো Public/Anyone with link করবেন না।

## ৩. Frontend-এ Apps Script URL বসান

`app.js` ফাইলের শুরুতে এই লাইনটি খুঁজুন:

```js
APPS_SCRIPT_URL: ""
```

আপনার deploy করা `/exec` URL বসান। যেমন:

```js
APPS_SCRIPT_URL: "https://script.google.com/macros/s/আপনার_DEPLOYMENT_ID/exec"
```

এরপর `index.html`, `styles.css`, `app.js`, `assets/` এবং README-সহ ফাইলগুলো আপনার hosting-এ আপলোড করুন।

## ৪. Email notification

Apps Script-এর `Code.gs`-এ:

```js
ADMIN_EMAIL: "আপনার ইমেইল",
SEND_EMAIL_ALERTS: true
```

সেট করুন। Apps Script-এর Mail service-এর দৈনিক quota আছে এবং quota পরিবর্তন হতে পারে। Google-এর quota পৃষ্ঠা দেখুন: https://developers.google.com/apps-script/guides/services/quotas

## ৫. Payment integration এখনো চালু নয়

ওয়েবসাইটে bKash, Nagad, Rocket ও Upay নির্বাচন করার UI আছে। কিন্তু প্রকৃত টাকা সংগ্রহের ব্যবস্থা ইচ্ছাকৃতভাবে চালু করা হয়নি। `pay.bkh.com` / `pay.nag.com` বা অন্য কোনো অযাচাইকৃত URL-কে bKash/Nagad-এর official payment gateway হিসেবে ব্যবহার করবেন না।

প্রকৃত payment চালুর জন্য:

- অনুমোদিত merchant account ও official API credentials লাগবে.
- payment session server-side তৈরি করতে হবে.
- gateway-এর server-to-server callback/webhook যাচাই করতে হবে.
- শুধু browser return বা iframe load দেখে payment success ঘোষণা করা যাবে না.
- API secret কখনো `app.js` বা অন্য public frontend file-এ রাখবেন না.
- Gateway iframe embed অনুমোদন করে কি না তাদের documentation দেখে নিন; অনেক gateway hosted checkout-এ redirect চায়.

Official merchant integration প্রস্তুত হওয়ার পর payment step যুক্ত করুন। বর্তমানে user payment option নির্বাচন করলে পরিষ্কারভাবে জানানো হবে যে gateway এখনো সংযুক্ত নয়; কোনো টাকা পাঠাতে বলা হবে না।

## ৬. ব্যক্তিগত তথ্য ও সম্মতি

- সম্মতির checkbox ডিফল্টভাবে **unchecked** রাখা হয়েছে। ব্যবহারকারীকে নিজে সম্মতি দিতে হবে; pre-checked consent ব্যবহার করা হয়নি.
- NID ও জন্মতারিখ optional. প্রকৃত প্রয়োজন না থাকলে NID সংগ্রহ করবেন না.
- Google Sheet-এ নাম, মোবাইল, ঠিকানা, NID (যদি দেওয়া হয়) সহ ব্যক্তিগত তথ্য থাকবে। Sheet-এর access সীমিত রাখুন, Google account-এ 2-Step Verification চালু রাখুন, এবং retention/deletion policy ঠিক করুন.
- Public repository-তে কোনো applicant data, spreadsheet ID (যদি তা প্রকাশ ঝুঁকি তৈরি করে), API key, email secrets বা payment credentials commit করবেন না.
- Privacy Policy-তে প্রকৃত data controller-এর নাম, যোগাযোগের ঠিকানা, retention period, third-party processors এবং complaint process যোগ করুন.

## ৭. ফরমে থাকা ঋণের পরিমাণ

৫,০০০; ১০,০০০; ২০,০০০; ২৫,০০০; ৩০,০০০; ৪০,০০০; ৫০,০০০; ৭৫,০০০; ১,০০,০০০; ১,৫০,০০০; ২,০০,০০০; ২,৫০,০০০; ৩,০০,০০০; ৪,০০,০০০; ৫,০০,০০০ টাকা.

মেয়াদ: ৩, ৬ অথবা ১২ মাস.

## ৮. প্রকাশের আগে টেস্ট

- ফোন, ট্যাবলেট ও ডেস্কটপে layout পরীক্ষা করুন.
- test application দিয়ে Sheet row তৈরি হচ্ছে কি না দেখুন.
- Admin email alert চালু থাকলে ইমেইল আসছে কি না পরীক্ষা করুন.
- invalid phone, blank consent, invalid loan amount server-side rejected হচ্ছে কি না দেখুন.
- payment gateway live না হওয়া পর্যন্ত payment confirmation বা “payment successful” দেখাবেন না.
- বাস্তব সুদ/চার্জ, মোট পরিশোধযোগ্য অর্থ, কিস্তির হিসাব, যোগ্যতা, অভিযোগের ঠিকানা এবং অনুমোদিত প্রতিষ্ঠানের পরিচয় প্রকাশ করুন.

## ৯. মোবাইল/ডেস্কটপের যোগাযোগ নম্বর

বর্তমানে site copy-তে `01332-002097` ব্যবহার করা হয়েছে।
