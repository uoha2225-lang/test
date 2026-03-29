const { Scenes, Markup } = require('telegraf');
const { logAction } = require('../db');
const { generatePDF } = require('../utils/pdfGenerator');
const fs = require('fs');
const path = require('path');

// Helper to check language
const isAr = (ctx) => ctx.session.cvLang === 'ar';

// Terms Step
const stepTerms = async (ctx) => {
    ctx.session.cvData = {
        lang: ctx.session.cvLang,
        personal: {},
        education: [],
        experience: [],
        courses: [],
        skills: [],
        languages: []
    };
    
    // We start the wizard
    const text = isAr(ctx) ? 
        '🔴 الشروط والأحكام:\n\n• المستخدم مسؤول عن صحة المعلومات.\n• البوت مجرد أداة لتصميم السيرة الذاتية.\n• لا نتحمل مسؤولية القبول أو الرفض الوظيفي.\n• لا يوجد استرجاع بعد إنشاء السيرة.' :
        '🔴 Terms & Conditions:\n\n• The user is responsible for the data accuracy.\n• We are not responsible for any job acceptance/rejection.\n• No refunds after CV generation.';
    
    const btn = isAr(ctx) ? '✔️ أوافق على الشروط والأحكام' : '✔️ I AGREE TO T&C';
    
    await ctx.reply(text, {
        reply_markup: {
            inline_keyboard: [
                [{ text: btn, callback_data: 'AGREE_TERMS' }],
                [{ text: isAr(ctx) ? '❌ إلغاء' : '❌ Cancel', callback_data: 'CANCEL_CV' }]
            ]
        }
    });
    
    return ctx.wizard.next();
};

const waitTerms = async (ctx) => {
    if (ctx.callbackQuery && ctx.callbackQuery.data === 'CANCEL_CV') return ctx.scene.leave();
    if (ctx.callbackQuery && ctx.callbackQuery.data === 'AGREE_TERMS') {
        const text = isAr(ctx) ? '[1/18] 👤 أدخل الاسم الرباعي:' : '[1/18] 👤 Enter your Full Name:';
        await ctx.reply(text);
        return ctx.wizard.next();
    }
    return ctx.reply(isAr(ctx) ? 'يجب الموافقة أولاً لاستكمال البيانات.' : 'You must agree to continue.');
};

const stepName = async (ctx) => {
    if (!ctx.message || !ctx.message.text) return;
    ctx.session.cvData.personal.name = ctx.message.text;
    await ctx.reply(isAr(ctx) ? '[2/18] 📞 رقم الجوال:' : '[2/18] 📞 Phone Number:');
    return ctx.wizard.next();
};

const stepPhone = async (ctx) => {
    if (!ctx.message || !ctx.message.text) return;
    ctx.session.cvData.personal.phone = ctx.message.text;
    await ctx.reply(isAr(ctx) ? '[3/18] 📧 البريد الإلكتروني:' : '[3/18] 📧 Email Address:');
    return ctx.wizard.next();
};

const stepEmail = async (ctx) => {
    if (!ctx.message || !ctx.message.text) return;
    ctx.session.cvData.personal.email = ctx.message.text;
    
    const skipBtn = isAr(ctx) ? 'تخطي ⏭' : 'Skip ⏭';
    await ctx.reply(isAr(ctx) ? '[4/18] 📍 المدينة (اختياري):' : '[4/18] 📍 City (Optional):', {
        reply_markup: { inline_keyboard: [[{ text: skipBtn, callback_data: 'SKIP_CITY' }]] }
    });
    return ctx.wizard.next();
};

const stepCity = async (ctx) => {
    if (ctx.callbackQuery && ctx.callbackQuery.data === 'SKIP_CITY') {
        ctx.session.cvData.personal.city = '';
    } else if (ctx.message && ctx.message.text) {
        ctx.session.cvData.personal.city = ctx.message.text;
    } else {
        return;
    }
    
    await ctx.reply(isAr(ctx) ? '[5/18] 🎓 التعليم - المؤهل (ثانوي / دبلوم / بكالوريوس):' : '[5/18] 🎓 Education - Degree:');
    ctx.session.tempEdu = {};
    return ctx.wizard.next();
};

