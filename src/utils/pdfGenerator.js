const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const PAGE_MARGIN = 40;
const FONT_NAMES = {
    latin: 'cv-latin',
    arabic: 'cv-arabic'
};
const COLORS = {
    heading: '#22384d',
    text: '#243746',
    muted: '#5f6b76',
    border: '#d8dee4'
};
const DEFAULT_FONT_PATHS = Object.freeze({
    latin: path.join(__dirname, '../../assets/fonts/NotoSans-Regular.ttf'),
    arabic: path.join(__dirname, '../../assets/fonts/Amiri-Regular.ttf')
});
const SECTION_LABELS = {
    ar: {
        phone: 'رقم الجوال',
        email: 'البريد الإلكتروني',
        city: 'المدينة',
        experience: 'الخبرات المهنية',
        education: 'المؤهلات العلمية',
        courses: 'الدورات التدريبية',
        skills: 'المهارات',
        languages: 'اللغات',
        gpa: 'المعدل',
        cert: 'التصنيف أو الهيئة',
        company: 'جهة العمل',
        duration: 'مدة العمل',
        institution: 'الجهة',
        year: 'السنة'
    },
    en: {
        phone: 'Phone',
        email: 'Email',
        city: 'City',
        experience: 'Professional Experience',
        education: 'Education',
        courses: 'Courses & Certifications',
        skills: 'Skills',
        languages: 'Languages',
        gpa: 'GPA',
        cert: 'Certification',
        company: 'Company',
        duration: 'Duration',
        institution: 'Institution',
        year: 'Year'
    }
};

function createPdfError(code, message, extra = {}) {
    const error = new Error(message || code);
    error.code = code;
    Object.assign(error, extra);
    return error;
}

function resolveOutputDir(pathLib = path) {
    return process.env.PDF_OUTPUT_DIR || pathLib.join(__dirname, '../../pdf_output');
}

function ensureOutputDir(fsLib, outputDir) {
    try {
        if (!fsLib.existsSync(outputDir)) {
            fsLib.mkdirSync(outputDir, { recursive: true });
        }
    } catch (error) {
        throw createPdfError(
            'PDF_OUTPUT_DIR_ERROR',
            'Unable to prepare PDF output directory.',
            { cause: error, outputDir }
        );
    }
}

function ensureFontsAvailable(fsLib, fontPaths) {
    for (const [fontKey, fontPath] of Object.entries(fontPaths)) {
        if (!fontPath || !fsLib.existsSync(fontPath)) {
            throw createPdfError(
                'PDF_FONT_MISSING',
                `Required PDF font is missing: ${fontKey}.`,
                { fontKey, fontPath }
            );
        }
    }
}

function assertPdfWritten(fsLib, savePath) {
    if (!fsLib.existsSync(savePath)) {
        throw createPdfError(
            'PDF_FILE_NOT_CREATED',
            'PDF file was not created.',
            { savePath }
        );
    }

    const stats = fsLib.statSync(savePath);
    if (!stats.size) {
        throw createPdfError(
            'PDF_FILE_EMPTY',
            'Generated PDF file is empty.',
            { savePath }
        );
    }
}

function removePartialFile(fsLib, savePath) {
    try {
        if (savePath && fsLib.existsSync(savePath)) {
            fsLib.unlinkSync(savePath);
        }
    } catch (error) {
        // Best-effort cleanup.
    }
}

