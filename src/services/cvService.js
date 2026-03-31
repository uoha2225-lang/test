const path = require('path');

function normalizeString(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function sanitizeFileName(name) {
    const cleaned = normalizeString(name)
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
        .replace(/\s+/g, '_')
        .slice(0, 80);
    return cleaned || 'Resume';
}

function normalizeCvData(cvData) {
    const safe = cvData || {};
    const personal = safe.personal || {};
    return {
        lang: safe.lang === 'ar' ? 'ar' : 'en',
        personal: {
            name: normalizeString(personal.name),
            phone: normalizeString(personal.phone),
            email: normalizeString(personal.email),
            city: normalizeString(personal.city)
        },
        education: Array.isArray(safe.education) ? safe.education : [],
        experience: Array.isArray(safe.experience) ? safe.experience : [],
        courses: Array.isArray(safe.courses) ? safe.courses : [],
        skills: Array.isArray(safe.skills) ? safe.skills : [],
        languages: Array.isArray(safe.languages) ? safe.languages : []
    };
}

function ensureUserCanGenerate(user) {
    if (!user) {
        const error = new Error('USER_NOT_FOUND');
        error.code = 'USER_NOT_FOUND';
        throw error;
    }
    if (user.banned) {
        const error = new Error('USER_BANNED');
        error.code = 'USER_BANNED';
        throw error;
    }
    if (!user.is_subscribed && !user.is_admin) {
        const error = new Error('USER_NOT_SUBSCRIBED');
        error.code = 'USER_NOT_SUBSCRIBED';
        throw error;
    }
}

function ensureCvReady(cvData) {
    const safeData = normalizeCvData(cvData);
    if (!safeData.personal.name) {
        const error = new Error('MISSING_NAME');
        error.code = 'MISSING_NAME';
        throw error;
    }
    return safeData;
}

function toUserErrorMessage(errorCode, ar) {
    if (errorCode === 'USER_BANNED') return ar ? 'حسابك محظور ولا يمكن إنشاء السيرة الذاتية.' : 'Your account is banned and cannot generate CV.';
    if (errorCode === 'USER_NOT_SUBSCRIBED') return ar ? 'الاشتراك مطلوب لإنشاء السيرة الذاتية.' : 'Subscription is required to generate CV.';
    if (errorCode === 'MISSING_NAME') return ar ? 'الاسم غير مكتمل. أعد المحاولة من البداية عبر /start.' : 'Name is missing. Please restart from /start.';
    if (errorCode === 'BROWSER_NOT_FOUND') return ar ? 'خدمة إنشاء PDF غير متاحة حالياً على الخادم. تواصل مع الدعم الفني.' : 'PDF generation service is unavailable on this server right now.';
    return ar ? 'حدث خطأ أثناء إنشاء السيرة الذاتية.' : 'Error generating PDF.';
}

function mapGenerationError(error) {
    if (!error || !error.message) return 'UNKNOWN';
    const message = error.message.toLowerCase();
    if (message.includes('could not find chrome') || message.includes('failed to launch the browser process') || message.includes('browser was not found')) {
        return 'BROWSER_NOT_FOUND';
    }
    return error.code || 'UNKNOWN';
}

async function generateCvPdfForUser({ cvData, user, userId, generatePDF }) {
    ensureUserCanGenerate(user);
    const safeData = ensureCvReady(cvData);
    const pdfPath = await generatePDF(safeData, userId);
    const fileName = `Resume_${sanitizeFileName(safeData.personal.name)}.pdf`;
    return { pdfPath: path.resolve(pdfPath), fileName };
}

module.exports = {
    normalizeCvData,
    sanitizeFileName,
    ensureUserCanGenerate,
    ensureCvReady,
    toUserErrorMessage,
    mapGenerationError,
    generateCvPdfForUser
};
