import * as vscode from "vscode";
import { MarkupAIClient, MarkupAI } from "@markupai/api";

// ============================================================================
// Types and Interfaces
// ============================================================================

interface ContentIssue {
  id: string;
  startIndex: number;
  endIndex: number;
  type:
    | "spelling"
    | "grammar"
    | "consistency"
    | "clarity"
    | "terminology"
    | "tone";
  category?: string;
  subcategory?: string;
  message: string;
  suggestion: string;
  originalText: string;
  severity: "high" | "medium" | "low";
}

interface ContentScores {
  overall: number;
  grammar: number;
  consistency: number;
  terminology: number;
}

interface CheckResult {
  issues: ContentIssue[];
  scores: ContentScores;
}

interface StyleGuideOption {
  id: string;
  name: string;
  isBuiltIn: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const DIALECTS: { value: MarkupAI.Dialects; label: string }[] = [
  { value: "american_english", label: "American English" },
  { value: "british_english", label: "British English" },
  { value: "canadian_english", label: "Canadian English" },
];

const BUILT_IN_STYLE_GUIDES: StyleGuideOption[] = [
  { id: "ap", name: "AP Style Guide", isBuiltIn: true },
  { id: "chicago", name: "Chicago Manual of Style", isBuiltIn: true },
  { id: "microsoft", name: "Microsoft Style Guide", isBuiltIn: true },
];

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 60; // 2 minutes max

// ============================================================================
// MarkupAI API Client
// ============================================================================

class MarkupAIContentChecker {
  private client: MarkupAIClient;

  constructor(apiToken: string) {
    this.client = new MarkupAIClient({
      token: apiToken,
    });
  }

  async fetchStyleGuides(): Promise<StyleGuideOption[]> {
    try {
      const styleGuides = await this.client.styleGuides.listStyleGuides();
      const customGuides: StyleGuideOption[] = styleGuides.map((guide) => ({
        id: guide.id,
        name: guide.name,
        isBuiltIn: false,
      }));
      return [...BUILT_IN_STYLE_GUIDES, ...customGuides];
    } catch (error) {
      console.error("MarkupAI: Error fetching style guides", error);
      return BUILT_IN_STYLE_GUIDES;
    }
  }

  async checkContent(
    text: string,
    dialect: MarkupAI.Dialects,
    styleGuide: string
  ): Promise<CheckResult> {
    // Create a Blob from the text content
    const blob = new Blob([text], { type: "text/plain" });
    const file = new File([blob], "content.txt", { type: "text/plain" });

    // Create style suggestion request
    const workflowResponse =
      await this.client.styleSuggestions.createStyleSuggestion({
        file_upload: file,
        dialect: dialect,
        style_guide: styleGuide,
      });

    const workflowId = workflowResponse.workflow_id;

    // Poll for results
    const result = await this.pollForResults(workflowId);
    return result;
  }

  private async pollForResults(workflowId: string): Promise<CheckResult> {
    let attempts = 0;

    while (attempts < MAX_POLL_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      attempts++;

      try {
        const suggestionResponse =
          await this.client.styleSuggestions.getStyleSuggestion(workflowId);
        const status = suggestionResponse.workflow?.status;

        if (status === "completed") {
          return this.parseResponse(suggestionResponse);
        } else if (status === "failed") {
          throw new Error("MarkupAI: Content check failed");
        }
        // If still running, continue polling
      } catch (error: any) {
        if (error?.statusCode === 404) {
          // Workflow not found yet, continue polling
          continue;
        }
        throw error;
      }
    }

    throw new Error("MarkupAI: Content check timed out");
  }

