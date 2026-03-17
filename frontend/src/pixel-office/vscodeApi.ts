export const vscode = {
  postMessage: (msg: unknown) => {
    window.dispatchEvent(new CustomEvent('pixel-agent-action', { detail: msg }));
  }
};