function normalizeText(value) {
    return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function containsArabic(text) {
    return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(text);
}

function formatTextForPdf(text) {
    return normalizeText(text);
}

function createLayoutContext(doc, fontPaths, lang) {
    const labels = SECTION_LABELS[lang] || SECTION_LABELS.en;
    const defaultAlign = lang === 'ar' ? 'right' : 'left';

    doc.registerFont(FONT_NAMES.latin, fontPaths.latin);
    doc.registerFont(FONT_NAMES.arabic, fontPaths.arabic);

    return {
        lang,
        labels,
        margin: PAGE_MARGIN,
        width: () => doc.page.width - (PAGE_MARGIN * 2),
        alignFor(text) {
            return lang === 'ar' || containsArabic(normalizeText(text)) ? 'right' : defaultAlign;
        },
        fontFor(text) {
            return containsArabic(normalizeText(text)) ? FONT_NAMES.arabic : FONT_NAMES.latin;
        },
        format(text) {
            return formatTextForPdf(text);
        }
    };
}

function measureTextHeight(doc, ctx, text, options = {}) {
    const formatted = ctx.format(text);
    if (!formatted) return 0;

    doc.font(ctx.fontFor(text)).fontSize(options.size || 12);
    return doc.heightOfString(formatted, {
        width: ctx.width(),
        align: options.align || ctx.alignFor(text),
        lineGap: options.lineGap || 2
    });
}

function ensureSpace(doc, neededHeight) {
    if (doc.y + neededHeight <= doc.page.height - PAGE_MARGIN) return;
    doc.addPage();
}

function writeText(doc, ctx, text, options = {}) {
    const formatted = ctx.format(text);
    if (!formatted) return;

    const size = options.size || 12;
    const gapAfter = options.gapAfter ?? 4;
    const align = options.align || ctx.alignFor(text);
    const lineGap = options.lineGap || 2;
    const color = options.color || COLORS.text;
    const height = measureTextHeight(doc, ctx, text, { size, align, lineGap });

    ensureSpace(doc, height + gapAfter);

    doc
        .font(ctx.fontFor(text))
        .fontSize(size)
        .fillColor(color)
        .text(formatted, PAGE_MARGIN, doc.y, {
            width: ctx.width(),
            align,
            lineGap
        });

    doc.y += gapAfter;
}

function writeSeparator(doc) {
    ensureSpace(doc, 18);
    const y = doc.y;
    doc
        .save()
        .strokeColor(COLORS.border)
        .lineWidth(1)
        .moveTo(PAGE_MARGIN, y)
        .lineTo(doc.page.width - PAGE_MARGIN, y)
        .stroke()
        .restore();
    doc.y += 12;
}

function writeSectionTitle(doc, ctx, title) {
    if (doc.y > PAGE_MARGIN + 8) {
        writeSeparator(doc);
    }
    writeText(doc, ctx, title, {
        size: 17,
        color: COLORS.heading,
        gapAfter: 8
    });
}

function writeHeader(doc, ctx, cvData) {
    writeText(doc, ctx, cvData.personal.name, {
        size: 24,
        color: COLORS.heading,
        gapAfter: 10
    });

    const details = [
        [ctx.labels.phone, cvData.personal.phone],
        [ctx.labels.email, cvData.personal.email],
        [ctx.labels.city, cvData.personal.city]
    ].filter(([, value]) => value);

    details.forEach(([label, value]) => {
        writeField(doc, ctx, label, value, {
            labelSize: 10,
            valueSize: 11,
            gapAfter: 4
        });
    });

    doc.y += 4;
}

function writeField(doc, ctx, label, value, options = {}) {
    if (!value) return;

    if (ctx.lang === 'ar') {
        writeText(doc, ctx, label, {
            size: options.labelSize || 10,
            color: COLORS.muted,
            gapAfter: 1
        });
        writeText(doc, ctx, value, {
            size: options.valueSize || 11,
            color: options.valueColor || COLORS.text,
            gapAfter: options.gapAfter ?? 4
        });
        return;
    }

    writeText(doc, ctx, `${label}: ${value}`, {
        size: options.valueSize || 11,
        color: options.valueColor || COLORS.text,
        gapAfter: options.gapAfter ?? 4
    });
}

function estimateEntryHeight(doc, ctx, lines) {
    return lines.reduce((total, line) => {
        if (!line.text) return total;
        return total + measureTextHeight(doc, ctx, line.text, line) + (line.gapAfter ?? 4);
    }, 0);
}

function writeExperienceSection(doc, ctx, items) {
    if (!items.length) return;
    writeSectionTitle(doc, ctx, ctx.labels.experience);

    items.forEach((item) => {
        const lines = [
            { text: item.title, size: 14, color: COLORS.heading, gapAfter: 3 }
        ];

        ensureSpace(doc, Math.min(estimateEntryHeight(doc, ctx, lines), doc.page.height - (PAGE_MARGIN * 2)));
        lines.forEach((line) => writeText(doc, ctx, line.text, line));
        writeField(doc, ctx, ctx.labels.company, item.company, { labelSize: 10, valueSize: 11, gapAfter: 3 });
        writeField(doc, ctx, ctx.labels.duration, item.duration, { labelSize: 10, valueSize: 11, gapAfter: 4 });
        writeText(doc, ctx, item.description, { size: 11, color: COLORS.text, gapAfter: 8 });
    });
}

function writeEducationSection(doc, ctx, items) {
    if (!items.length) return;
    writeSectionTitle(doc, ctx, ctx.labels.education);

    items.forEach((item) => {
        const title = [item.degree, item.major].filter(Boolean).join(' - ');
        const lines = [
            { text: title, size: 14, color: COLORS.heading, gapAfter: 3 }
        ];

        ensureSpace(doc, Math.min(estimateEntryHeight(doc, ctx, lines), doc.page.height - (PAGE_MARGIN * 2)));
        lines.forEach((line) => writeText(doc, ctx, line.text, line));
        writeField(doc, ctx, ctx.labels.institution, item.institution, { labelSize: 10, valueSize: 11, gapAfter: 3 });
        writeField(doc, ctx, ctx.labels.gpa, item.gpa, { labelSize: 10, valueSize: 11, gapAfter: item.cert ? 3 : 6 });
        writeField(doc, ctx, ctx.labels.cert, item.cert, { labelSize: 10, valueSize: 11, gapAfter: 8 });
    });
}

function writeCoursesSection(doc, ctx, items) {
    if (!items.length) return;
    writeSectionTitle(doc, ctx, ctx.labels.courses);

    items.forEach((item) => {
        const lines = [
            { text: item.name, size: 14, color: COLORS.heading, gapAfter: 3 }
        ];

        ensureSpace(doc, Math.min(estimateEntryHeight(doc, ctx, lines), doc.page.height - (PAGE_MARGIN * 2)));
        lines.forEach((line) => writeText(doc, ctx, line.text, line));
        writeField(doc, ctx, ctx.labels.institution, item.institution, { labelSize: 10, valueSize: 11, gapAfter: 3 });
        writeField(doc, ctx, ctx.labels.year, item.year, { labelSize: 10, valueSize: 11, gapAfter: 8 });
    });
}

function writeListSection(doc, ctx, title, items) {
    if (!items.length) return;
    writeSectionTitle(doc, ctx, title);

    items.forEach((item, index) => {
        writeText(doc, ctx, item, {
            size: 11,
            color: COLORS.text,
            gapAfter: index === items.length - 1 ? 8 : 3
        });
    });
}

function drawCv(doc, ctx, cvData) {
    writeHeader(doc, ctx, cvData);
    writeExperienceSection(doc, ctx, cvData.experience);
    writeEducationSection(doc, ctx, cvData.education);
    writeCoursesSection(doc, ctx, cvData.courses);
    writeListSection(doc, ctx, ctx.labels.skills, cvData.skills);
    writeListSection(doc, ctx, ctx.labels.languages, cvData.languages);
}

function createPdfGenerator({
    PDFDocumentLib = PDFDocument,
    fsLib = fs,
    pathLib = path,
    now = () => Date.now(),
    outputDir = resolveOutputDir(pathLib),
    fontPaths = DEFAULT_FONT_PATHS
} = {}) {
    return async function generatePDF(cvData, userId) {
        if (!cvData || typeof cvData !== 'object') {
            throw createPdfError(
                'INVALID_PDF_INPUT',
                'CV data is required before generating a PDF.'
            );
        }

        if (userId === undefined || userId === null || userId === '') {
            throw createPdfError(
                'INVALID_PDF_INPUT',
                'User ID is required before generating a PDF.'
            );
        }

        ensureOutputDir(fsLib, outputDir);
        ensureFontsAvailable(fsLib, fontPaths);

        const savePath = pathLib.join(
            outputDir,
            `CV_${String(userId).replace(/[^\w-]/g, '') || 'user'}_${now()}.pdf`
        );

        const doc = new PDFDocumentLib({
            size: 'A4',
            margin: PAGE_MARGIN,
            info: {
                Title: `${cvData.personal && cvData.personal.name ? cvData.personal.name : 'CV'} Resume`
            }
        });
        const stream = fsLib.createWriteStream(savePath);
        const ctx = createLayoutContext(doc, fontPaths, cvData.lang === 'ar' ? 'ar' : 'en');

        await new Promise((resolve, reject) => {
            let settled = false;

            const fail = (error) => {
                if (settled) return;
                settled = true;
                removePartialFile(fsLib, savePath);
                reject(error);
            };

            const finish = () => {
                if (settled) return;
                settled = true;
                resolve();
            };

            doc.on('error', (error) => {
                fail(createPdfError(
                    'PDF_LAYOUT_FAILED',
                    'Failed while composing the PDF layout.',
                    { cause: error }
                ));
            });

            stream.on('error', (error) => {
                fail(createPdfError(
                    'PDF_FILE_NOT_CREATED',
                    'Failed to write PDF file to disk.',
                    { cause: error, savePath }
                ));
            });

            stream.on('finish', finish);

            doc.pipe(stream);

            try {
                drawCv(doc, ctx, cvData);
                doc.end();
            } catch (error) {
                fail(error && error.code ? error : createPdfError(
                    'PDF_LAYOUT_FAILED',
                    'Failed while composing the PDF layout.',
                    { cause: error }
                ));
                try {
                    doc.end();
                } catch (endError) {
                    // Ignore secondary end failures.
                }
            }
        });

        assertPdfWritten(fsLib, savePath);
        return savePath;
    };
}

const generatePDF = createPdfGenerator();

module.exports = {
    DEFAULT_FONT_PATHS,
    createPdfError,
    createPdfGenerator,
    formatTextForPdf,
    generatePDF
};