  private parseResponse(response: MarkupAI.SuggestionResponse): CheckResult {
    const issues: ContentIssue[] = [];
    const apiIssues = response.original?.issues || [];

    for (let i = 0; i < apiIssues.length; i++) {
      const issue = apiIssues[i];
      const issueType = this.mapCategoryToType(issue.category);

      issues.push({
        id: `issue-${i}`,
        startIndex: issue.position.start_index,
        endIndex: issue.position.start_index + issue.original.length,
        type: issueType,
        category: issue.category,
        subcategory:
          typeof issue.subcategory === "string" ? issue.subcategory : undefined,
        message:
          issue.explanation ||
          `${issue.category}: Replace "${issue.original}" with "${issue.suggestion}"`,
        suggestion: issue.suggestion,
        originalText: issue.original,
        severity: issue.severity,
      });
    }

    const qualityScore = response.original?.scores?.quality;
    const scores: ContentScores = {
      overall: qualityScore?.score ?? 100,
      grammar: qualityScore?.grammar?.score ?? 100,
      consistency: qualityScore?.consistency?.score ?? 100,
      terminology: qualityScore?.terminology?.score ?? 100,
    };

    return { issues, scores };
  }

  private mapCategoryToType(
    category?: MarkupAI.IssueCategory
  ): ContentIssue["type"] {
    switch (category) {
      case "grammar":
        return "grammar";
      case "clarity":
        return "clarity";
      case "consistency":
        return "consistency";
      case "terminology":
        return "terminology";
      case "tone":
        return "tone";
      default:
        return "grammar";
    }
  }
}

// ============================================================================
// Extension State
// ============================================================================

let diagnosticCollection: vscode.DiagnosticCollection;
let statusBarItem: vscode.StatusBarItem;
let documentIssues: Map<string, ContentIssue[]> = new Map();
let documentScores: Map<string, ContentScores> = new Map();
let checkDebounceTimers: Map<string, NodeJS.Timeout> = new Map();
let isEnabled = true;
let cachedStyleGuides: StyleGuideOption[] = [...BUILT_IN_STYLE_GUIDES];
let isCheckingDocument: Map<string, boolean> = new Map();

// ============================================================================
// Utility Functions
// ============================================================================

function getConfig(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration("markupai");
}

function getApiToken(): string {
  return getConfig().get("apiToken", "");
}

function hasApiToken(): boolean {
  return getApiToken().trim().length > 0;
}

function isExtensionEnabled(): boolean {
  return isEnabled && getConfig().get("enabled", true);
}

function getDialect(): MarkupAI.Dialects {
  return getConfig().get("dialect", "american_english") as MarkupAI.Dialects;
}

function getStyleGuide(): string {
  return getConfig().get("styleGuide", "ap");
}

function indexToPosition(
  document: vscode.TextDocument,
  index: number
): vscode.Position {
  return document.positionAt(index);
}

function getSeverityForIssue(issue: ContentIssue): vscode.DiagnosticSeverity {
  switch (issue.severity) {
    case "high":
      return vscode.DiagnosticSeverity.Error;
    case "medium":
      return vscode.DiagnosticSeverity.Warning;
    case "low":
      return vscode.DiagnosticSeverity.Information;
    default:
      return vscode.DiagnosticSeverity.Warning;
  }
}

function getScoreEmoji(score: number): string {
  if (score >= 90) {
    return "🟢";
  }
  if (score >= 70) {
    return "🟡";
  }
  if (score >= 50) {
    return "🟠";
  }
  return "🔴";
}

function getTypeEmoji(type: ContentIssue["type"]): string {
  switch (type) {
    case "grammar":
      return "📖";
    case "spelling":
      return "📝";
    case "consistency":
      return "🔄";
    case "clarity":
      return "💡";
    case "terminology":
      return "📚";
    case "tone":
      return "🎭";
    default:
      return "📝";
  }
}

// ============================================================================
// Core Functionality
// ============================================================================

async function checkDocument(
  document: vscode.TextDocument,
  showProgress: boolean = false
): Promise<void> {
  if (!isExtensionEnabled()) {
    clearDiagnostics(document);
    updateStatusBar(null);
    return;
  }

  // Check if API token is configured
  if (!hasApiToken()) {
    updateStatusBarNoToken();
    return;
  }

  // Only check text-based documents
  if (document.uri.scheme !== "file" && document.uri.scheme !== "untitled") {
    return;
  }

  const text = document.getText();
  if (!text.trim()) {
    clearDiagnostics(document);
    updateStatusBar({
      grammar: 100,
      consistency: 100,
      terminology: 100,
      overall: 100,
    });
    return;
  }

  // Prevent concurrent checks on the same document
  const docKey = document.uri.toString();
  if (isCheckingDocument.get(docKey)) {
    return;
  }

  isCheckingDocument.set(docKey, true);
  updateStatusBarChecking();

  try {
    const checker = new MarkupAIContentChecker(getApiToken());
    let result: CheckResult;

    if (showProgress) {
      result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "MarkupAI: Checking content...",
          cancellable: false,
        },
        async () => {
          return await checker.checkContent(
            text,
            getDialect(),
            getStyleGuide()
          );
        }
      );
    } else {
      result = await checker.checkContent(text, getDialect(), getStyleGuide());
    }

