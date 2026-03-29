const { Scenes, Markup } = require('telegraf');
const { getDB, logAction } = require('../db');

// Main Admin menu
const adminScene = new Scenes.BaseScene('adminScene');

adminScene.enter(async (ctx) => {
    await ctx.reply('مرحباً بك في لوحة تحكم المشرف 🛠', {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🟢 تفعيل مستخدم عبر ID', callback_data: 'ADMIN_ACTIVATE' }],
                [{ text: '📋 عرض السجلات (Logs)', callback_data: 'ADMIN_LOGS' }],
                [{ text: '📊 استعلام عن المستخدمين', callback_data: 'ADMIN_STATS' }],
                [{ text: '🔴 تبنيد / إزالة مستخدم', callback_data: 'ADMIN_BAN' }],
                [{ text: '❌ خروج من اللوحة', callback_data: 'ADMIN_EXIT' }]
            ]
        }
    });
});

adminScene.action('ADMIN_ACTIVATE', (ctx) => {
    ctx.reply('يرجى إرسال رقم الـ ID للمستخدم الذي تود تفعيله (تفعيل الاشتراك): 👇');
    ctx.session.adminStep = 'ACTIVATE';
});

adminScene.action('ADMIN_BAN', (ctx) => {
    ctx.reply('يرجى إرسال رقم الـ ID للمستخدم الذي تود تبنيده (تجريده من البوت): 👇');
    ctx.session.adminStep = 'BAN';
});

adminScene.action('ADMIN_LOGS', async (ctx) => {
    const database = await getDB();
    const rows = await database.all('SELECT * FROM logs ORDER BY created_at DESC LIMIT 10');
    
    if (rows.length === 0) {
        return ctx.reply('لاتوجد أي سجلات حتى الآن.');
    }
    
    let logsMsg = '📋 **آخر السجلات:**\n\n';
    rows.forEach(row => {
        logsMsg += `[${row.created_at}] ID: ${row.telegram_id} - ${row.action}\n`;
    });
    
    return ctx.reply(logsMsg);
});

adminScene.action('ADMIN_STATS', async (ctx) => {
    const database = await getDB();
    const totalUsers = await database.get('SELECT COUNT(*) as count FROM users');
    const subUsers = await database.get('SELECT COUNT(*) as count FROM users WHERE is_subscribed = 1');
    const unsubUsers = await database.get('SELECT COUNT(*) as count FROM users WHERE is_subscribed = 0 AND is_admin = 0');
    
    const msg = `
📊 **إحصائيات المستخدمين:**

👥 عدد المستخدمين الكلي: ${totalUsers.count}
🟢 المشتركين: ${subUsers.count}
🔴 غير المشتركين: ${unsubUsers.count}
    `;
    return ctx.reply(msg);
});

adminScene.action('ADMIN_EXIT', (ctx) => {
    ctx.reply('تم الخروج من لوحة التحكم.');
    return ctx.scene.leave();
});

adminScene.on('text', async (ctx) => {
    const step = ctx.session.adminStep;
    if (!step) return; // ignore random text
    
    const targetId = parseInt(ctx.message.text.trim());
    
    if (isNaN(targetId)) {
        return ctx.reply('الرجاء إدخال رقم ID صحيح.');
    }
    
    const database = await getDB();
    
    if (step === 'ACTIVATE') {
        const res = await database.run('UPDATE users SET is_subscribed = 1 WHERE telegram_id = ?', [targetId]);
        if (res.changes > 0) {
            ctx.reply(`✅ تم تفعيل اشتراك المستخدم: ${targetId}`);
            // Inform the user
            try {
                await ctx.telegram.sendMessage(targetId, '🎉 مبروك! تم تفعيل اشتراكك بنجاح. أرسل /start للبدء في تصميم سيرتك الذاتية.');
            } catch (ignored) {}
        } else {
            ctx.reply(`❌ المستخدم غير موجود في قاعدة البيانات. دعه يضغط /start أولاً.`);
        }
    } else if (step === 'BAN') {
        const res = await database.run('UPDATE users SET banned = 1, is_subscribed = 0 WHERE telegram_id = ?', [targetId]);
        if (res.changes > 0) {
            ctx.reply(`🔴 تم تبنيد المستخدم: ${targetId}`);
        } else {
            ctx.reply(`❌ المستخدم غير موجود في قاعدة البيانات.`);
        }
    }
    
    ctx.session.adminStep = null; // Clear step
});

module.exports = adminScene;
