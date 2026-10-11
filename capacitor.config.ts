import type { CapacitorConfig } from '@capacitor/cli'
import process from 'node:process'
import { loadEnv } from 'vite'

const appEnv = loadEnv('development', process.cwd(), '')

const config: CapacitorConfig = {
  appId: 'br.com.mzbolachas.gestao',
  appName: 'MZ Gestão',
  webDir: 'dist',
  plugins: {
    GoogleAuth: {
      androidClientId: process.env.GOOGLE_WEB_CLIENT_ID ?? appEnv.GOOGLE_WEB_CLIENT_ID,
      iosClientId: process.env.GOOGLE_IOS_CLIENT_ID ?? appEnv.GOOGLE_IOS_CLIENT_ID,
      serverClientId: process.env.GOOGLE_WEB_CLIENT_ID ?? appEnv.GOOGLE_WEB_CLIENT_ID,
      scopes: ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/drive.file'],
    },
  },
}
export default config
