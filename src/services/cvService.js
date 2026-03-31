const path = require('path');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

function normalizeString(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeTextArray(items) {
    if (!Array.isArray(items)) return [];
    return items.map(normalizeString).filter(Boolean);
}

function normalizeObjectArray(items, fields) {
    if (!Array.isArray(items)) return [];
    return items
        .map((item) => {
            const safeItem = item && typeof item === 'object' ? item : {};
            return fields.reduce((acc, field) => {
                acc[field] = normalizeString(safeItem[field]);
                return acc;
            }, {});
        })
        .filter((item) => Object.values(item).some(Boolean));
}

function sanitizeFileName(name) {
    const cleaned = normalizeString(name)
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
        .replace(/\s+/g, '_')
        .slice(0, 80);
    return cleaned || 'Resume';
}

function createCvError(code, message, extra = {}) {
    const error = new Error(message || code);
    error.code = code;
    Object.assign(error, extra);
    return error;
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
        education: normalizeObjectArray(safe.education, ['degree', 'major', 'institution', 'gpa', 'cert']),
        experience: normalizeObjectArray(safe.experience, ['title', 'company', 'duration', 'description']),
        courses: normalizeObjectArray(safe.courses, ['name', 'institution', 'year']),
        skills: normalizeTextArray(safe.skills),
        languages: normalizeTextArray(safe.languages)
    };
}

function ensureUserCanGenerate(user) {
    if (!user) {
        throw createCvError('USER_NOT_FOUND');
    }
    if (user.banned) {
        throw createCvError('USER_BANNED');
    }
    if (!user.is_subscribed && !user.is_admin) {
        throw createCvError('USER_NOT_SUBSCRIBED');
    }
}

function collectMissingFields(items, requiredFields, prefix, missingFields) {
    items.forEach((item, index) => {
        requiredFields.forEach((field) => {
            if (!item[field]) {
                missingFields.push(`${prefix}[${index}].${field}`);
            }
        });
    });
}

function ensureCvReady(cvData) {
    const safeData = normalizeCvData(cvData);
    const missingFields = [];

    if (!safeData.personal.name) missingFields.push('personal.name');
    if (!safeData.personal.phone) missingFields.push('personal.phone');
    if (!safeData.personal.email) {
        missingFields.push('personal.email');
    } else if (!EMAIL_REGEX.test(safeData.personal.email)) {
        missingFields.push('personal.email.invalid');
    }

    if (!safeData.education.length) {
        missingFields.push('education');
    } else {
        collectMissingFields(
            safeData.education,
            ['degree', 'major', 'institution', 'gpa'],
            'education',
            missingFields
        );
    }

    collectMissingFields(
        safeData.experience,
        ['title', 'company', 'duration'],
        'experience',
        missingFields
    );
    collectMissingFields(
        safeData.courses,
        ['name', 'institution', 'year'],
        'courses',
        missingFields
    );

    if (missingFields.length) {
        throw createCvError(
            'INVALID_CV_DATA',
            'CV data is incomplete or invalid.',
            { details: [...new Set(missingFields)] }
        );
    }

    return safeData;
}

function localizeValidationField(field, ar) {
    const labels = {
        'personal.name': ar ? 'الاسم الكامل' : 'full name',
        'personal.phone': ar ? 'رقم الجوال' : 'phone number',
        'personal.email': ar ? 'البريد الإلكتروني' : 'email address',
        'personal.email.invalid': ar ? 'صيغة البريد الإلكتروني غير صحيحة' : 'email address format is invalid',
        education: ar ? 'قسم التعليم' : 'education section'
    };

    if (labels[field]) return labels[field];

    const indexedFieldMatchers = [
        {
            regex: /^education\[(\d+)\]\.(degree|major|institution|gpa)$/,
            ar: {
                degree: 'المؤهل',
                major: 'التخصص',
                institution: 'الجهة التعليمية',
                gpa: 'المعدل'
            },
            en: {
                degree: 'degree',
                major: 'major',
                institution: 'institution',
                gpa: 'grade/GPA'
            }
        },
        {
            regex: /^experience\[(\d+)\]\.(title|company|duration)$/,
            ar: {
                title: 'المسمى الوظيفي',
                company: 'جهة العمل',
                duration: 'مدة العمل'
            },
            en: {
                title: 'job title',
                company: 'company',
                duration: 'duration'
            }
        },
        {
            regex: /^courses\[(\d+)\]\.(name|institution|year)$/,
            ar: {
                name: 'اسم الدورة',
                institution: 'جهة الإصدار',
                year: 'سنة الدورة'
            },
            en: {
                name: 'course name',
                institution: 'issuing institution',
                year: 'course year'
            }
        }
    ];

    for (const matcher of indexedFieldMatchers) {
        const match = field.match(matcher.regex);
        if (!match) continue;

        const itemNumber = Number(match[1]) + 1;
        const key = match[2];
        const label = ar ? matcher.ar[key] : matcher.en[key];
        return ar ? `${label} في العنصر رقم ${itemNumber}` : `${label} in item #${itemNumber}`;
    }

    return field;
}

