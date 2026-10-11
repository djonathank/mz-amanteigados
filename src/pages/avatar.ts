export const AVATAR_STORAGE_KEY = 'mz_avatar_image'
export const AVATAR_DEFAULT = '/assets/mz-gestao-icon.svg'

export const carregarAvatar = () => localStorage.getItem(AVATAR_STORAGE_KEY) || AVATAR_DEFAULT
