import { readFileSync } from 'node:fs'
import path from 'node:path'

describe('iOS MMKVCore namespace contract', () => {
  it('qualifies MMKVCore 2 C++ symbols through the mmkv namespace', () => {
    const source = readFileSync(
      path.resolve(
        process.cwd(),
        'ios/Sources/MDKNativeDiagnosticsViewController.mm'
      ),
      'utf8'
    )

    expect(source).toContain(
      'mmkv::MMKV::initializeMMKV(root, mmkv::MMKVLogWarning);'
    )
    expect(source).toContain(
      'mmkv::MMKV *storage = mmkv::MMKV::mmkvWithID('
    )
    expect(source).toContain('mmkv::MMKV_SINGLE_PROCESS')
  })
})
