import { execFileSync } from 'node:child_process'

type PackFile = {
  path: string
}

type PackResult = {
  files: PackFile[]
}

describe('npm package contents', () => {
  it(
    'excludes generated Android build artifacts while keeping Android sources',
    () => {
      const output = execFileSync(
        'npm',
        ['pack', '--dry-run', '--json', '--ignore-scripts'],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
          maxBuffer: 10 * 1024 * 1024,
        }
      )
      const [pack] = JSON.parse(output) as PackResult[]
      const paths = pack.files.map((file) => file.path)
      const generatedAndroidPaths = paths.filter(
        (filePath) =>
          filePath.startsWith('android/.cxx/') ||
          filePath.startsWith('android/build/') ||
          filePath.startsWith('android-gradle-plugin/.gradle/') ||
          filePath.startsWith('android-gradle-plugin/build/')
      )

      expect(paths).toContain('android/build.gradle')
      expect(paths).toContain('android/src/main/AndroidManifest.xml')
      expect(paths).toContain('expo-module.config.json')
      expect(paths).toContain('android-gradle-plugin/build.gradle.kts')
      expect(paths).toContain(
        'android-gradle-plugin/src/main/java/com/mobilediagnosticskit/gradle/MobileDiagnosticsNetworkCapturePlugin.java'
      )
      expect(generatedAndroidPaths.slice(0, 10)).toEqual([])
      expect(generatedAndroidPaths).toHaveLength(0)
    },
    30_000
  )
})