const stepEduDegree = async (ctx) => {
    if (!ctx.message || !ctx.message.text) return;
    ctx.session.tempEdu.degree = ctx.message.text;
    await ctx.reply(isAr(ctx) ? '[6/18] 📚 التخصص:' : '[6/18] 📚 Major:');
    return ctx.wizard.next();
};

const stepEduMajor = async (ctx) => {
    if (!ctx.message || !ctx.message.text) return;
    ctx.session.tempEdu.major = ctx.message.text;
    await ctx.reply(isAr(ctx) ? '[7/18] 🏫 اسم الجهة التعليمية:' : '[7/18] 🏫 Institution Name:');
    return ctx.wizard.next();
};

const stepEduInst = async (ctx) => {
    if (!ctx.message || !ctx.message.text) return;
    ctx.session.tempEdu.institution = ctx.message.text;
    await ctx.reply(isAr(ctx) ? '[8/18] 📊 المعدل:' : '[8/18] 📊 GPA / Grade:');
    return ctx.wizard.next();
};

const stepEduGpa = async (ctx) => {
    if (!ctx.message || !ctx.message.text) return;
    ctx.session.tempEdu.gpa = ctx.message.text;
    
    const skipBtn = isAr(ctx) ? 'تخطي ⏭' : 'Skip ⏭';
    await ctx.reply(isAr(ctx) ? '[9/18] 📜 هل يوجد تصنيف / هيئة؟ (اختياري):' : '[9/18] 📜 Any certifications / Boards? (Optional):', {
        reply_markup: { inline_keyboard: [[{ text: skipBtn, callback_data: 'SKIP_CERT' }]] }
    });
    return ctx.wizard.next();
};

const stepEduCert = async (ctx) => {
    if (ctx.callbackQuery && ctx.callbackQuery.data === 'SKIP_CERT') {
        ctx.session.tempEdu.cert = '';
    } else if (ctx.message && ctx.message.text) {
        ctx.session.tempEdu.cert = ctx.message.text;
    } else return;

    ctx.session.cvData.education.push(ctx.session.tempEdu);
    
    const btnAdd = isAr(ctx) ? '➕ إضافة تعليم/مؤهل آخر' : '➕ Add Another Education';
    const btnNext = isAr(ctx) ? '⏭ التالي (الخبرات)' : '⏭ Next (Experience)';
    
    await ctx.reply(isAr(ctx) ? 'تم حفظ المؤهل' : 'Education saved', {
        reply_markup: {
            inline_keyboard: [
                [{ text: btnAdd, callback_data: 'ADD_EDU' }],
                [{ text: btnNext, callback_data: 'NEXT_EXP' }]
            ]
        }
    });
    return ctx.wizard.next();
};

const waitEduMore = async (ctx) => {
    if (ctx.callbackQuery && ctx.callbackQuery.data === 'ADD_EDU') {
        ctx.session.tempEdu = {};
        await ctx.reply(isAr(ctx) ? '[5/18] 🎓 التعليم - المؤهل (ثانوي / دبلوم / بكالوريوس):' : '[5/18] 🎓 Education - Degree:');
        ctx.wizard.selectStep(ctx.wizard.cursor - 5); // Go back to degree
    } else if (ctx.callbackQuery && ctx.callbackQuery.data === 'NEXT_EXP') {
        const skipExpBtn = isAr(ctx) ? 'تخطي الخبرات' : 'Skip Experience';
        await ctx.reply(isAr(ctx) ? '[10/18] 💼 الخبرات - اسم الوظيفة:' : '[10/18] 💼 Experience - Job Title:', {
            reply_markup: { inline_keyboard: [[{ text: skipExpBtn, callback_data: 'SKIP_ALL_EXP' }]]}
        });
        ctx.session.tempExp = {};
        return ctx.wizard.next();
    }
};