    // Store issues and scores for this document
    documentIssues.set(docKey, result.issues);
    documentScores.set(docKey, result.scores);

    // Update diagnostics
    updateDiagnostics(document, result.issues);

    // Update status bar
    updateStatusBar(result.scores);
  } catch (error: any) {
    console.error("MarkupAI: Error checking content", error);

    if (error?.statusCode === 401) {
      vscode.window.showErrorMessage(
        "MarkupAI: Invalid API token. Please check your settings."
      );
      updateStatusBarNoToken();
    } else {
      vscode.window.showErrorMessage(
        `MarkupAI: Error checking content - ${
          error?.message || "Unknown error"
        }`
      );
      statusBarItem.text = "⚠️ MarkupAI: Error";
      statusBarItem.show();
    }
  } finally {
    isCheckingDocument.set(docKey, false);
  }
}

function updateDiagnostics(
  document: vscode.TextDocument,
  issues: ContentIssue[]
): void {
  const diagnostics: vscode.Diagnostic[] = [];

  for (const issue of issues) {
    const startPos = indexToPosition(document, issue.startIndex);
    const endPos = indexToPosition(document, issue.endIndex);
    const range = new vscode.Range(startPos, endPos);

    const diagnostic = new vscode.Diagnostic(
      range,
      issue.message,
      getSeverityForIssue(issue)
    );

    diagnostic.source = "MarkupAI";

    // Store additional data in the diagnostic
    (diagnostic as any).markupaiSuggestion = issue.suggestion;
    (diagnostic as any).markupaiOriginalText = issue.originalText;
    (diagnostic as any).markupaiIssueType = issue.type;
    (diagnostic as any).markupaiCategory = issue.category;
    (diagnostic as any).markupaiSubcategory = issue.subcategory;

    diagnostics.push(diagnostic);
  }

  diagnosticCollection.set(document.uri, diagnostics);
}

function clearDiagnostics(document: vscode.TextDocument): void {
  diagnosticCollection.delete(document.uri);
  documentIssues.delete(document.uri.toString());
  documentScores.delete(document.uri.toString());
}

function clearAllDiagnostics(): void {
  diagnosticCollection.clear();
  documentIssues.clear();
  documentScores.clear();
}

async function setMarkupAIEnabled(enabled: boolean): Promise<void> {
  isEnabled = enabled;

  // Update the context variable for menu visibility
  await vscode.commands.executeCommand(
    "setContext",
    "markupai.enabled",
    isEnabled
  );

  // Persist the setting
  const config = getConfig();
  await config.update("enabled", isEnabled, vscode.ConfigurationTarget.Global);

  if (isEnabled) {
    vscode.window.showInformationMessage("MarkupAI: Issues Enabled");
    // Re-check the active document
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      checkDocument(editor.document, true);
    }
  } else {
    vscode.window.showInformationMessage("MarkupAI: Issues Disabled");
    clearAllDiagnostics();
    statusBarItem.text = "$(circle-slash) MarkupAI: Disabled";
    statusBarItem.tooltip =
      "MarkupAI issues are disabled. Right-click to enable.";
    statusBarItem.command = "markupai.enableIssues";
    statusBarItem.backgroundColor = undefined;
    statusBarItem.show();
  }
}

