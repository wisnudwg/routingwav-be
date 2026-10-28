export type Mail = { subject: string; text: string }

export const maskEmail = (email: string) => {
  const [user = '', domain = ''] = email.split('@')
  return `${user.charAt(0)}•••@${domain}`
}

export const verifyEmailMail = (p: { name?: string | null; link: string }): Mail => ({
  subject: 'Verifikasi email akun Routing.com',
  text:
    `Halo${p.name ? ` ${p.name}` : ''},\n\n` +
    `Terima kasih sudah mendaftar di Routing.com. Buka tautan berikut untuk mengaktifkan akun Anda (berlaku 24 jam):\n\n${p.link}\n\n` +
    `Jika Anda tidak mendaftar, abaikan email ini.`,
})

export const alreadyRegisteredMail = (p: { signInUrl: string; forgotUrl: string }): Mail => ({
  subject: 'Pendaftaran Routing.com dengan email Anda',
  text:
    `Seseorang mencoba mendaftar di Routing.com dengan alamat email ini, tetapi akun sudah ada.\n\n` +
    `Jika itu Anda, masuk di ${p.signInUrl} atau atur ulang password di ${p.forgotUrl}.\n\n` +
    `Jika bukan Anda, abaikan email ini. Tidak ada perubahan pada akun Anda.`,
})

export const resetPasswordMail = (p: { link: string }): Mail => ({
  subject: 'Atur ulang password Routing.com',
  text:
    `Kami menerima permintaan untuk mengatur ulang password akun Anda. Buka tautan berikut (berlaku 60 menit):\n\n${p.link}\n\n` +
    `Jika bukan Anda yang meminta, abaikan email ini. Password Anda tidak berubah.`,
})

export const passwordChangedMail = (p: { forgotUrl: string }): Mail => ({
  subject: 'Password Routing.com Anda telah diubah',
  text:
    `Password akun Anda baru saja diubah dan semua sesi masuk telah diakhiri.\n\n` +
    `Jika bukan Anda yang melakukannya, segera atur ulang password di ${p.forgotUrl} dan hubungi dukungan kami.`,
})