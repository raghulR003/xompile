# Xompile: Your Code History Tracker

Xompile is a Visual Studio Code extension that helps you track code changes and easily roll back to previous versions using numbered comments. It automatically generates Markdown reports of your comment history, making it easy to see how your code has evolved over time. 

## Features

* Track code changes using numbered comments (`// 1: Your comment`, `# 1: Your comment`, etc.).
* Generate Markdown reports with comment history and file links.
* Rollback code to a specific comment point.
* Supports JavaScript, TypeScript, Python, and Java.

## Installation

1. **Prerequisites:** Make sure you have Node.js and npm (or yarn) installed on your system.

2. **Install Dependencies:**

* cd xompile 
* npm install

2. **Build the Extension:**

* npm run build


Running the Extension: Open in VS Code: Open the xompile folder (the cloned repository) in Visual Studio Code.

3. **Start Debugging:**

* Press F5 or click the "Run and Debug" icon in the sidebar.

* This will launch a new VS Code window called the "Extension Development Host".

4. **Test the Extension:**

* In the "Extension Development Host" window, open a folder containing .js, .ts, .py, or .java files.

* Add numbered comments to your code (e.g., // 1: This is my comment).

* Use the commands from the Command Palette (Ctrl+Shift+P or Cmd+Shift+P):

* "Xompile: Generate Report": Generates a Markdown report of your comment history.

* "Xompile: Rollback to Comment": Prompts for a comment number to roll back to.

## Contributing

Feel free to open issues or pull requests if you encounter any problems or have ideas for improvements.

## License

This project is licensed under the MIT License.

## To-Do:

- [ ] To increase support for more languages
- [ ] Code based inclusion and proper tagging
- [ ] Timeline-based view for changes in the code, but simpler to understand
- [ ] Custom implementation of code-to-guide via custom definitions, image support etc.
- [ ] Collaboration between users via session tracking and central database implementation (Similar to Git, but more simplified)