function updateStatusBar(scores: ContentScores | null): void {
  if (!scores) {
    statusBarItem.hide();
    return;
  }

  const emoji = getScoreEmoji(scores.overall);
  statusBarItem.text = `${emoji} MarkupAI: ${scores.overall}`;
  statusBarItem.tooltip = `Click to see detailed scores\n\nGrammar: ${scores.grammar}\nConsistency: ${scores.consistency}\nTerminology: ${scores.terminology}`;
  statusBarItem.command = "markupai.showScores";
  statusBarItem.backgroundColor = undefined;
  statusBarItem.show();
}

function updateStatusBarNoToken(): void {
  statusBarItem.text = "$(key) MarkupAI: Add API Token";
  statusBarItem.tooltip = "Click to configure your MarkupAI API token";
  statusBarItem.command = "markupai.configureApiToken";
  statusBarItem.backgroundColor = new vscode.ThemeColor(
    "statusBarItem.warningBackground"
  );
  statusBarItem.show();
}

function updateStatusBarChecking(): void {
  statusBarItem.text = "$(sync~spin) MarkupAI: Checking...";
  statusBarItem.tooltip = "Checking content...";
  statusBarItem.show();
}

function scheduleCheck(document: vscode.TextDocument): void {
  const uri = document.uri.toString();

  // Clear existing timer
  const existingTimer = checkDebounceTimers.get(uri);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  // Schedule new check
  const delay = getConfig().get("checkDelay", 2000);
  const timer = setTimeout(() => {
    checkDocument(document);
    checkDebounceTimers.delete(uri);
  }, delay);

  checkDebounceTimers.set(uri, timer);
}

// ============================================================================
// Code Actions Provider (Quick Fixes)
// ============================================================================

class MarkupAICodeActionProvider implements vscode.CodeActionProvider {
  static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    _token: vscode.CancellationToken
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    for (const diagnostic of context.diagnostics) {
      if (diagnostic.source !== "MarkupAI") {
        continue;
      }

      const suggestion = (diagnostic as any).markupaiSuggestion;
      const originalText = (diagnostic as any).markupaiOriginalText;
      const issueType = (diagnostic as any).markupaiIssueType;

      if (suggestion && suggestion !== originalText) {
        // Create quick fix action using applyFix command to handle overlapping issues
        const action = new vscode.CodeAction(
          `Fix: Replace "${originalText}" with "${suggestion}"`,
          vscode.CodeActionKind.QuickFix
        );

        action.command = {
          command: "markupai.applyFix",
          title: "Apply Fix",
          arguments: [
            {
              uri: document.uri.toString(),
              range: {
                start: {
                  line: diagnostic.range.start.line,
                  character: diagnostic.range.start.character,
                },
                end: {
                  line: diagnostic.range.end.line,
                  character: diagnostic.range.end.character,
                },
              },
              suggestion: suggestion,
            },
          ],
        };
        action.diagnostics = [diagnostic];
        action.isPreferred = true;

        actions.push(action);

        // Add "Disable MarkupAI" action
        const ignoreAction = new vscode.CodeAction(
          `Disable MarkupAI Issues`,
          vscode.CodeActionKind.QuickFix
        );
        ignoreAction.command = {
          command: "markupai.disableIssues",
          title: "Disable MarkupAI",
          arguments: [],
        };
        actions.push(ignoreAction);
      }
    }

    return actions;
  }
}

// ============================================================================
// Hover Provider
// ============================================================================

