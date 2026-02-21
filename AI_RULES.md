# AGENT INSTRUCTIONS - READ FIRST
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