function formatValidationDetails(details, ar) {
    if (!Array.isArray(details) || !details.length) return '';
    return details.map((field) => localizeValidationField(field, ar)).join(ar ? '، ' : ', ');
}

function toUserErrorMessage(errorCode, ar, error) {
    if (errorCode === 'USER_NOT_FOUND') return ar ? 'تعذر العثور على حسابك. أعد المحاولة عبر /start.' : 'We could not find your account. Please restart with /start.';
    if (errorCode === 'USER_BANNED') return ar ? 'حسابك محظور ولا يمكن إنشاء السيرة الذاتية.' : 'Your account is banned and cannot generate CV.';
    if (errorCode === 'USER_NOT_SUBSCRIBED') return ar ? 'الاشتراك مطلوب لإنشاء السيرة الذاتية.' : 'Subscription is required to generate CV.';
    if (errorCode === 'INVALID_CV_DATA' || errorCode === 'INVALID_PDF_INPUT') {
        const details = formatValidationDetails(error && error.details, ar);
        if (details) {
            return ar
                ? `بيانات السيرة الذاتية غير مكتملة أو غير صالحة: ${details}.`
                : `CV data is incomplete or invalid: ${details}.`;
        }
        return ar
            ? 'بيانات السيرة الذاتية غير مكتملة أو غير صالحة. أعد مراجعة المعلومات ثم حاول مرة أخرى.'
            : 'CV data is incomplete or invalid. Please review the information and try again.';
    }
    if (errorCode === 'PDF_FONT_MISSING' || errorCode === 'PDF_GENERATOR_NOT_AVAILABLE') return ar ? 'إعدادات إنشاء ملف PDF غير مكتملة على الخادم. تواصل مع الدعم الفني.' : 'The PDF service is missing required resources on the server. Please contact support.';
    if (errorCode === 'PDF_LAYOUT_FAILED' || errorCode === 'PDF_GENERATION_FAILED') return ar ? 'تعذر تنسيق السيرة الذاتية داخل ملف PDF. راجع البيانات ثم حاول مرة أخرى.' : 'The CV could not be laid out in a PDF. Please review the data and try again.';
    if (errorCode === 'PDF_OUTPUT_DIR_ERROR' || errorCode === 'PDF_FILE_NOT_CREATED' || errorCode === 'PDF_FILE_EMPTY') return ar ? 'تمت معالجة السيرة الذاتية لكن تعذر إنشاء ملف PDF صالح. حاول مرة أخرى لاحقاً.' : 'The CV was processed but a valid PDF file could not be created. Please try again later.';
    if (errorCode === 'BROWSER_NOT_FOUND' || errorCode === 'PDF_BROWSER_LAUNCH_FAILED' || errorCode === 'PDF_TEMPLATE_NOT_FOUND' || errorCode === 'PDF_TEMPLATE_RENDER_FAILED') {
        return ar ? 'خدمة إنشاء ملف PDF غير متاحة حالياً على الخادم. تواصل مع الدعم الفني.' : 'The PDF generation service is unavailable on this server right now.';
    }
    return ar ? 'حدث خطأ أثناء إنشاء السيرة الذاتية.' : 'Error generating PDF.';
}

function mapGenerationError(error) {
    if (error && error.code) return error.code;
    if (!error || !error.message) return 'UNKNOWN';
    const message = error.message.toLowerCase();
    if (message.includes('font')) return 'PDF_FONT_MISSING';
    if (message.includes('layout')) return 'PDF_LAYOUT_FAILED';
    if (message.includes('pdf')) return 'PDF_GENERATION_FAILED';
    if (message.includes('could not find chrome') || message.includes('failed to launch the browser process') || message.includes('browser was not found')) {
        return 'BROWSER_NOT_FOUND';
    }
    return 'UNKNOWN';
}

function validateCvGenerationRequest({ cvData, user }) {
    ensureUserCanGenerate(user);
    return ensureCvReady(cvData);
}

async function generateCvPdfForUser({ cvData, user, userId, generatePDF }) {
    if (typeof generatePDF !== 'function') {
        throw createCvError('PDF_GENERATOR_NOT_AVAILABLE');
    }
    const safeData = validateCvGenerationRequest({ cvData, user });
    const pdfPath = await generatePDF(safeData, userId);
    if (!normalizeString(pdfPath)) {
        throw createCvError('PDF_FILE_NOT_CREATED');
    }
    const fileName = `Resume_${sanitizeFileName(safeData.personal.name)}.pdf`;
    return { pdfPath: path.resolve(pdfPath), fileName };
}

module.exports = {
    normalizeCvData,
    sanitizeFileName,
    ensureUserCanGenerate,
    ensureCvReady,
    validateCvGenerationRequest,
    toUserErrorMessage,
    mapGenerationError,
    generateCvPdfForUser
};
