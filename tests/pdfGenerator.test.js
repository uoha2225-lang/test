const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createPdfGenerator } = require('../src/utils/pdfGenerator');

const validCvData = {
    lang: 'ar',
    personal: {
        name: 'Abdullah',
        phone: '0555555555',
        email: 'abdullah@example.com',
        city: 'Riyadh'
    },
    education: [
        {
            degree: 'BSc',
            major: 'Computer Science',
            institution: 'Example University',
            gpa: '4.5/5'
        }
    ],
    experience: [],
    courses: [],
    skills: ['Node.js'],
    languages: ['Arabic', 'English']
};

function createTempDir(prefix) {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('generatePDF renders HTML and writes a PDF file using the configured output path', async () => {
    const tempDir = createTempDir('pdf-generator-success-');
    const calls = {};

    const page = {
        async setContent(html, options) {
            calls.html = html;
            calls.setContentOptions = options;
        },
        async emulateMediaType(type) {
            calls.mediaType = type;
        },
        async pdf(options) {
            calls.pdfOptions = options;
            fs.writeFileSync(options.path, '%PDF-1.4 mock file');
        },
        async close() {
            calls.pageClosed = true;
        }
    };

    const browser = {
        async newPage() {
            calls.newPageCalled = true;
            return page;
        },
        async close() {
            calls.browserClosed = true;
        }
    };

    const generatePDF = createPdfGenerator({
        outputDir: tempDir,
        now: () => 123456,
        puppeteerLib: {
            executablePath() {
                return 'relative/chrome';
            },
            async launch(options) {
                calls.launchOptions = options;
                return browser;
            }
        }
    });

    const pdfPath = await generatePDF(validCvData, 42);

    assert.equal(pdfPath, path.join(tempDir, 'CV_42_123456.pdf'));
    assert.ok(fs.existsSync(pdfPath));
    assert.equal(calls.setContentOptions.waitUntil, 'load');
    assert.equal(calls.setContentOptions.timeout, 15000);
    assert.equal(calls.mediaType, 'screen');
    assert.equal(calls.launchOptions.executablePath, path.resolve('relative/chrome'));
    assert.match(calls.html, /Abdullah/);
    assert.equal(calls.pdfOptions.path, pdfPath);
    assert.equal(calls.newPageCalled, true);
    assert.equal(calls.pageClosed, true);
    assert.equal(calls.browserClosed, true);
});

test('generatePDF returns a browser-not-found error when Puppeteer cannot resolve Chrome', async () => {
    const tempDir = createTempDir('pdf-generator-browser-');
    const generatePDF = createPdfGenerator({
        outputDir: tempDir,
        puppeteerLib: {
            async launch() {
                throw new Error('Could not find Chrome (ver. 146)');
            }
        }
    });

    await assert.rejects(
        () => generatePDF(validCvData, 55),
        (error) => error.code === 'BROWSER_NOT_FOUND'
    );
});

test('generatePDF rejects when the template cannot be loaded', async () => {
    const generatePDF = createPdfGenerator({
        fsLib: {
            existsSync() {
                return true;
            },
            mkdirSync() {},
            readFileSync() {
                const error = new Error('ENOENT');
                error.code = 'ENOENT';
                throw error;
            }
        }
    });

    await assert.rejects(
        () => generatePDF(validCvData, 77),
        (error) => error.code === 'PDF_TEMPLATE_NOT_FOUND'
    );
});

test('generatePDF rejects when no PDF file is written to disk', async () => {
    const tempDir = createTempDir('pdf-generator-missing-file-');
    const calls = {};

    const page = {
        async setContent() {},
        async emulateMediaType() {},
        async pdf() {},
        async close() {
            calls.pageClosed = true;
        }
    };

    const browser = {
        async newPage() {
            return page;
        },
        async close() {
            calls.browserClosed = true;
        }
    };

    const generatePDF = createPdfGenerator({
        outputDir: tempDir,
        now: () => 999,
        puppeteerLib: {
            async launch() {
                return browser;
            }
        }
    });

    await assert.rejects(
        () => generatePDF(validCvData, 88),
        (error) => {
            assert.equal(error.code, 'PDF_FILE_NOT_CREATED');
            assert.equal(calls.pageClosed, true);
            assert.equal(calls.browserClosed, true);
            return true;
        }
    );
});
