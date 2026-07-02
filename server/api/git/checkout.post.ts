export default defineEventHandler(async (event) => {
  const body = await readBody<{ path?: string; branch?: string }>(event)
  if (!body?.path) throw createError({ statusCode: 400, statusMessage: 'path is required' })
  if (!body?.branch) throw createError({ statusCode: 400, statusMessage: 'branch is required' })
  // Reject a branch that git would parse as an option (argument injection).
  if (body.branch.trim().startsWith('-')) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid branch name' })
  }

  // Strip a leading "remotes/origin/" so checking out a remote branch creates a
  // local tracking branch of the same short name.
  const target = body.branch.replace(/^remotes\//, '')
  const shortName = target.replace(/^origin\//, '')

  try {
    await runGit(body.path, ['checkout', shortName])
  } catch {
    // Fall back to explicit tracking checkout for remote-only branches.
    await runGit(body.path, ['checkout', '-b', shortName, '--track', target])
  }
  return { ok: true, branch: await currentBranch(body.path) }
})
