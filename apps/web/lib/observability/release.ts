export type ReleaseMetadata = {
  environment: string;
  commit: string | null;
  version: string | null;
  deploymentTarget: string | null;
  builtAt: string | null;
  githubRunId: string | null;
  githubRunNumber: string | null;
  githubRefName: string | null;
  releasePath: string | null;
};

export function getReleaseMetadata(): ReleaseMetadata {
  return {
    environment: process.env.APP_ENV ?? process.env.NODE_ENV ?? "development",
    commit: process.env.COMMIT_SHA ?? process.env.GITHUB_SHA ?? process.env.NEXT_PUBLIC_APP_VERSION ?? null,
    version: process.env.NEXT_PUBLIC_APP_VERSION ?? null,
    deploymentTarget: process.env.DEPLOYMENT_TARGET ?? null,
    builtAt: process.env.BUILD_TIMESTAMP ?? null,
    githubRunId: process.env.GITHUB_RUN_ID ?? null,
    githubRunNumber: process.env.GITHUB_RUN_NUMBER ?? null,
    githubRefName: process.env.GITHUB_REF_NAME ?? null,
    releasePath: process.env.RELEASE_PATH ?? null
  };
}
