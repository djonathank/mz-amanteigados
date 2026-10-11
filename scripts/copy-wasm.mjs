import { cpSync, mkdirSync } from 'node:fs'

mkdirSync('public/assets', { recursive: true })
cpSync('node_modules/sql.js/dist/sql-wasm.wasm', 'public/assets/sql-wasm.wasm')
