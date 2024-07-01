import * as vscode from 'vscode';
import * as fs from 'fs';
import moment from 'moment';
import * as path from 'path';

interface CommentEntry {
    lineNumber: number;
    comment: string;
    timestamp: number;
    filePath: string;
    codeReference?: string;
}

interface ChangeLog {
    [key: string]: CommentEntry[];
}

class CodeHistory {
    private changeLog: ChangeLog = {};
    private updateInterval: NodeJS.Timeout | null = null;
    private supportedExtensions: string[] = ['.js', '.ts', '.py', '.java'];

    constructor() {
        this.startUpdateInterval();
    }

    private extractNumberedComments(document: vscode.TextDocument): CommentEntry[] {
        const comments: CommentEntry[] = [];
        const lineCount = document.lineCount;
        const languageId = document.languageId;
        const filePath = document.fileName;
        const commentRegex = this.getCommentRegex(languageId);
        const codeBlockStartRegex = /\/\/\[!!\]/;
        const codeBlockEndRegex = /\/\/\[-!!-\]/;

        if (!commentRegex) {
            console.warn(`Unsupported language for comment extraction: ${languageId}`);
            return comments;
        }

        let codeReferenceCounter = 1;
        let codeBlockLines: string[] = []; // Store code block lines

        for (let line = 0; line < lineCount; line++) {
            const text = document.lineAt(line).text;
            const match = text.match(commentRegex);

            if (codeBlockStartRegex.test(text)) {
                codeBlockLines = []; // Start a new code block
            } else if (codeBlockEndRegex.test(text)) {
                // End of code block, associate with previous comment
                const codeBlock = codeBlockLines.join('\n'); 
                comments.forEach(comment => {
                    if (!comment.codeReference) {
                        comment.codeReference = `[Code Reference ${codeReferenceCounter}](#code-${codeReferenceCounter})`;
                        codeReferenceCounter++; 
                    }
                });
            } else if (match) {
                comments.push({
                    lineNumber: line + 1,
                    comment: match[2].trim(),
                    timestamp: Date.now(),
                    filePath: filePath,
                    codeReference: `[Code Reference ${codeReferenceCounter}](#code-${codeReferenceCounter++})` 
                });
            } else {
                // Accumulate code lines if within a code block
                if (codeBlockLines.length > 0 || comments.some(c => !c.codeReference)) {
                    codeBlockLines.push(text);
                }
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
        this.changeLog = {};

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
            '**/node_modules/**' 
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
        const docReportFilePath = `${reportDir}/${dateStr}_doc.md`;
        const codeReportFilePath = `${reportDir}/${dateStr}_code.md`;

        if (!fs.existsSync(reportDir)) {
            fs.mkdirSync(reportDir);
        }

        let markdownContentDoc = `# Code Documentation - ${dateStr}\n\n`;
        let markdownContentCode = `# Code Snippets - ${dateStr}\n\n`;
        let codeReferenceCounter = 1;

        for (const filePath in this.changeLog) {
            const comments = this.changeLog[filePath];

            if (comments.length > 0) {
                markdownContentDoc += `## [${path.basename(filePath)}](${vscode.Uri.file(filePath).with({ scheme: 'file' }).toString()})\n\n`;

                comments.forEach(entry => {
                    markdownContentDoc += `- ${entry.codeReference} Line ${entry.lineNumber}: ${entry.comment} (**${moment(entry.timestamp).format('HH:mm:ss')}**)\n`;
                });
                markdownContentDoc += '\n';

                comments.forEach((entry, index) => {
                    if (entry.codeReference) {
                        const nextComment = comments[index + 1]; // Get the next comment

                        markdownContentCode += `## <a id="code-${codeReferenceCounter}"></a> [Go to Doc Reference ${codeReferenceCounter}](${docReportFilePath}#${entry.codeReference.replace(/ /g, '-').toLowerCase()})\n\n`;
                        markdownContentCode += `\`\`\`${this.getFileExtension(filePath)}\n`;
                        markdownContentCode += `// Code From: ${filePath}\n`;
                        markdownContentCode += `// Line: ${entry.lineNumber}\n\n`;
                        markdownContentCode += `${entry.comment}\n\n`;
                        markdownContentCode += `\`\`\`\n\n`;
                        codeReferenceCounter++;
                    }
                });
            }
        }

        fs.writeFile(docReportFilePath, markdownContentDoc, err => {
            if (err) {
                vscode.window.showErrorMessage("Error writing documentation report: " + err);
                return;
            }
        });

        fs.writeFile(codeReportFilePath, markdownContentCode, err => {
            if (err) {
                vscode.window.showErrorMessage("Error writing code report: " + err);
                return;
            }
            vscode.window.showInformationMessage("Code history reports generated!");
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

        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage("No active editor.");
            return;
        }

        if (editor.document.fileName !== filename) {
            vscode.window.showErrorMessage(`Please open ${filename} to rollback.`);
            return;
        }

        const rollbackPosition = new vscode.Position(targetEntry.lineNumber - 1, 0);
        const rollbackRange = new vscode.Range(rollbackPosition, editor.document.lineAt(targetEntry.lineNumber - 1).range.end);

        editor.edit(editBuilder => {
            editBuilder.replace(rollbackRange, '');
        });

        vscode.window.showInformationMessage(`Rolled back to comment at line ${commentNumber}`);
    }

    private startUpdateInterval(): void {
        this.updateInterval = setInterval(async () => {
            await this.updateChangeLog();
        }, 20000);
    }

    dispose(): void {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
    }

    private getFileExtension(filePath: string): string {
        return path.extname(filePath).replace('.', '');
    }
}

export function activate(context: vscode.ExtensionContext) {
    const codeHistory = new CodeHistory();

    context.subscriptions.push(
        vscode.commands.registerCommand('xompile.generateReport', async () => {
            await codeHistory.updateChangeLog();
            codeHistory.generateMarkdownReport();
        }),
        vscode.commands.registerCommand('xompile.rollbackToComment', async () => {
            const filename = vscode.window.activeTextEditor?.document.fileName;
            if (!filename) {
                return;
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