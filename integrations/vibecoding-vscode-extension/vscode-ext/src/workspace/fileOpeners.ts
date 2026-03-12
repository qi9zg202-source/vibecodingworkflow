import * as fs from 'fs';
import * as vscode from 'vscode';

export async function openFileInEditor(filePath: string, label: string): Promise<void> {
    if (!fs.existsSync(filePath)) {
        throw new Error(`${label} not found: ${filePath}`);
    }

    const document = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(document, { preview: false });
}
