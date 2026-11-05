import { describe, expect, it } from 'vitest'
import { buildReminder } from './tdd-reminder-message'

describe('buildReminder', () => {
  it('프로덕션 코드 파일에는 프로덕션용 리마인더를 반환한다', () => {
    const msg = buildReminder('server/generator.ts')
    expect(msg).toContain('프로덕션 코드')
    expect(msg).toContain('tdd.md')
  })

  it('테스트 파일에는 테스트용 리마인더를 반환한다', () => {
    const msg = buildReminder('server/generator.test.ts')
    expect(msg).toContain('테스트 파일')
    expect(msg).toContain('RED')
  })

  it('tsx 테스트 파일도 테스트로 판단한다', () => {
    expect(buildReminder('src/App.test.tsx')).toContain('테스트 파일')
  })

  it('윈도우 경로 구분자도 처리한다', () => {
    expect(buildReminder('src\\hooks\\useX.ts')).toContain('프로덕션 코드')
  })

  it.each([
    'README.md',
    'package.json',
    'src/index.css',
    'index.html',
    'bun.lock',
    'vite.config.ts',
    'eslint.config.js',
    'src/types.d.ts',
  ])('TDD 불필요 파일(%s)은 null을 반환한다', (path) => {
    expect(buildReminder(path)).toBeNull()
  })

  it('빈 경로는 null을 반환한다', () => {
    expect(buildReminder('')).toBeNull()
  })
})
