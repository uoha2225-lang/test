const test = require('node:test');
const assert = require('node:assert/strict');
const {
    ensureCvReady,
    sanitizeFileName,
    ensureUserCanGenerate,
    validateCvGenerationRequest,
    mapGenerationError,
    toUserErrorMessage,
    generateCvPdfForUser
} = require('../src/services/cvService');

test('sanitizeFileName removes invalid chars and spaces', () => {
    const fileName = sanitizeFileName('  Abdullah / CV : Senior Dev  ');
    assert.equal(fileName, 'Abdullah_CV_Senior_Dev');
});

test('ensureUserCanGenerate blocks non-subscribed non-admin user', () => {
    assert.throws(
        () => ensureUserCanGenerate({ is_subscribed: 0, is_admin: 0, banned: 0 }),
        (error) => error.code === 'USER_NOT_SUBSCRIBED'
    );
});

test('ensureCvReady rejects incomplete CV data with detailed fields', () => {
    assert.throws(
        () => ensureCvReady({
            lang: 'ar',
            personal: { name: '  ', phone: '', email: 'not-an-email' },
            education: [{ degree: 'BSc', major: '', institution: 'Uni', gpa: '' }]
        }),
        (error) => {
            assert.equal(error.code, 'INVALID_CV_DATA');
            assert.deepEqual(
                error.details,
                ['personal.name', 'personal.phone', 'personal.email.invalid', 'education[0].major', 'education[0].gpa']
            );
            return true;
        }
    );
});

test('validateCvGenerationRequest returns normalized cv data for valid input', () => {
    const normalized = validateCvGenerationRequest({
        user: { is_subscribed: 1, is_admin: 0, banned: 0 },
        cvData: {
            lang: 'ar',
            personal: {
                name: ' Abdullah ',
                phone: ' 0555 ',
                email: ' test@example.com ',
                city: ' Riyadh '
            },
            education: [{ degree: ' BSc ', major: ' CS ', institution: ' Uni ', gpa: ' 4/5 ' }],
            skills: [' JS ', '', 'Node'],
            languages: [' Arabic ', ' English ']
        }
    });

    assert.equal(normalized.personal.name, 'Abdullah');
    assert.equal(normalized.personal.phone, '0555');
    assert.equal(normalized.personal.email, 'test@example.com');
    assert.equal(normalized.personal.city, 'Riyadh');
    assert.deepEqual(normalized.skills, ['JS', 'Node']);
    assert.deepEqual(normalized.languages, ['Arabic', 'English']);
});

test('mapGenerationError detects direct PDF generation errors', () => {
    assert.equal(mapGenerationError(new Error('font missing on disk')), 'PDF_FONT_MISSING');
    assert.equal(mapGenerationError(new Error('layout rendering failed')), 'PDF_LAYOUT_FAILED');
    assert.equal(mapGenerationError(new Error('pdf write failed')), 'PDF_GENERATION_FAILED');
});

test('toUserErrorMessage returns arabic and english content', () => {
    assert.match(toUserErrorMessage('USER_NOT_SUBSCRIBED', true), /الاشتراك/);
    assert.match(toUserErrorMessage('USER_NOT_SUBSCRIBED', false), /Subscription/);
    assert.match(toUserErrorMessage('PDF_FONT_MISSING', true), /إعدادات إنشاء ملف PDF/);
    assert.match(toUserErrorMessage('PDF_LAYOUT_FAILED', false), /laid out in a PDF/);
});

test('toUserErrorMessage includes localized validation details', () => {
    const error = {
        details: ['personal.email.invalid', 'education[0].major']
    };
    assert.match(toUserErrorMessage('INVALID_CV_DATA', true, error), /صيغة البريد الإلكتروني غير صحيحة/);
    assert.match(toUserErrorMessage('INVALID_CV_DATA', true, error), /التخصص في العنصر رقم 1/);
    assert.match(toUserErrorMessage('INVALID_CV_DATA', false, error), /email address format is invalid/);
    assert.match(toUserErrorMessage('INVALID_CV_DATA', false, error), /major in item #1/);
});

test('generateCvPdfForUser returns resolved path and generated filename', async () => {
    const result = await generateCvPdfForUser({
        cvData: {
            lang: 'ar',
            personal: { name: 'abdullah', phone: '123456', email: 'abdullah@example.com' },
            education: [{ degree: 'BSc', major: 'CS', institution: 'Uni', gpa: '4/5' }]
        },
        user: { is_subscribed: 1, is_admin: 0, banned: 0 },
        userId: 123,
        generatePDF: async () => './pdf_output/sample.pdf'
    });
    assert.match(result.fileName, /^Resume_abdullah\.pdf$/);
    assert.match(result.pdfPath, /sample\.pdf$/);
});

test('generateCvPdfForUser rejects missing generator implementation', async () => {
    await assert.rejects(
        () => generateCvPdfForUser({
            cvData: {
                personal: { name: 'abdullah', phone: '123456', email: 'abdullah@example.com' },
                education: [{ degree: 'BSc', major: 'CS', institution: 'Uni', gpa: '4/5' }]
            },
            user: { is_subscribed: 1, is_admin: 0, banned: 0 },
            userId: 123
        }),
        (error) => error.code === 'PDF_GENERATOR_NOT_AVAILABLE'
    );
});
