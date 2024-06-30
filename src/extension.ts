import * as vscode from 'vscode';
import * as fs from 'fs';
import moment from 'moment';
import * as path from 'path'; 

interface CommentEntry {
    lineNumber: number;
    comment: string;
    timestamp: number;
    filePath: string; // Add filePath to store the file path of the comment
}

interface ChangeLog {
    [key: string]: CommentEntry[]; // key: filename
}

class CodeHistory {
    private changeLog: ChangeLog = {};
    private updateInterval: NodeJS.Timeout | null = null;
    private supportedExtensions: string[] = ['.js', '.ts', '.py', '.java']; // Add supported extensions

    constructor() {
        this.startUpdateInterval();
    }

    private extractNumberedComments(document: vscode.TextDocument): CommentEntry[] {
        const comments: CommentEntry[] = [];
        const lineCount = document.lineCount;
        const languageId = document.languageId;
        const filePath = document.fileName; // Get the file path

        const commentRegex = this.getCommentRegex(languageId);
        if (!commentRegex) {
            console.warn(`Unsupported language for comment extraction: ${languageId}`);
            return comments;
        }

        for (let line = 0; line < lineCount; line++) {
            const text = document.lineAt(line).text.trim();
            const match = text.match(commentRegex);
            if (match) {
                comments.push({
                    lineNumber: line + 1,
                    comment: match[2].trim(),
                    timestamp: Date.now(),
                    filePath: filePath, // Store the file path
                });
            }
        }
        return comments;
    }

    private getCommentRegex(languageId: string | undefined): RegExp | null {
        switch (languageId) {
            case 'javascript':
            case 'typescript':
                return /^\/\/\s*(\d+):(.*)$/;
            case 'python':
                return /^#\s*(\d+):(.*)$/;
            case 'java':
                return /^\/\/\s*(\d+):(.*)$/;
            default:
                return null;
        }
    }

    public async updateChangeLog(): Promise<void> { 
        this.changeLog = {}; // Reset the changeLog

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return;
        }

        for (const folder of workspaceFolders) {
            await this.updateChangeLogForFolder(folder.uri);
        }
    }

    private async updateChangeLogForFolder(folderUri: vscode.Uri): Promise<void> {
        const files = await vscode.workspace.findFiles(
            new vscode.RelativePattern(folderUri, `**/*{${this.supportedExtensions.join(',')}}`),
            '**/node_modules/**' // Exclude node_modules folder
        );

        for (const file of files) {
            const document = await vscode.workspace.openTextDocument(file);
            this.changeLog[file.fsPath] = this.extractNumberedComments(document);
        }
    }

    public generateMarkdownReport(): void {
        const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspacePath) {
            vscode.window.showErrorMessage("No workspace open!");
            return;
        }

        const reportDir = `${workspacePath}/.code-history`;
        const dateStr = moment().format('YYYY-MM-DD');
        const reportFilePath = `${reportDir}/${dateStr}.md`;

        if (!fs.existsSync(reportDir)) {
            fs.mkdirSync(reportDir);
        }

        let markdownContent = `# Code History - ${dateStr}\n\n`;

        for (const filePath in this.changeLog) {
            const comments = this.changeLog[filePath];
            if (comments.length > 0) { // Only include files with comments
                markdownContent += `## [${path.basename(filePath)}](${vscode.Uri.file(filePath).with({ scheme: 'file' }).toString()})\n\n`; // File name with link
                comments.forEach(entry => {
                    markdownContent += `- Line ${entry.lineNumber}: ${entry.comment} (**${moment(entry.timestamp).format('HH:mm:ss')}**) \n`;
                });
                markdownContent += '\n';
            }
        }

        fs.writeFile(reportFilePath, markdownContent, err => {
            if (err) {
                vscode.window.showErrorMessage("Error writing report: " + err);
                return;
            }
            vscode.window.showInformationMessage("Code history report generated!");
        });
    }

    public rollbackToComment(filename: string, commentNumber: number): void {
        const entries = this.changeLog[filename];
        if (!entries) {
            vscode.window.showErrorMessage(`No history found for: ${filename}`);
            return;
        }

        const targetEntry = entries.find(entry => entry.lineNumber === commentNumber);

        if (!targetEntry) {
            vscode.window.showErrorMessage(`Comment not found at line ${commentNumber}`);
            return;
        }

        // Get the active text editor
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage("No active editor.");
            return;
        }

        // Ensure you are editing the correct file!
        if (editor.document.fileName !== filename) {
            vscode.window.showErrorMessage(`Please open ${filename} to rollback.`);
            return;
        }

        // Assuming you want to revert to the state before the comment:
        const rollbackPosition = new vscode.Position(targetEntry.lineNumber - 1, 0);
        const rollbackRange = new vscode.Range(rollbackPosition, editor.document.lineAt(targetEntry.lineNumber - 1).range.end);

        // Replace with an empty string to effectively delete
        editor.edit(editBuilder => {
            editBuilder.replace(rollbackRange, '');
        });

        vscode.window.showInformationMessage(`Rolled back to comment at line ${commentNumber}`);
    }

    private startUpdateInterval(): void {
        this.updateInterval = setInterval(async () => {
            await this.updateChangeLog(); // Update all files in the workspace
        }, 20000);
    }

    dispose(): void {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
    }
}

export function activate(context: vscode.ExtensionContext) {
    const codeHistory = new CodeHistory();

    context.subscriptions.push(
        vscode.commands.registerCommand('xompile.generateReport', async () => {
            await codeHistory.updateChangeLog(); // Update before generating
            codeHistory.generateMarkdownReport();
        }),
        vscode.commands.registerCommand('xompile.rollbackToComment', async () => {
            const filename = vscode.window.activeTextEditor?.document.fileName;
            if (!filename) {
                return; // No active editor
            }

            const commentNumberStr = await vscode.window.showInputBox({
                placeHolder: 'Enter comment line number to rollback to'
            });
            const commentNumber = parseInt(commentNumberStr || '', 10);
            if (isNaN(commentNumber)) {
                vscode.window.showErrorMessage("Invalid line number.");
                return;
            }

            codeHistory.rollbackToComment(filename, commentNumber);
        }),
        codeHistory
    );

    console.log('Code History Extension Activated');
}

export function deactivate() {}