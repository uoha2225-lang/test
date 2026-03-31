require('dotenv').config({ path: __dirname + '/../.env' });
const { Telegraf, Scenes, session } = require('telegraf');
const { initDB, getUser, createUser } = require('./db');

// Import scenes (will create these next)
const paymentScene = require('./scenes/payment');
const adminScene = require('./scenes/admin');
const cvWizard = require('./scenes/cvWizard');
const SUPPORT_USERNAME = process.env.SUPPORT_USERNAME || 'CvSupport1';

if (!process.env.BOT_TOKEN || process.env.BOT_TOKEN === 'YOUR_BOT_TOKEN_HERE') {
    console.warn('⚠️ WARNING: BOT_TOKEN is missing or not set in .env file!');
    console.warn('⚠️ The bot will not start until you provide a valid bot token from @BotFather.');
    // We intentionally don't process.exit here so the code remains valid, but launch will fail without a token.
}

const bot = new Telegraf(process.env.BOT_TOKEN || 'dummy_token_to_prevent_fatal_crash_on_init');

// Memory Session (State across steps)
bot.use(session());

const stage = new Scenes.Stage([paymentScene, adminScene, cvWizard]);
bot.use(stage.middleware());

bot.start(async (ctx) => {
    const telegramId = ctx.from.id;
    const username = ctx.from.username || ctx.from.first_name || 'Unknown';
    
    // Create/Initialize User in DB
    await createUser(telegramId, username);
    const user = await getUser(telegramId);
    
    if (user && user.banned) {
        return ctx.reply('لقد تم حظرك من استخدام هذا البوت.');
    }
    
    let welcomeMsg = 'مرحباً بك!';
    if (user && user.is_admin) {
        ctx.reply('مرحباً بك أيها المشرف! للدخول للوحة التحكم أرسل /admin أو اضغط على الزر أدناه.', {
            reply_markup: {
                keyboard: [
                    [{ text: '🛠 لوحة التحكم' }],
                    [{ text: 'ابدا الاستخدام' }]
                ],
                resize_keyboard: true
            }
        });
    }

    if (user && !user.is_subscribed && !user.is_admin) {
        // Non-subscribed user -> Payment flow
        return ctx.reply(`أهلاً بك في بوت إنشاء السيرة الذاتية (CV).\n\nسعر إنشاء السيرة هو 9.99 ريال فقط.\nيرجى الاشتراك للبدء.\n\nلإكمال تفعيل الحساب بعد الدفع تواصل مع @${SUPPORT_USERNAME}.`, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '💳 ادفع للاشتراك', callback_data: 'PAYMENT_START' }],
                    [{ text: '✅ تفعيل الحساب عبر الدعم', callback_data: 'ACTIVATE_ADMIN_BTN' }]
                ]
            }
        });
    }

    // Subscribed User Introduction
    let inline_keyboard = [
        [{ text: '🇸🇦 سيرة ذاتية عربي', callback_data: 'START_CV_AR' }],
        [{ text: '🇬🇧 Resume English', callback_data: 'START_CV_EN' }],
        [{ text: '📞 الدعم الفني', url: `https://t.me/${SUPPORT_USERNAME}` }]
    ];
    if (user && !user.is_admin) {
        inline_keyboard.push([{ text: '✅ تفعيل الحساب عبر الدعم', callback_data: 'ACTIVATE_ADMIN_BTN' }]);
    }
    
    ctx.reply('أهلاً 👋\\nجهّز سيرتك الذاتية خلال دقيقتين فقط!', {
        reply_markup: { inline_keyboard }
    });
});

bot.action('PAYMENT_START', (ctx) => ctx.scene.enter('paymentScene'));

bot.action('ACTIVATE_ADMIN_BTN', (ctx) => {
    ctx.reply(`لتفعيل الحساب، تواصل مباشرة مع الدعم عبر الحساب التالي:\n@${SUPPORT_USERNAME}\n\nأرسل صورة الحوالة ومعرفك الشخصي (ID) ليتم التفعيل بسرعة.`);
    ctx.answerCbQuery();
});

bot.action(/START_CV_(AR|EN)/, (ctx) => {
    const lang = ctx.match[1].toLowerCase();
    ctx.session.cvLang = lang;
    return ctx.scene.enter('cvWizard');
});

bot.hears(['ابدا الاستخدام', '/start'], async (ctx) => {
     // Re-trigger start logic
     const user = await getUser(ctx.from.id);
     if (user && user.is_subscribed) {
         let inline_keyboard = [
             [{ text: '🇸🇦 سيرة ذاتية عربي', callback_data: 'START_CV_AR' }],
             [{ text: '🇬🇧 Resume English', callback_data: 'START_CV_EN' }],
             [{ text: '📞 الدعم الفني', url: `https://t.me/${SUPPORT_USERNAME}` }]
         ];
         if (!user.is_admin) {
             inline_keyboard.push([{ text: '✅ تفعيل الحساب عبر الدعم', callback_data: 'ACTIVATE_ADMIN_BTN' }]);
         }
         ctx.reply('أهلاً 👋\\nجهّز سيرتك الذاتية خلال دقيقتين فقط!', {
            reply_markup: { inline_keyboard }
        });
     }
});

bot.hears('🛠 لوحة التحكم', async (ctx) => {
    const user = await getUser(ctx.from.id);
    if (user && user.is_admin) {
        ctx.scene.enter('adminScene');
    }
});

bot.command('admin', async (ctx) => {
    const user = await getUser(ctx.from.id);
    if (user && user.is_admin) {
        ctx.scene.enter('adminScene');
    }
});

// Secret Admin Code
bot.hears('ADMINOFBOT@!>j', async (ctx) => {
    const db = require('./db').getDB; 
    const database = await db();
    await database.run('UPDATE users SET is_admin = 1, is_subscribed = 1 WHERE telegram_id = ?', [ctx.from.id]);
    ctx.reply('✅ تم تفعيل حسابك كمسؤول (أدمن). يمكنك الآن الدخول للوحة التحكم باستخدام /admin أو زر (لوحة التحكم)');
});

// Global Error Handler
bot.catch((err, ctx) => {
    console.error(`Error for ${ctx.updateType}:`, err);
});

async function startBot() {
    await initDB();
    console.log('Database initialized.');
    
    if (process.env.BOT_TOKEN && process.env.BOT_TOKEN !== 'YOUR_BOT_TOKEN_HERE') {
        await bot.launch({ dropPendingUpdates: true });
        console.log('Telegram Bot is successfully launched! 🚀');
    } else {
        console.error('BOT_TOKEN is missing. Exiting process.');
        process.exit(1);
    }
}

startBot();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
process.on('unhandledRejection', (error) => {
    console.error('Unhandled rejection:', error);
    process.exit(1);
});
process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    process.exit(1);
});

module.exports = bot;
