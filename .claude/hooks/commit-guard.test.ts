import { describe, expect, it } from 'vitest'
import { isGitCommit } from './commit-guard'

describe('isGitCommit', () => {
  it('단순 git commit을 감지한다', () => {
    expect(isGitCommit('git commit -m "feat: x"')).toBe(true)
  })

  it('&&로 이어진 복합 명령의 git commit을 감지한다', () => {
    expect(isGitCommit('git add -A && git commit -m x')).toBe(true)
  })

  it(';로 이어진 복합 명령의 git commit을 감지한다', () => {
    expect(isGitCommit('git add . ; git commit -m x')).toBe(true)
  })

  it('git -C <경로> commit 형태를 감지한다', () => {
    expect(isGitCommit('git -C some/dir commit -m x')).toBe(true)
  })

  it('--amend 커밋도 감지한다', () => {
    expect(isGitCommit('git commit --amend --no-edit')).toBe(true)
  })

  it('git status는 감지하지 않는다', () => {
    expect(isGitCommit('git status --short')).toBe(false)
  })

  it('git log는 감지하지 않는다', () => {
    expect(isGitCommit('git log --oneline -3')).toBe(false)
  })

  it('commit이 들어간 다른 서브커맨드는 감지하지 않는다', () => {
    expect(isGitCommit('git commit-tree abc123')).toBe(false)
  })

  it('git이 아닌 명령은 감지하지 않는다', () => {
    expect(isGitCommit('echo "git commit"')).toBe(false)
  })

  it('빈 문자열은 감지하지 않는다', () => {
    expect(isGitCommit('')).toBe(false)
  })
})