const stepExpTitle = async (ctx) => {
    if (ctx.callbackQuery && ctx.callbackQuery.data === 'SKIP_ALL_EXP') {
        // Skip straight to Courses
        await ctx.reply(isAr(ctx) ? '[14/18] 📜 الدورات - اسم الدورة أو تخطي:' : '[14/18] 📜 Courses - Course Name or Skip:', {
             reply_markup: { inline_keyboard: [[{ text: isAr(ctx)?'تخطي الدورات':'Skip Courses', callback_data:'SKIP_COURSES' }]]}
        });
        ctx.wizard.selectStep(ctx.wizard.cursor + 5); 
        return;
    }
    if (!ctx.message || !ctx.message.text) return;
    ctx.session.tempExp.title = ctx.message.text;
    await ctx.reply(isAr(ctx) ? '[11/18] 🏢 جهة العمل:' : '[11/18] 🏢 Company/Organization:');
    return ctx.wizard.next();
};

const stepExpCompany = async (ctx) => {
    if (!ctx.message || !ctx.message.text) return;
    ctx.session.tempExp.company = ctx.message.text;
    await ctx.reply(isAr(ctx) ? '[12/18] ⏳ مدة العمل (مثال: 2020 - 2022):' : '[12/18] ⏳ Duration (e.g. 2020 - 2022):');
    return ctx.wizard.next();
};

const stepExpDuration = async (ctx) => {
    if (!ctx.message || !ctx.message.text) return;
    ctx.session.tempExp.duration = ctx.message.text;
    await ctx.reply(isAr(ctx) ? '[13/18] 📝 وصف بسيط عن مهامك:' : '[13/18] 📝 Short description of tasks:');
    return ctx.wizard.next();
};

const stepExpDesc = async (ctx) => {
    if (!ctx.message || !ctx.message.text) return;
    ctx.session.tempExp.description = ctx.message.text;
    ctx.session.cvData.experience.push(ctx.session.tempExp);
    
    const btnAdd = isAr(ctx) ? '➕ إضافة خبرة' : '➕ Add Experience';
    const btnNext = isAr(ctx) ? '⏭ التالي (الدورات)' : '⏭ Next (Courses)';
    
    await ctx.reply(isAr(ctx) ? 'تم حفظ الخبرة' : 'Experience saved', {
        reply_markup: {
            inline_keyboard: [
                [{ text: btnAdd, callback_data: 'ADD_EXP' }],
                [{ text: btnNext, callback_data: 'NEXT_COURSE' }]
            ]
        }
    });
    return ctx.wizard.next();
};

const waitExpMore = async (ctx) => {
    if (ctx.callbackQuery && ctx.callbackQuery.data === 'ADD_EXP') {
        ctx.session.tempExp = {};
        await ctx.reply(isAr(ctx) ? '[10/18] 💼 الخبرات - اسم الوظيفة:' : '[10/18] 💼 Experience - Job Title:');
        ctx.wizard.selectStep(ctx.wizard.cursor - 4);
    } else if (ctx.callbackQuery && ctx.callbackQuery.data === 'NEXT_COURSE') {
        await ctx.reply(isAr(ctx) ? '[14/18] 📜 الدورات - اسم الدورة (اختياري، أو اضغط التالي):' : '[14/18] 📜 Courses - Course Name (or Skip):', {
            reply_markup: { inline_keyboard: [[{ text: isAr(ctx) ? 'تخطي الدورات ⏭' : 'Skip Courses ⏭', callback_data: 'SKIP_COURSES' }]] }
        });
        ctx.session.tempCourse = {};
        return ctx.wizard.next();
    }
};

