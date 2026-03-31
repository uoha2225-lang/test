const { Scenes, Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');

const paymentScene = new Scenes.BaseScene('paymentScene');
const SUPPORT_USERNAME = 'CvSupport1';

paymentScene.enter((ctx) => {
    ctx.reply('للاشتراك، يرجى اختيار أحد البنوك المتاحة حالياً:', {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🏦 STC BANK', callback_data: 'BANK_STC' }]
            ]
        }
    });
});

paymentScene.action('BANK_STC', async (ctx) => {
    // Send STC QR Code image
    const imagePath = path.join(__dirname, '../../stc_qr.png'); // Placeholder for user's QR image
    
    // Check if the image exists
    if (fs.existsSync(imagePath)) {
        await ctx.replyWithPhoto({ source: imagePath }, {
            caption: 'يرجى مسح الباركود للتحويل',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '✔️ تم الدفع - متابعة التفعيل', callback_data: 'PAYMENT_VERIFY' }]
                ]
            }
        });
    } else {
        // Fallback to text if the image is missing
        await ctx.reply('يرجى مسح الباركود للتحويل \n\n(ملاحظة للمشرف: لا توجد صورة stc_qr.png في المجلد)', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '✔️ تم الدفع - متابعة التفعيل', callback_data: 'PAYMENT_VERIFY' }]
                ]
            }
        });
    }
    await ctx.answerCbQuery();
});

paymentScene.action('PAYMENT_VERIFY', (ctx) => {
    ctx.reply(`اضغط على زر عرض المعرف الشخصي، ثم أرسله مع صورة الحوالة إلى @${SUPPORT_USERNAME} لإتمام التفعيل:`, {
        reply_markup: {
            inline_keyboard: [
                [{ text: '👤 عرض المعرف الشخصي', callback_data: 'SHOW_ID' }]
            ]
        }
    });
});

paymentScene.action('SHOW_ID', async (ctx) => {
    const telegramId = ctx.from.id;
    
    const message = `
المعرف الخاص بك هو: \`${telegramId}\`
(اضغط على الرقم لنسخه)

بعد نسخ المعرف الشخصي، صور الحوالة وتوجه للحساب هذا ليتم التفعيل:
@${SUPPORT_USERNAME}

*بعد الدخول للمعرف، أرفق الصورة ومعرف ID الخاص بك للتفعيل.*

• **سعر السيرة**: 9.99 ريال
    `;
    
    await ctx.replyWithMarkdown(message);
    
    // Log the action
    const { logAction } = require('../db');
    await logAction(telegramId, 'PAYMENT_REQUEST', `User requested payment info. User ID: ${telegramId}`);

    return ctx.scene.leave();
});

module.exports = paymentScene;
