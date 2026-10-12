export const extraLocaleNames = {
  hi: "हिन्दी",
  mr: "मराठी",
  it: "Italiano",
  ko: "한국어",
  zh: "简体中文",
  ar: "العربية",
} as const;

const common = {
  "Choose language": ["भाषा चुनें", "भाषा निवडा", "Scegli la lingua", "언어 선택", "选择语言", "اختر اللغة"],
  "Welcome back": ["वापसी पर स्वागत है", "पुन्हा स्वागत आहे", "Bentornato", "다시 오신 것을 환영합니다", "欢迎回来", "مرحبًا بعودتك"],
  "Email address": ["ईमेल पता", "ईमेल पत्ता", "Indirizzo email", "이메일 주소", "电子邮件地址", "عنوان البريد الإلكتروني"],
  "Password": ["पासवर्ड", "पासवर्ड", "Password", "비밀번호", "密码", "كلمة المرور"],
  "Show password": ["पासवर्ड दिखाएँ", "पासवर्ड दाखवा", "Mostra password", "비밀번호 표시", "显示密码", "إظهار كلمة المرور"],
  "Hide password": ["पासवर्ड छिपाएँ", "पासवर्ड लपवा", "Nascondi password", "비밀번호 숨기기", "隐藏密码", "إخفاء كلمة المرور"],
  "Remember 30 days": ["30 दिनों तक याद रखें", "३० दिवस लक्षात ठेवा", "Ricordami per 30 giorni", "30일 동안 기억하기", "记住我 30 天", "تذكرني لمدة 30 يومًا"],
  "Forgot password?": ["पासवर्ड भूल गए?", "पासवर्ड विसरलात?", "Password dimenticata?", "비밀번호를 잊으셨나요?", "忘记密码？", "هل نسيت كلمة المرور؟"],
  "Continue": ["जारी रखें", "पुढे चला", "Continua", "계속", "继续", "متابعة"],
  "Continue with Google": ["Google के साथ जारी रखें", "Google सह पुढे चला", "Continua con Google", "Google로 계속", "使用 Google 继续", "المتابعة باستخدام Google"],
  "Don't have an account?": ["खाता नहीं है?", "खाते नाही?", "Non hai un account?", "계정이 없으신가요?", "还没有账号？", "ليس لديك حساب؟"],
  "Create one": ["खाता बनाएँ", "खाते तयार करा", "Creane uno", "계정 만들기", "创建一个", "أنشئ حسابًا"],
  "Overview": ["अवलोकन", "आढावा", "Panoramica", "개요", "概览", "نظرة عامة"],
  "Profile": ["प्रोफ़ाइल", "प्रोफाइल", "Profilo", "프로필", "个人资料", "الملف الشخصي"],
  "Security & 2FA": ["सुरक्षा और 2FA", "सुरक्षा आणि 2FA", "Sicurezza e 2FA", "보안 및 2FA", "安全与双重验证", "الأمان والمصادقة الثنائية"],
  "Passkeys": ["पासकी", "पासकी", "Passkey", "패스키", "通行密钥", "مفاتيح المرور"],
  "Active Sessions": ["सक्रिय सत्र", "सक्रिय सत्रे", "Sessioni attive", "활성 세션", "活动会话", "الجلسات النشطة"],
  "Connected Apps": ["कनेक्ट किए गए ऐप", "जोडलेले ॲप्स", "App collegate", "연결된 앱", "已连接的应用", "التطبيقات المتصلة"],
  "Security Activity": ["सुरक्षा गतिविधि", "सुरक्षा क्रियाकलाप", "Attività di sicurezza", "보안 활동", "安全活动", "نشاط الأمان"],
  "Settings": ["सेटिंग", "सेटिंग्ज", "Impostazioni", "설정", "设置", "الإعدادات"],
  "Applications": ["ऐप्लिकेशन", "अनुप्रयोगे", "Applicazioni", "애플리케이션", "应用", "التطبيقات"],
  "API Keys": ["API कुंजियाँ", "API कीज", "Chiavi API", "API 키", "API 密钥", "مفاتيح API"],
  "Audit Logs": ["ऑडिट लॉग", "ऑडिट लॉग", "Registri di controllo", "감사 로그", "审计日志", "سجلات التدقيق"],
  "Account": ["खाता", "खाते", "Account", "계정", "账户", "الحساب"],
  "User": ["उपयोगकर्ता", "वापरकर्ता", "Utente", "사용자", "用户", "المستخدم"],
  "Developer": ["डेवलपर", "डेव्हलपर", "Sviluppatore", "개발자", "开发者", "المطور"],
  "Security settings": ["सुरक्षा सेटिंग", "सुरक्षा सेटिंग्ज", "Impostazioni di sicurezza", "보안 설정", "安全设置", "إعدادات الأمان"],
  "Your account": ["आपका खाता", "तुमचे खाते", "Il tuo account", "내 계정", "你的账户", "حسابك"],
  "Profile information": ["प्रोफ़ाइल जानकारी", "प्रोफाइल माहिती", "Informazioni profilo", "프로필 정보", "个人资料信息", "معلومات الملف الشخصي"],
  "Manage security": ["सुरक्षा प्रबंधित करें", "सुरक्षा व्यवस्थापित करा", "Gestisci sicurezza", "보안 관리", "管理安全", "إدارة الأمان"],
  "No recent activity": ["हाल की कोई गतिविधि नहीं", "अलीकडील क्रियाकलाप नाही", "Nessuna attività recente", "최근 활동 없음", "暂无近期活动", "لا يوجد نشاط حديث"],
  "Connected applications": ["कनेक्ट किए गए ऐप्लिकेशन", "जोडलेले अनुप्रयोग", "Applicazioni collegate", "연결된 애플리케이션", "已连接的应用", "التطبيقات المتصلة"],
  "Change password": ["पासवर्ड बदलें", "पासवर्ड बदला", "Cambia password", "비밀번호 변경", "更改密码", "تغيير كلمة المرور"],
  "Register passkey": ["पासकी पंजीकृत करें", "पासकी नोंदवा", "Registra passkey", "패스키 등록", "注册通行密钥", "تسجيل مفتاح مرور"],
  "Two-factor authentication": ["दो-कारक प्रमाणीकरण", "दुहेरी प्रमाणीकरण", "Autenticazione a due fattori", "2단계 인증", "双重身份验证", "المصادقة الثنائية"],
  "Continue with passkey": ["पासकी से जारी रखें", "पासकीने पुढे चला", "Continua con passkey", "패스키로 계속", "使用通行密钥继续", "المتابعة باستخدام مفتاح المرور"],
  "Sign in | OneAuth": ["साइन इन | OneAuth", "साइन इन | OneAuth", "Accedi | OneAuth", "로그인 | OneAuth", "登录 | OneAuth", "تسجيل الدخول | OneAuth"],
  "Create account | OneAuth": ["खाता बनाएँ | OneAuth", "खाते तयार करा | OneAuth", "Crea account | OneAuth", "계정 만들기 | OneAuth", "创建账户 | OneAuth", "إنشاء حساب | OneAuth"],
  "Sign in to OneAuth to access your interconnected workspace.": ["अपने जुड़े हुए कार्यक्षेत्र तक पहुँचने के लिए OneAuth में साइन इन करें।", "तुमच्या एकत्रित कार्यक्षेत्रात प्रवेश करण्यासाठी OneAuth मध्ये साइन इन करा.", "Accedi a OneAuth per entrare nel tuo spazio di lavoro integrato.", "연결된 작업 공간에 액세스하려면 OneAuth에 로그인하세요.", "登录 OneAuth 以访问互联工作区。", "سجّل الدخول إلى OneAuth للوصول إلى مساحة العمل المترابطة."],
  "Create a OneAuth account to access your interconnected workspace.": ["अपने जुड़े हुए कार्यक्षेत्र तक पहुँचने के लिए OneAuth खाता बनाएँ।", "तुमच्या एकत्रित कार्यक्षेत्रात प्रवेश करण्यासाठी OneAuth खाते तयार करा.", "Crea un account OneAuth per accedere al tuo spazio di lavoro integrato.", "연결된 작업 공간에 액세스하려면 OneAuth 계정을 만드세요.", "创建 OneAuth 账户以访问互联工作区。", "أنشئ حساب OneAuth للوصول إلى مساحة العمل المترابطة."],
} as const;

const localeIndexes = ["hi", "mr", "it", "ko", "zh", "ar"] as const;
export const extraDictionaries: Record<(typeof localeIndexes)[number], Record<string, string>> = {
  hi: {}, mr: {}, it: {}, ko: {}, zh: {}, ar: {},
};

for (const [key, values] of Object.entries(common)) {
  localeIndexes.forEach((locale, index) => {
    extraDictionaries[locale][key] = values[index];
  });
}
