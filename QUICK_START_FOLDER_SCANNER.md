# Quick Start: Folder Scanner

## Step-by-Step Guide

### Step 1: Open MarkupAI Sidebar
- Click the MarkupAI icon (checklist icon) in the Activity Bar on the left side of VS Code
- The MarkupAI sidebar will open showing the "Folder Scanner" view

### Step 2: Select a Folder
- Click the **folder icon** 📂 in the toolbar at the top of the Folder Scanner view
- A file picker dialog will appear
- Navigate to and select the folder containing your documentation files
- Click "Select Folder to Scan"

### Step 3: View the File Tree
- The Folder Scanner will display a tree view of all supported files in your selected folder
- Supported file types:
  - `.md` (Markdown)
  - `.txt` (Plain text)
  - `.rst` (reStructuredText)
  - `.adoc` (AsciiDoc)
  - `.tex` (LaTeX)

### Step 4: Browse and Select Files (Optional)

**Browse Files:**
- Click on any file name to open it in the editor
- Browse through the folder structure

**Select Files for Checking:**
You have two options:

**Option A: Check specific files**
- Click the **checkmark icon** (◯) next to files to select them
- Selected files will show a filled checkmark icon (✓)
- Click the icon again to deselect
- Or right-click a file and choose "Toggle File Selection"

**Option B: Check all files**
- Skip selection - you'll use "Check All Files" button instead

### Step 5: Run the Check

**For selected files:**
- Click the **"Check Selected Files"** button (▶️ icon) in the toolbar
- Only files with checkmarks will be checked

**For all files:**
- Click the **"Check All Files"** button (▶️▶️ icon) in the toolbar
- All supported files in the folder and subfolders will be checked

### Step 6: Monitor Progress
- A notification will appear showing progress: "Checking file.md (2/10)"
- Wait for all files to complete

### Step 7: View Results
After checking completes:
- **In Folder Scanner**: Each file will show a score emoji and number (e.g., 🟢 95)
- **In Findings Panel**: Switch to the "Findings" panel (bottom) to see all issues across all files
- **Summary Notification**: Shows how many files were checked successfully

### Step 8: Review Issues
- Click "View Findings" in the notification, or
- Manually switch to the Findings panel in the bottom panel
- Click on any issue to jump to that line in the file
- Apply fixes directly from the hover tooltip or quick fix menu

## Toolbar Buttons

| Icon | Button | Action |
|------|--------|--------|
| 📂 | Select Folder to Scan | Choose a new folder |
| 🔄 | Refresh | Reload the file tree |
| ▶️▶️ | Check All Files | Check every file in folder |
| ▶️ | Check Selected Files | Check only selected files |

## Tips

- **Start small**: For your first time, try a folder with just a few files
- **Use selection**: For large folders with 100+ files, select specific files to avoid long wait times
- **Check the Findings**: All issues from all files are aggregated in the Findings panel
- **Re-check**: After fixing issues, run the check again to see improvements in scores
- **Folder persistence**: Your selected folder persists until you close VS Code

## Example Workflow

```
1. Click MarkupAI icon in sidebar
2. Click folder icon → select `/docs` folder
3. Tree shows: README.md, guide.md, api.md
4. Click the checkmark icon next to README.md and guide.md (both show ✓)
5. Click "Check Selected Files"
6. Wait for progress notification
7. See scores: README.md 🟢 92, guide.md 🟡 78
8. Click on "guide.md" file name to open it
9. Review issues in the file and in Findings panel
10. Fix issues in your file
11. Re-run check to verify improvements
```

## Troubleshooting

**Q: No files appear in the tree**
- Make sure your folder contains supported file types (.md, .txt, .rst, .adoc, .tex)
- Hidden folders and files (starting with `.`) are automatically ignored

**Q: "No files selected" error**
- Click the **checkmark icon** next to files (not the file name) to select them
- Or use "Check All Files" instead

**Q: File opens instead of selecting**
- Click the **checkmark icon** (◯/✓) on the left side of the file, not the file name
- The file name opens the file; the icon toggles selection

**Q: Checking takes a long time**
- Each file makes an API call, so large folders take longer
- Select specific files instead of checking all files
- Check 10-20 files at a time for best experience

**Q: Some files failed to check**
- Click "Show Errors" in the notification to see which files failed
- Common causes: file permissions, network issues, or API rate limits