class MarkupAIHoverProvider implements vscode.HoverProvider {
  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): vscode.Hover | null {
    const diagnostics = diagnosticCollection.get(document.uri);
    if (!diagnostics) {
      return null;
    }

    for (const diagnostic of diagnostics) {
      if (diagnostic.range.contains(position)) {
        const suggestion = (diagnostic as any).markupaiSuggestion;
        const originalText = (diagnostic as any).markupaiOriginalText;
        const category = (diagnostic as any).markupaiCategory;
        const subcategory = (diagnostic as any).markupaiSubcategory;

        const markdown = new vscode.MarkdownString();
        markdown.isTrusted = true;
        markdown.supportHtml = true;

        // 1. Category on top
        if (category) {
          const categoryLabel =
            category.charAt(0).toUpperCase() + category.slice(1);
          const categoryEmoji = getTypeEmoji(category);
          markdown.appendMarkdown(`### ${categoryEmoji} ${categoryLabel}\n\n`);
        }

        // 2. Subcategory below
        if (subcategory) {
          const subcategoryLabel =
            subcategory.charAt(0).toUpperCase() + subcategory.slice(1);
          markdown.appendMarkdown(`**Subcategory:** ${subcategoryLabel}\n\n`);
        }

        // 3. Suggestion (only show the suggested text)
        if (suggestion && suggestion !== originalText) {
          markdown.appendMarkdown(`**Suggestion:** \`${suggestion}\`\n\n`);

          // 4. Apply button
          const args = encodeURIComponent(
            JSON.stringify({
              uri: document.uri.toString(),
              range: {
                start: {
                  line: diagnostic.range.start.line,
                  character: diagnostic.range.start.character,
                },
                end: {
                  line: diagnostic.range.end.line,
                  character: diagnostic.range.end.character,
                },
              },
              suggestion: suggestion,
            })
          );
          markdown.appendMarkdown(
            `[Apply Fix](command:markupai.applyFix?${args})`
          );
        }

        return new vscode.Hover(markdown, diagnostic.range);
      }
    }

    return null;
  }
}

// ============================================================================
// Commands
// ============================================================================

async function configureApiToken(): Promise<void> {
  const currentToken = getApiToken();
  const token = await vscode.window.showInputBox({
    prompt: "Enter your MarkupAI API token",
    password: true,
    value: currentToken,
    placeHolder: "Paste your API token here",
    ignoreFocusOut: true,
  });

  if (token !== undefined) {
    await getConfig().update(
      "apiToken",
      token,
      vscode.ConfigurationTarget.Global
    );

    if (token.trim()) {
      vscode.window.showInformationMessage("MarkupAI: API token saved");

      // Refresh style guides
      await refreshStyleGuides();

      // Re-check active document
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        checkDocument(editor.document, true);
      }
    } else {
      updateStatusBarNoToken();
    }
  }
}

async function refreshStyleGuides(): Promise<void> {
  if (!hasApiToken()) {
    cachedStyleGuides = [...BUILT_IN_STYLE_GUIDES];
    return;
  }

  try {
    const checker = new MarkupAIContentChecker(getApiToken());
    cachedStyleGuides = await checker.fetchStyleGuides();
  } catch (error) {
    console.error("MarkupAI: Error refreshing style guides", error);
    cachedStyleGuides = [...BUILT_IN_STYLE_GUIDES];
  }
}

async function selectStyleGuide(): Promise<void> {
  if (!hasApiToken()) {
    const action = await vscode.window.showWarningMessage(
      "MarkupAI: API token required to fetch style guides",
      "Configure Token"
    );
    if (action === "Configure Token") {
      await configureApiToken();
    }
    return;
  }

  // Refresh style guides before showing picker
  await refreshStyleGuides();

  const currentStyleGuide = getStyleGuide();
  const items: vscode.QuickPickItem[] = cachedStyleGuides.map((guide) => ({
    label: guide.name,
    description: guide.isBuiltIn ? "Built-in" : "Custom",
    detail: guide.id,
    picked: guide.id === currentStyleGuide,
  }));

  const selected = await vscode.window.showQuickPick(items, {
    title: "Select Style Guide",
    placeHolder: "Choose a style guide for content checking",
    canPickMany: false,
  });

  if (selected && selected.detail) {
    await getConfig().update(
      "styleGuide",
      selected.detail,
      vscode.ConfigurationTarget.Global
    );
    vscode.window.showInformationMessage(
      `MarkupAI: Style guide set to "${selected.label}"`
    );

    // Re-check active document
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      checkDocument(editor.document, true);
    }
  }
}

async function selectDialect(): Promise<void> {
  const currentDialect = getDialect();
  const items: vscode.QuickPickItem[] = DIALECTS.map((d) => ({
    label: d.label,
    detail: d.value,
    picked: d.value === currentDialect,
  }));

  const selected = await vscode.window.showQuickPick(items, {
    title: "Select Dialect",
    placeHolder: "Choose your preferred English dialect",
    canPickMany: false,
  });

  if (selected && selected.detail) {
    await getConfig().update(
      "dialect",
      selected.detail,
      vscode.ConfigurationTarget.Global
    );
    vscode.window.showInformationMessage(
      `MarkupAI: Dialect set to "${selected.label}"`
    );

    // Re-check active document
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      checkDocument(editor.document, true);
    }
  }
}

