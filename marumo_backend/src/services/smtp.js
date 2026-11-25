import nodemailer from 'nodemailer';

export function createSmtpTransport({ host, port, secure, user, pass }) {
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user ? { user, pass } : undefined,
  });
}

function escapeHtml(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function buildVerificationMessage({ from, to, verificationUrl }) {
  const link = verificationUrl ? escapeHtml(verificationUrl) : '';
  const html = [
    '<div style="margin:0;padding:32px 16px;background-color:#F6EAEC;font-family:Arial,Helvetica,sans-serif;">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 6px 24px rgba(43,35,32,0.12);">',
    '<tr><td style="background-color:#2B2320;padding:30px 28px 24px;text-align:center;border-bottom:4px solid #8E1B2C;">',
    '<div style="color:#F6EAEC;font-size:26px;font-weight:bold;letter-spacing:8px;">MARUMO</div>',
    '<div style="color:#D6A0A8;font-size:11px;letter-spacing:6px;margin-top:6px;">C I N E M A</div>',
    '</td></tr>',
    '<tr><td style="padding:32px 32px 8px;">',
    '<h1 style="margin:0 0 14px;font-size:21px;color:#2B2320;">Xác thực email của bạn</h1>',
    '<p style="margin:0 0 24px;font-size:14px;color:#374151;line-height:1.7;">Chào mừng bạn đến với MARUMO Cinema! Bấm nút bên dưới để kích hoạt tài khoản. Liên kết có hiệu lực trong <strong style="color:#8E1B2C;">30 phút</strong> và chỉ dùng một lần.</p>',
    link
      ? '<table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr><td align="center" style="padding-bottom:26px;">'
        + `<a href="${link}" style="display:inline-block;padding:14px 36px;background-color:#8E1B2C;color:#ffffff;text-decoration:none;border-radius:10px;font-size:15px;font-weight:bold;letter-spacing:0.5px;">Xác thực email</a>`
        + '</td></tr></table>'
      : '',
    '</td></tr>',
    '<tr><td style="padding:0 32px 30px;">',
    '<p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.7;">Bạn không yêu cầu tạo tài khoản? Hãy bỏ qua thư này — tài khoản chưa xác thực không thể đăng nhập và liên kết sẽ tự hết hạn.</p>',
    '</td></tr>',
    '<tr><td style="background-color:#F6EAEC;padding:16px;text-align:center;border-top:1px solid #D6A0A8;">',
    '<span style="font-size:11px;color:#8a7f7a;">Thư tự động từ MARUMO Cinema — không trả lời thư này.</span>',
    '</td></tr>',
    '</table>',
    '</div>',
  ].filter(Boolean).join('');
  const text = [
    'Chào mừng bạn đến với MARUMO Cinema!',
    '',
    'Bấm liên kết sau để kích hoạt tài khoản (hiệu lực 30 phút, dùng một lần):',
    verificationUrl ? verificationUrl : undefined,
    '',
    'Bạn không yêu cầu tạo tài khoản? Hãy bỏ qua thư này — tài khoản chưa xác thực không thể đăng nhập và liên kết sẽ tự hết hạn.',
  ].filter((line) => line !== undefined).join('\n');
  return {
    from,
    to,
    subject: 'Xác thực email MARUMO',
    text,
    html,
  };
}
