import type { Mail } from './mailer.ts';

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

/** Layout único nas cores Gruvbox do blog. Estilos inline: clientes de e-mail ignoram <style>. */
function layout(title: string, paragraphs: string[], button: { label: string; href: string }, footer: string) {
  const p = (t: string) => `<p style="margin:0 0 16px;line-height:1.6">${t}</p>`;
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#1d2021;padding:32px 16px;font-family:ui-monospace,Menlo,Consolas,monospace;color:#ebdbb2">
<table role="presentation" width="100%" style="max-width:520px;margin:0 auto;background:#282828;border:1px solid #3c3836;border-radius:6px">
<tr><td style="padding:28px">
<p style="margin:0 0 24px;font-weight:700;color:#fe8019">barbosa.md</p>
<h1 style="margin:0 0 16px;font-size:20px;color:#ebdbb2">${escape(title)}</h1>
${paragraphs.map(p).join('')}
<p style="margin:24px 0"><a href="${escape(button.href)}" style="display:inline-block;background:#fe8019;color:#1d2021;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:700">${escape(button.label)}</a></p>
<p style="margin:0;font-size:12px;line-height:1.6;color:#a89984">${footer}</p>
</td></tr></table></body></html>`;
}

export function verifyEmailMail(to: string, name: string, link: string): Mail {
  const subject = 'Confirme seu e-mail no barbosa.md';
  return {
    to,
    subject,
    text: `Olá, ${name}!\n\nConfirme seu e-mail para poder comentar nos artigos:\n${link}\n\nO link vale por 24 horas. Se você não criou esta conta, ignore este e-mail.`,
    html: layout(
      'Confirme seu e-mail',
      [`Olá, ${escape(name)}!`, 'Falta só confirmar o e-mail para você poder comentar nos artigos.'],
      { label: 'Confirmar e-mail', href: link },
      'O link vale por 24 horas. Se você não criou esta conta, ignore este e-mail.',
    ),
  };
}

export function resetPasswordMail(to: string, name: string, link: string): Mail {
  const subject = 'Redefinição de senha do barbosa.md';
  return {
    to,
    subject,
    text: `Olá, ${name}!\n\nPara criar uma nova senha, abra:\n${link}\n\nO link vale por 30 minutos e só pode ser usado uma vez. Se você não pediu a troca, ignore este e-mail: sua senha continua a mesma.`,
    html: layout(
      'Redefinir senha',
      [`Olá, ${escape(name)}!`, 'Recebemos um pedido para redefinir a senha da sua conta.'],
      { label: 'Criar nova senha', href: link },
      'O link vale por 30 minutos e só pode ser usado uma vez. Se você não pediu a troca, ignore este e-mail: sua senha continua a mesma.',
    ),
  };
}
