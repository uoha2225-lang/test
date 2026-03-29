const puppeteer = require('puppeteer');
const Handlebars = require('handlebars');
const fs = require('fs');
const path = require('path');

// Ensure output dir exists
const outputDir = path.join(__dirname, '../../pdf_output');
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

async function generatePDF(cvData, userId) {
    // Determine the language template
    const templateName = cvData.lang === 'ar' ? 'cv_ar.html' : 'cv_en.html';
    const templatePath = path.join(__dirname, `../templates/${templateName}`);
    
    // Read HTML Template
    let htmlContent = fs.readFileSync(templatePath, 'utf8');
    
    // Compile using Handlebars
    const template = Handlebars.compile(htmlContent);
    const finalHtml = template(cvData);
    
    // Launch Puppeteer
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    // Set content and wait for it to load completely
    await page.setContent(finalHtml, {
        waitUntil: 'networkidle0' // Wait for fonts and CSS to load
    });
    
    // Path to save PDF
    const timestamp = new Date().getTime();
    const savePath = path.join(outputDir, `CV_${userId}_${timestamp}.pdf`);
    
    // Generate PDF
    await page.pdf({
        path: savePath,
        format: 'A4',
        printBackground: true,
        margin: { top: '0', right: '0', bottom: '0', left: '0' }
    });
    
    await browser.close();
    
    return savePath;
}

module.exports = { generatePDF };
