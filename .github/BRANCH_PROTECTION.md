# Main Branch Protection

Apply these settings to the `main` branch after the workflows in this package have completed successfully at least once.

Required pull-request controls:

- Require a pull request before merging.
- Require at least one approving review.
- Dismiss stale approvals when new commits are pushed.
- Require review from Code Owners when a CODEOWNERS file is introduced.
- Require conversation resolution.
- Require branches to be up to date before merging.
- Block force pushes and branch deletion.

Required status checks:

- `CI / quality`
- `CI / migration-fresh`
- `CI / migration-upgrade`

For pull requests that change Compose, Dockerfiles, applications, or packages, also require a successful `Docker E2E / compose-smoke` run before merge. Because that workflow is path-filtered, do not configure it as a universal required context unless the path filter is removed.

Branch protection is a repository-side GitHub setting and cannot be enforced by extracting a source archive. An administrator must enable it in repository settings after the workflow check names exist.