const stepCourseName = async (ctx) => {
    if (ctx.callbackQuery && ctx.callbackQuery.data === 'SKIP_COURSES') {
        await ctx.reply(isAr(ctx) ? '[17/18] 🛠 المهارات (مثال: العمل الجماعي - القيادة)، افصل بينها بفاصلة أو اضغط تخطي:' : '[17/18] 🛠 Skills (e.g. Leadership, Teamwork), separated by commas or skip:', {
            reply_markup: { inline_keyboard: [[{ text: isAr(ctx)?'تخطي المهارات':'Skip Skills', callback_data:'SKIP_SKILLS' }]]}
        });
        ctx.wizard.selectStep(ctx.wizard.cursor + 4); 
        return;
    }
    if (!ctx.message || !ctx.message.text) return;
    ctx.session.tempCourse.name = ctx.message.text;
    await ctx.reply(isAr(ctx) ? '[15/18] 🏢 جهة اصدار الدورة:' : '[15/18] 🏢 Institution issuing the course:');
    return ctx.wizard.next();
};

const stepCourseInst = async (ctx) => {
    if (!ctx.message || !ctx.message.text) return;
    ctx.session.tempCourse.institution = ctx.message.text;
    await ctx.reply(isAr(ctx) ? '[16/18] 📅 سنة الدورة:' : '[16/18] 📅 Year:');
    return ctx.wizard.next();
};

const stepCourseYear = async (ctx) => {
    if (!ctx.message || !ctx.message.text) return;
    ctx.session.tempCourse.year = ctx.message.text;
    ctx.session.cvData.courses.push(ctx.session.tempCourse);
    
    const btnAdd = isAr(ctx) ? '➕ إضافة دورة' : '➕ Add Course';
    const btnNext = isAr(ctx) ? '⏭ التالي (المهارات)' : '⏭ Next (Skills)';
    
    await ctx.reply(isAr(ctx) ? 'تم حفظ الدورة' : 'Course saved', {
        reply_markup: {
            inline_keyboard: [
                [{ text: btnAdd, callback_data: 'ADD_COURSE' }],
                [{ text: btnNext, callback_data: 'NEXT_SKILLS' }]
            ]
        }
    });
    return ctx.wizard.next();
};

const waitCourseMore = async (ctx) => {
    if (ctx.callbackQuery && ctx.callbackQuery.data === 'ADD_COURSE') {
        ctx.session.tempCourse = {};
        await ctx.reply(isAr(ctx) ? '[14/18] 📜 الدورات - اسم الدورة:' : '[14/18] 📜 Courses - Course Name:');
        ctx.wizard.selectStep(ctx.wizard.cursor - 3);
    } else if (ctx.callbackQuery && ctx.callbackQuery.data === 'NEXT_SKILLS') {
        await ctx.reply(isAr(ctx) ? '[17/18] 🛠 المهارات (مثال: العمل الجماعي - القيادة)، افصل بينها بفاصلة (اختياري) أو تخطي:' : '[17/18] 🛠 Skills (e.g. Leadership, Teamwork), separated by commas or skip:', {
            reply_markup: { inline_keyboard: [[{ text: isAr(ctx) ? 'تخطي المهارات ⏭' : 'Skip Skills ⏭', callback_data: 'SKIP_SKILLS' }]] }
        });
        return ctx.wizard.next();
    }
};

const stepSkills = async (ctx) => {
    if (ctx.callbackQuery && ctx.callbackQuery.data === 'SKIP_SKILLS') {
        // Skip
    } else if (ctx.message && ctx.message.text) {
        ctx.session.cvData.skills = ctx.message.text.split(/[,،-]/).map(s => s.trim()).filter(s => s);
    } else return;
    
    await ctx.reply(isAr(ctx) ? '[18/18] 🌍 اللغات (مثال: عربي - ممتاز، إنجليزي - جيد)، أو تخطي:' : '[18/18]🍔 🌍 Languages (e.g. Arabic - Native, English - Good), or skip:', {
        reply_markup: { inline_keyboard: [[{ text: isAr(ctx) ? 'تخطي اللغات ⏭' : 'Skip Languages ⏭', callback_data: 'SKIP_LANGS' }]] }
    });
    return ctx.wizard.next();
};

