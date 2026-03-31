const test = require('node:test');
const assert = require('node:assert/strict');
const {
    sanitizeFileName,
    ensureUserCanGenerate,
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

test('mapGenerationError detects browser dependency errors', () => {
    const code = mapGenerationError(new Error('Could not find Chrome (ver. 125)'));
    assert.equal(code, 'BROWSER_NOT_FOUND');
});

test('toUserErrorMessage returns arabic and english content', () => {
    assert.match(toUserErrorMessage('USER_NOT_SUBSCRIBED', true), /الاشتراك/);
    assert.match(toUserErrorMessage('USER_NOT_SUBSCRIBED', false), /Subscription/);
});

test('generateCvPdfForUser returns resolved path and generated filename', async () => {
    const result = await generateCvPdfForUser({
        cvData: {
            lang: 'ar',
            personal: { name: 'abdullah' },
            education: []
        },
        user: { is_subscribed: 1, is_admin: 0, banned: 0 },
        userId: 123,
        generatePDF: async () => './pdf_output/sample.pdf'
    });
    assert.match(result.fileName, /^Resume_abdullah\.pdf$/);
    assert.match(result.pdfPath, /sample\.pdf$/);
});
