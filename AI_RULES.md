# AGENT INSTRUCTIONS - READ FIRST
## Recent changes
- For each user-facing update or fix, add a concise, non-technical entry to `getRecentChanges_()` in `Code.js`, newest first, using the live release date.
- Include the entry in the same dev testing and live release as its change. Update the date if release is delayed.
- Combine related small fixes; omit routine data entry and individual record corrections. Preserve older entries; the page shows ten initially with an expandable history.

## Release history retention
- When Andy requests a live release on the existing unchanged URL, also commit and push the corresponding source and tests to GitHub. Verify the remote commit and report both the live deployment and GitHub results before calling the release complete. Exclude credentials, real school records, temporary files, backups, and generated evidence from Git commits.
- Keep the current live release and the five previous releases for rollback, plus any older version still required by an active deployment, trigger, or known library consumer.
- Keep a local source backup before publishing. Update the existing live deployment so its URL stays unchanged.
- Review unused Apps Script versions periodically during releases, before approaching Google's version limit. Use the Apps Script project-history UI for version cleanup; the deployment manager has no cleanup command.
- Verify trigger dependencies in the Apps Script Triggers screen as part of cleanup. On 2 October 2026, weeklyFinanceSchedule was observed using live version 214 after the existing deployment was updated from 213; the earlier version 201 reference was obsolete.

**CRITICAL:** I have a custom automation tool. You must use it for all Google Apps Script tasks.

**My Deployment Tool:** "C:\Projects\clasp_manager.bat"

**RULES:**
1. NEVER run `clasp push`, `clasp pull`, or `clasp deploy` directly.
2. ALWAYS use the batch file manager via the commands below.
3. If I ask to "open the menu," run the tool without flags.
4. **DEFAULT ACTION:** Always use `clasp_manager.bat --push` to update the dev link.
5. **RESTRICTED ACTION:** ONLY use `clasp_manager.bat --deploy` (Smart Deploy) if EXPLICITLY requested by the user.

**COMMANDS:**
- **To PUSH code (Safe Mode):**
  run `cmd /c "C:\Projects\clasp_manager.bat --push OrderPortal"`
  *(Use this when I say "save to Google" or "push changes")*

- **To PULL code (Safe Mode):**
  run `cmd /c "C:\Projects\clasp_manager.bat --pull OrderPortal"`
  *(Use this if I say "fetch from Google" or "update local files")*

- **To DEPLOY (Smart Deploy):**
  run `cmd /c "C:\Projects\clasp_manager.bat --deploy OrderPortal"`
  *(Use this ONLY when I say "deploy to live" or "publish new version")*

- **To CHECK LOGIN:**
  run `cmd /c "C:\Projects\clasp_manager.bat --status OrderPortal"`