const stepLanguages = async (ctx) => {
    if (ctx.callbackQuery && ctx.callbackQuery.data === 'SKIP_LANGS') {
        // Skip
    } else if (ctx.message && ctx.message.text) {
        ctx.session.cvData.languages = ctx.message.text.split(/[,،\n]/).map(s => s.trim()).filter(s => s);
    } else return;
    
    // Preview
    const d = ctx.session.cvData;
    let summary = isAr(ctx) ? '📋 **معاينة السيرة الذاتية:**\n\n' : '📋 **CV Preview:**\n\n';
    summary += `👤: ${d.personal.name} | ${d.personal.phone}\n`;
    summary += `🎓 المؤهلات: ${d.education.length} \n💼 الخبرات: ${d.experience.length}\n`;
    
    // Send template image
    const tmplPath = path.join(__dirname, '../../template_example.png'); // placeholder
    
    if (fs.existsSync(tmplPath)) {
        await ctx.replyWithPhoto({ source: tmplPath }, { caption: '📄 القالب المعتمد لهذه السيرة' });
    }
    
    await ctx.reply(summary, {
        reply_markup: {
            inline_keyboard: [
                [{ text: isAr(ctx) ? '✔️ تأكيد وإنشاء PDF' : '✔️ Confirm & Generate PDF', callback_data: 'GENERATE_PDF' }],
                [{ text: isAr(ctx) ? '❌ إلغاء العملية' : '❌ Cancel', callback_data: 'CANCEL_CV' }]
            ]
        }
    });
    
    return ctx.wizard.next();
};

const stepGenerate = async (ctx) => {
    if (ctx.callbackQuery && ctx.callbackQuery.data === 'CANCEL_CV') {
        ctx.reply(isAr(ctx) ? 'تم الغاء العملية.' : 'Canceled.');
        return ctx.scene.leave();
    }
    if (ctx.callbackQuery && ctx.callbackQuery.data === 'GENERATE_PDF') {
        await ctx.reply(isAr(ctx) ? '⏳ جاري إنشاء ملف PDF... (قد يستغرق 10 ثواني)' : '⏳ Generating PDF... (May take 10 seconds)');
        try {
            const pdfPath = await generatePDF(ctx.session.cvData, ctx.from.id);
            await ctx.replyWithDocument({ source: pdfPath, filename: `Resume_${ctx.session.cvData.personal.name.replace(/\s/g,'_')}.pdf` });
            await logAction(ctx.from.id, 'CV_GENERATED', 'Generated CV successfully.');
            
            // Delete temp generated file
            setTimeout(() => {
                if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
            }, 60000);
            
        } catch (err) {
            console.error(err);
            await ctx.reply(isAr(ctx) ? '❌ حدث خطأ أثناء إنشاء السيرة الذاتية.' : '❌ Error generating PDF.');
        }
        return ctx.scene.leave();
    }
};


const cvWizard = new Scenes.WizardScene(
    'cvWizard',
    stepTerms,      // 0
    waitTerms,      // 1
    stepName,       // 2
    stepPhone,      // 3
    stepEmail,      // 4
    stepCity,       // 5
    stepEduDegree,  // 6
    stepEduMajor,   // 7
    stepEduInst,    // 8
    stepEduGpa,     // 9
    stepEduCert,    // 10
    waitEduMore,    // 11
    stepExpTitle,   // 12
    stepExpCompany, // 13
    stepExpDuration,// 14
    stepExpDesc,    // 15
    waitExpMore,    // 16
    stepCourseName, // 17
    stepCourseInst, // 18
    stepCourseYear, // 19
    waitCourseMore, // 20
    stepSkills,     // 21
    stepLanguages,  // 22
    stepGenerate    // 23
);

module.exports = cvWizard;