async function showScoresDialog(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showInformationMessage("No active editor");
    return;
  }

  const scores = documentScores.get(editor.document.uri.toString());
  if (!scores) {
    vscode.window.showInformationMessage(
      "No scores available. Run a check first."
    );
    return;
  }

  const issues = documentIssues.get(editor.document.uri.toString()) || [];
  const grammarCount = issues.filter(
    (i) => i.type === "grammar" || i.category === "grammar"
  ).length;
  const consistencyCount = issues.filter(
    (i) => i.type === "consistency" || i.category === "consistency"
  ).length;
  const terminologyCount = issues.filter(
    (i) => i.type === "terminology" || i.category === "terminology"
  ).length;
  const otherCount =
    issues.length - grammarCount - consistencyCount - terminologyCount;

  const items: vscode.QuickPickItem[] = [
    {
      label: `${getScoreEmoji(scores.overall)} Overall Score: ${
        scores.overall
      }`,
      description: `${issues.length} total issues found`,
      detail: "Combined quality score from all categories",
    },
    {
      label: "─".repeat(40),
      kind: vscode.QuickPickItemKind.Separator,
    },
    {
      label: `${getScoreEmoji(scores.grammar)} Grammar: ${scores.grammar}`,
      description: `${grammarCount} issues`,
      detail: "Grammar, spelling, and punctuation issues",
    },
    {
      label: `${getScoreEmoji(scores.consistency)} Consistency: ${
        scores.consistency
      }`,
      description: `${consistencyCount} issues`,
      detail: "Style and formatting consistency",
    },
    {
      label: `${getScoreEmoji(scores.terminology)} Terminology: ${
        scores.terminology
      }`,
      description: `${terminologyCount} issues`,
      detail: "Term usage and vocabulary",
    },
  ];

  if (otherCount > 0) {
    items.push({
      label: `📋 Other Issues`,
      description: `${otherCount} issues`,
      detail: "Clarity, tone, and other suggestions",
    });
  }

  // Add configuration options
  items.push(
    { label: "─".repeat(40), kind: vscode.QuickPickItemKind.Separator },
    {
      label: "$(gear) Configure Style Guide...",
      detail: `Current: ${getStyleGuide()}`,
    },
    {
      label: "$(globe) Configure Dialect...",
      detail: `Current: ${getDialect()}`,
    }
  );

  const selected = await vscode.window.showQuickPick(items, {
    title: "MarkupAI Content Scores",
    placeHolder: "Content quality scores for current document",
    canPickMany: false,
  });

  if (selected?.label.includes("Style Guide")) {
    await selectStyleGuide();
  } else if (selected?.label.includes("Dialect")) {
    await selectDialect();
  }
}

// ============================================================================
// Activation
// ============================================================================

