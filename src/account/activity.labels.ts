const LABELS: Record<string, string> = {
  'auth.register': 'Akun dibuat',
  'auth.email_verified': 'Email diverifikasi',
  'auth.sign_in': 'Masuk',
  'auth.sign_in_failed': 'Percobaan masuk gagal',
  'auth.sign_out': 'Keluar',
  'auth.password_reset_requested': 'Permintaan atur ulang password',
  'auth.password_reset': 'Password diatur ulang',
  'auth.password_changed': 'Password diganti',
  'account.profile_completed': 'Profil akun dilengkapi',
  'account.profile_added': 'Profil ditambahkan',
  'account.profile_updated': 'Data akun diperbarui',
  'team.member_created': 'Anggota tim dibuat',
  'team.member_updated': 'Anggota tim diubah',
  'team.member_enabled': 'Anggota tim diaktifkan',
  'team.member_disabled': 'Anggota tim dinonaktifkan',
  'team.member_password_reset': 'Password anggota direset',
  'team.member_deleted': 'Anggota tim dihapus',
  'team.member_email_set': 'Email anggota ditambahkan',
  'team.member_email_removed': 'Email anggota dihapus',
  'team.member_email_verified': 'Email anggota diverifikasi',
}

const DETAILS: Record<string, Record<string, string>> = {
  'auth.sign_in': { password: 'Dengan password', google: 'Dengan Google' },
  'auth.sign_in_failed': { bad_credentials: 'Password salah', locked: 'Akun sedang terkunci sementara' },
}

export const labelOf = (action: string) => LABELS[action] ?? 'Aktivitas lain'

export const detailOf = (action: string, detail: string | null) =>
  detail ? (DETAILS[action]?.[detail] ?? detail) : null