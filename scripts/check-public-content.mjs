import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const excludedDirectories = new Set(['.git', 'node_modules', 'Pods', 'DerivedData'])
const excludedFiles = new Set(['package-lock.json'])
const forbiddenFileNames = /(^|\/)\.env(?:\.|$)/
const forbiddenContent = [
  { label: 'GitHub access token', pattern: /gh[pousr]_[A-Za-z0-9]{20,}/ },
  { label: 'private key', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { label: 'live payment secret', pattern: /sk_live_[A-Za-z0-9]{12,}/ },
  { label: 'Sentry-style DSN', pattern: /https:\/\/[a-f0-9]{16,}@[A-Za-z0-9.-]+\/\d+/i },
]

async function collectFiles(directory) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue
    const absolutePath = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await collectFiles(absolutePath)))
    else if (!excludedFiles.has(entry.name)) files.push(absolutePath)
  }
  return files
}

const failures = []
for (const file of await collectFiles(root)) {
  const relativePath = path.relative(root, file)
  if (forbiddenFileNames.test(relativePath)) {
    failures.push(`${relativePath}: environment file must not be public`)
    continue
  }
  const content = await readFile(file, 'utf8').catch(() => '')
  for (const rule of forbiddenContent) {
    if (rule.pattern.test(content)) failures.push(`${relativePath}: ${rule.label}`)
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'))
  process.exitCode = 1
} else {
  console.log('Public-content check passed')
}
