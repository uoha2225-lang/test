const puppeteer = require('puppeteer');
const Handlebars = require('handlebars');
const fs = require('fs');
const path = require('path');

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

function readTemplate(fsLib, templatePath) {
    try {
        return fsLib.readFileSync(templatePath, 'utf8');
    } catch (error) {
        throw createPdfError(
            'PDF_TEMPLATE_NOT_FOUND',
            'CV HTML template could not be read.',
            { cause: error, templatePath }
        );
    }
}

function renderTemplate(handlebarsLib, htmlContent, cvData) {
    try {
        const template = handlebarsLib.compile(htmlContent);
        return template(cvData);
    } catch (error) {
        throw createPdfError(
            'PDF_TEMPLATE_RENDER_FAILED',
            'Failed to render CV template.',
            { cause: error }
        );
    }
}

function resolveExecutablePath(puppeteerLib, pathLib) {
    const explicitPath = process.env.PUPPETEER_EXECUTABLE_PATH;
    if (explicitPath) {
        return pathLib.isAbsolute(explicitPath) ? explicitPath : pathLib.resolve(explicitPath);
    }

    if (typeof puppeteerLib.executablePath !== 'function') return undefined;

    try {
        const detectedPath = puppeteerLib.executablePath();
        if (!detectedPath) return undefined;
        return pathLib.isAbsolute(detectedPath) ? detectedPath : pathLib.resolve(detectedPath);
    } catch (error) {
        return undefined;
    }
}

function mapBrowserError(error) {
    const message = error && error.message ? error.message.toLowerCase() : '';
    if (
        message.includes('could not find chrome') ||
        message.includes('browser was not found') ||
        message.includes('failed to launch the browser process')
    ) {
        return createPdfError(
            'BROWSER_NOT_FOUND',
            'Chrome executable was not found for Puppeteer.',
            { cause: error }
        );
    }

    return createPdfError(
        'PDF_BROWSER_LAUNCH_FAILED',
        'Failed to launch browser for PDF generation.',
        { cause: error }
    );
}

async function closeQuietly(resource) {
    if (!resource || typeof resource.close !== 'function') return;
    try {
        await resource.close();
    } catch (error) {
        // Ignore cleanup errors so the original failure is preserved.
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

function createPdfGenerator({
    puppeteerLib = puppeteer,
    handlebarsLib = Handlebars,
    fsLib = fs,
    pathLib = path,
    now = () => Date.now(),
    outputDir = resolveOutputDir(pathLib)
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

        const templateName = cvData.lang === 'ar' ? 'cv_ar.html' : 'cv_en.html';
        const templatePath = pathLib.join(__dirname, `../templates/${templateName}`);
        const htmlContent = readTemplate(fsLib, templatePath);
        const finalHtml = renderTemplate(handlebarsLib, htmlContent, cvData);
        const savePath = pathLib.join(outputDir, `CV_${String(userId).replace(/[^\w-]/g, '') || 'user'}_${now()}.pdf`);

        const executablePath = resolveExecutablePath(puppeteerLib, pathLib);
        const launchOptions = {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-first-run',
                '--no-zygote'
            ]
        };

        if (executablePath) {
            launchOptions.executablePath = executablePath;
        }

        let browser;
        let page;

        try {
            try {
                browser = await puppeteerLib.launch(launchOptions);
            } catch (error) {
                throw mapBrowserError(error);
            }

            page = await browser.newPage();
            await page.setContent(finalHtml, {
                waitUntil: 'load',
                timeout: 15000
            });

            if (typeof page.emulateMediaType === 'function') {
                await page.emulateMediaType('screen');
            }

            await page.pdf({
                path: savePath,
                format: 'A4',
                printBackground: true,
                margin: { top: '0', right: '0', bottom: '0', left: '0' }
            });
        } catch (error) {
            if (error && error.code) throw error;
            throw createPdfError(
                'PDF_GENERATION_FAILED',
                'Failed to generate PDF from rendered HTML.',
                { cause: error }
            );
        } finally {
            await closeQuietly(page);
            await closeQuietly(browser);
        }

        assertPdfWritten(fsLib, savePath);
        return savePath;
    };
}

const generatePDF = createPdfGenerator();

module.exports = {
    createPdfError,
    createPdfGenerator,
    generatePDF
};
