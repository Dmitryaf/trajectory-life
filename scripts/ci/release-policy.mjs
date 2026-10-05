export const releaseTargets = {
  develop: { environment: 'preview', projectRef: 'toieenyfwogplcmobfla', alias: 'trajectory-life-staging-trajectory3.vercel.app' },
  main: { environment: 'production', projectRef: 'pvcitldyssqhcdmkqahj', alias: 'trajectory-app-lilac.vercel.app' },
};

export function environmentPullArgs(branch) {
  if (!Object.hasOwn(releaseTargets, branch)) {
    throw new Error('Unsupported release source');
  }
  const { environment } = releaseTargets[branch];
  return ['pull', '--yes', `--environment=${environment}`, ...(environment === 'preview' ? [`--git-branch=${branch}`] : [])];
}

export function candidateDeploymentArgs(branch, sha, runId) {
  if (!Object.hasOwn(releaseTargets, branch) || !/^[a-f0-9]{40}$/.test(sha) || !/^\d+$/.test(String(runId))) {
    throw new Error('Unsupported deployment source');
  }
  return [
    'deploy',
    '--prebuilt',
    '--yes',
    ...(branch === 'main' ? ['--prod', '--skip-domain'] : ['--target=preview']),
    '--meta',
    'githubDeployment=1',
    '--meta',
    `githubCommitRef=${branch}`,
    '--meta',
    `githubCommitSha=${sha}`,
    '--meta',
    `sourceSha=${sha}`,
    '--meta',
    `ciRun=${runId}`,
  ];
}

export function assertReleaseRun(run, repository, sha, branch, currentSha) {
  if (!releaseTargets[branch] || !/^[a-f0-9]{40}$/.test(sha)) {
    throw new Error('Unsupported release source');
  }
  if (run.event !== 'push' || run.path !== '.github/workflows/ci.yml' || run.head_repository?.full_name !== repository) {
    throw new Error('Only the repository push CI can authorize deployment');
  }
  if (run.status !== 'completed' || run.conclusion !== 'success' || run.head_sha !== sha || run.head_branch !== branch) {
    throw new Error('The exact release commit has not passed CI');
  }
  if (currentSha !== sha) {
    throw new Error('A newer branch commit superseded this release');
  }
}

export function deploymentUrl(value) {
  const url = new URL(value.startsWith('https://') ? value : `https://${value}`);
  if (
    url.protocol !== 'https:' ||
    !url.hostname.endsWith('.vercel.app') ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('Unexpected deployment URL');
  }
  return url.origin;
}

export function assertDeployment(deployment, projectId, sha) {
  if (deployment.projectId !== projectId || deployment.readyState !== 'READY' || !deployment.id) {
    throw new Error('Deployment is not ready in the expected project');
  }
  deploymentUrl(deployment.url);
  if (sha && deployment.meta?.sourceSha !== sha) {
    throw new Error('Deployment source metadata does not match checked commit');
  }
}

export async function promoteVerified({ candidate, previous, sha, projectId }, actions) {
  assertDeployment(candidate, projectId, sha);
  assertDeployment(previous, projectId);
  try {
    const before = await actions.inspectAlias();
    if (before.id !== previous.id) {
      throw new Error('Canonical deployment changed before promotion');
    }
    await actions.smoke(deploymentUrl(candidate.url));
    await actions.assertCurrent();
    if ((await actions.inspectAlias()).id !== previous.id) {
      throw new Error('Canonical deployment changed during candidate verification');
    }
    await actions.promote(candidate);
    await actions.verifyAlias(candidate);
  } catch (error) {
    // An ambiguous promotion response can still mean the alias moved. Restore
    // only our own candidate, never overwrite a third-party/newer deployment.
    const current = await actions.inspectAlias();
    if (current.id === candidate.id) {
      await actions.promote(previous);
      await actions.verifyAlias(previous);
    }
    throw error;
  }
}