export function activate(context: vscode.ExtensionContext) {
  console.log("MarkupAI extension is now active!");

  // Initialize diagnostic collection
  diagnosticCollection =
    vscode.languages.createDiagnosticCollection("markupai");
  context.subscriptions.push(diagnosticCollection);

  // Initialize status bar
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.name = "MarkupAI Score";
  context.subscriptions.push(statusBarItem);

  // Set initial enabled state from config and update context for menu visibility
  isEnabled = getConfig().get("enabled", true);
  vscode.commands.executeCommand("setContext", "markupai.enabled", isEnabled);

  // Register Code Actions Provider (for quick fixes)
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      { scheme: "file" },
      new MarkupAICodeActionProvider(),
      {
        providedCodeActionKinds:
          MarkupAICodeActionProvider.providedCodeActionKinds,
      }
    )
  );

  // Register Hover Provider
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      { scheme: "file" },
      new MarkupAIHoverProvider()
    )
  );

  // Register Commands
  context.subscriptions.push(
    vscode.commands.registerCommand("markupai.checkContent", () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        checkDocument(editor.document, true);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("markupai.toggleEnabled", async () => {
      await setMarkupAIEnabled(!isEnabled);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("markupai.enableIssues", async () => {
      await setMarkupAIEnabled(true);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("markupai.disableIssues", async () => {
      await setMarkupAIEnabled(false);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("markupai.showScores", showScoresDialog)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "markupai.configureApiToken",
      configureApiToken
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "markupai.selectStyleGuide",
      selectStyleGuide
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("markupai.selectDialect", selectDialect)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("markupai.applyFix", async (args: any) => {
      if (!args) {
        return;
      }

      const parsedArgs = typeof args === "string" ? JSON.parse(args) : args;
      const uri = vscode.Uri.parse(parsedArgs.uri);
      const range = new vscode.Range(
        new vscode.Position(
          parsedArgs.range.start.line,
          parsedArgs.range.start.character
        ),
        new vscode.Position(
          parsedArgs.range.end.line,
          parsedArgs.range.end.character
        )
      );

      // Remove the diagnostic and any overlapping diagnostics before applying the fix
      const currentDiagnostics = diagnosticCollection.get(uri);
      if (currentDiagnostics) {
        const updatedDiagnostics = currentDiagnostics.filter((d) => {
          // Check if ranges overlap: two ranges overlap if one starts before the other ends
          // and ends after the other starts
          const rangesOverlap =
            d.range.start.isBefore(range.end) &&
            d.range.end.isAfter(range.start);
          const rangesEqual = d.range.isEqual(range);
          // Remove if overlapping or equal
          return !rangesOverlap && !rangesEqual;
        });
        diagnosticCollection.set(uri, updatedDiagnostics);
      }

      const edit = new vscode.WorkspaceEdit();
      edit.replace(uri, range, parsedArgs.suggestion);
      await vscode.workspace.applyEdit(edit);
    })
  );

  // Document Events
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((document) => {
      if (getConfig().get("checkOnOpen", true)) {
        checkDocument(document);
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (getConfig().get("checkOnChange", true)) {
        scheduleCheck(event.document);
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((document) => {
      clearDiagnostics(document);
      const timer = checkDebounceTimers.get(document.uri.toString());
      if (timer) {
        clearTimeout(timer);
        checkDebounceTimers.delete(document.uri.toString());
      }
    })
  );

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        const scores = documentScores.get(editor.document.uri.toString());
        if (scores) {
          updateStatusBar(scores);
        } else if (!hasApiToken()) {
          updateStatusBarNoToken();
        } else {
          checkDocument(editor.document);
        }
      } else {
        statusBarItem.hide();
      }
    })
  );

  // Configuration change listener
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("markupai.enabled")) {
        isEnabled = getConfig().get("enabled", true);
        // Update context for menu visibility
        vscode.commands.executeCommand(
          "setContext",
          "markupai.enabled",
          isEnabled
        );

        if (!isEnabled) {
          clearAllDiagnostics();
          statusBarItem.text = "$(circle-slash) MarkupAI: Disabled";
          statusBarItem.tooltip =
            "MarkupAI issues are disabled. Right-click to enable.";
          statusBarItem.command = "markupai.enableIssues";
          statusBarItem.backgroundColor = undefined;
          statusBarItem.show();
        } else {
          const editor = vscode.window.activeTextEditor;
          if (editor) {
            checkDocument(editor.document);
          }
        }
      }

      if (event.affectsConfiguration("markupai.apiToken")) {
        refreshStyleGuides();
      }
    })
  );

  // Initial setup
  if (hasApiToken()) {
    refreshStyleGuides();
  }

  // Check currently open document on activation
  if (vscode.window.activeTextEditor) {
    if (hasApiToken()) {
      checkDocument(vscode.window.activeTextEditor.document);
    } else {
      updateStatusBarNoToken();
    }
  } else if (!hasApiToken()) {
    updateStatusBarNoToken();
  }
}

// This method is called when your extension is deactivated
export function deactivate() {
  for (const timer of checkDebounceTimers.values()) {
    clearTimeout(timer);
  }
  checkDebounceTimers.clear();
}
