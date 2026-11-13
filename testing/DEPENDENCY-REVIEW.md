# Deployment dependency review — 13 November 2026

The project pins clasp 3.4.1, the latest release returned by npm at review time.
An override pins gaxios to 7.3.1 across the Google client dependency tree. This is
the same version already used by google-auth-library, within major version 7.
It removes the older gaxios 7.1.3 dependency on rimraf, glob and minimatch.
The lockfile records the result. Do not remove the override until upstream
dependencies no longer resolve the affected versions.

Validation: 54 offline tests passed, the upload inventory remained exactly 14
application files, and the existing deployment manager successfully fetched the
Google Apps Script deployment list using the updated local dependency tree.

## Remaining scoped advisory

The npm audit now reports two high-severity entries: zod and its parent clasp.
These represent one underlying advisory, [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5),
concerning memory exhaustion when validating oversized constrained collections.
The published fix is Zod 4.6.6; clasp 3.4.1 requires Zod ^3.25.76.
Do not force a Zod major-version override or downgrade clasp merely to clear the
audit, since neither is a compatible upstream fix for the pinned toolchain.

Inspection found clasp's direct Zod usage in its optional MCP server. The local
deployment manager runs ordinary CLI commands (push, deployments, version and
redeploy), not start-mcp-server/mcp. Importing the module does not start a server
or validate remote MCP requests. No portal runtime files depend on Zod, and
node_modules is excluded from Apps Script uploads.

Assessment: retain this documented tooling advisory as non-blocking for the
current CLI deployment workflow. Reassess before enabling clasp's MCP server,
accepting untrusted inputs through tooling, or updating clasp. This is a scoped
risk assessment, not a claim that npm audit is clean or that Zod is patched.

Removed advisory chains:
- [Glob cancellation bypass](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4)
- [Minimatch pattern amplification](https://github.com/advisories/GHSA-g3hv-75wg-m249)
