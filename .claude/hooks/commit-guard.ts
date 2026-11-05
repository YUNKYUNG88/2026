const GIT_COMMIT = /(^|[;&|(]\s*)git\s+(-\S+\s+(\S+\s+)?)*commit(\s|$)/

export function isGitCommit(command: string): boolean {
  return GIT_COMMIT.test(command)
}
