const { ipcRenderer } = require('electron')



ipcRenderer.on(':trace', (_event, args) => {
    const eventAwesome = new CustomEvent('trace-log', {
        bubbles: true,
        detail: args,
    });
    window.dispatchEvent(eventAwesome)
})

window.addEventListener('mousedown', (e) => {
    if (e.button == 2) {
        ipcRenderer.send(':inspect', { x: e.clientX, y: e.clientY })
    }
})

