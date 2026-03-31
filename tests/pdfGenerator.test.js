const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createPdfGenerator, DEFAULT_FONT_PATHS, formatTextForPdf } = require('../src/utils/pdfGenerator');

const baseCvData = {
    lang: 'ar',
    personal: {
        name: 'عبدالله الشمري',
        phone: '0555555555',
        email: 'abdullah@example.com',
        city: 'الرياض'
    },
    education: [
        {
            degree: 'بكالوريوس',
            major: 'علوم الحاسب',
            institution: 'جامعة المثال',
            gpa: '4.8/5'
        }
    ],
    experience: [
        {
            title: 'مطور برمجيات',
            company: 'شركة المثال',
            duration: '2022 - 2025',
            description: 'تطوير الأنظمة الداخلية وتحسين تجربة المستخدم وكتابة واجهات برمجة تطبيقات موثوقة.'
        }
    ],
    courses: [
        {
            name: 'إدارة المشاريع',
            institution: 'منصة تدريب',
            year: '2024'
        }
    ],
    skills: ['Node.js', 'JavaScript', 'حل المشكلات'],
    languages: ['العربية', 'الإنجليزية']
};

function createTempDir(prefix) {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function readPageCount(filePath) {
    const raw = fs.readFileSync(filePath, 'latin1');
    const matches = raw.match(/\/Type\s*\/Page\b/g);
    return matches ? matches.length : 0;
}

test('formatTextForPdf normalizes whitespace without mutating script order', () => {
    assert.equal(formatTextForPdf('  Software   Engineer  '), 'Software Engineer');
    assert.equal(formatTextForPdf('  البريد   الإلكتروني  '), 'البريد الإلكتروني');
});

test('generatePDF creates an Arabic CV PDF with embedded fonts', async () => {
    const outputDir = createTempDir('pdf-generator-ar-');
    const generatePDF = createPdfGenerator({
        outputDir,
        now: () => 1001
    });

    const pdfPath = await generatePDF(baseCvData, 42);

    assert.equal(pdfPath, path.join(outputDir, 'CV_42_1001.pdf'));
    assert.ok(fs.existsSync(pdfPath));
    assert.ok(fs.statSync(pdfPath).size > 0);
    assert.ok(readPageCount(pdfPath) >= 1);
});

test('generatePDF creates an English CV PDF with embedded fonts', async () => {
    const outputDir = createTempDir('pdf-generator-en-');
    const generatePDF = createPdfGenerator({
        outputDir,
        now: () => 1002
    });

    const pdfPath = await generatePDF({
        ...baseCvData,
        lang: 'en',
        personal: {
            name: 'Abdullah Alshammari',
            phone: '0555555555',
            email: 'abdullah@example.com',
            city: 'Riyadh'
        },
        education: [
            {
                degree: 'Bachelor of Science',
                major: 'Computer Science',
                institution: 'Example University',
                gpa: '4.8/5'
            }
        ],
        experience: [
            {
                title: 'Software Engineer',
                company: 'Example Corp',
                duration: '2022 - 2025',
                description: 'Built internal tools, improved user workflows, and maintained backend APIs.'
            }
        ],
        courses: [
            {
                name: 'Project Management',
                institution: 'Training Hub',
                year: '2024'
            }
        ],
        skills: ['Node.js', 'JavaScript', 'Problem Solving'],
        languages: ['Arabic', 'English']
    }, 84);

    assert.equal(pdfPath, path.join(outputDir, 'CV_84_1002.pdf'));
    assert.ok(fs.existsSync(pdfPath));
    assert.ok(fs.statSync(pdfPath).size > 0);
});

test('generatePDF adds more than one page when content overflows', async () => {
    const outputDir = createTempDir('pdf-generator-overflow-');
    const generatePDF = createPdfGenerator({
        outputDir,
        now: () => 1003
    });

    const longDescription = 'إدارة المنتجات وتحليل المتطلبات وتنسيق التسليم وتحسين الجودة. '.repeat(18);
    const experience = Array.from({ length: 18 }, (_, index) => ({
        title: `منصب رقم ${index + 1}`,
        company: `شركة رقم ${index + 1}`,
        duration: `20${10 + index} - 20${11 + index}`,
        description: longDescription
    }));

    const pdfPath = await generatePDF({
        ...baseCvData,
        experience
    }, 126);

    assert.ok(fs.existsSync(pdfPath));
    assert.ok(readPageCount(pdfPath) > 1);
});

test('generatePDF rejects when required fonts are missing', async () => {
    const outputDir = createTempDir('pdf-generator-missing-font-');
    const generatePDF = createPdfGenerator({
        outputDir,
        fontPaths: {
            ...DEFAULT_FONT_PATHS,
            arabic: path.join(outputDir, 'MissingArabic.ttf')
        }
    });

    await assert.rejects(
        () => generatePDF(baseCvData, 77),
        (error) => error.code === 'PDF_FONT_MISSING'
    );
});

test('generatePDF rejects when the output directory cannot be created', async () => {
    const outputDir = path.join(createTempDir('pdf-generator-output-error-'), 'blocked');
    const fsLib = Object.assign({}, fs, {
        existsSync(targetPath) {
            if (targetPath === outputDir) return false;
            return fs.existsSync(targetPath);
        },
        mkdirSync() {
            throw new Error('permission denied');
        }
    });
    const generatePDF = createPdfGenerator({
        outputDir,
        fsLib
    });

    await assert.rejects(
        () => generatePDF(baseCvData, 88),
        (error) => error.code === 'PDF_OUTPUT_DIR_ERROR'
    );
});
