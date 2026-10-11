import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const cliDirectory = dirname(require.resolve('@capacitor/cli'))
const templatePath = resolve(cliDirectory, 'util/template.js')
const template = readFileSync(templatePath, 'utf8')
const incompatibleCall = 'await tar_1.default.extract({ file: src, cwd: dir });'
const compatibleCall = 'await tar_1.extract({ file: src, cwd: dir });'

if (template.includes(compatibleCall)) {
  process.exit(0)
}

if (template.split(incompatibleCall).length !== 2) {
  throw new Error(`Unexpected Capacitor CLI template implementation: ${templatePath}`)
}

writeFileSync(templatePath, template.replace(incompatibleCall, compatibleCall))
