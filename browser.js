let toolBarEnabled = true
const webview = document.querySelector('#webview')
const address = document.querySelector('.toolbar .address')

webview.addEventListener('dom-ready', () => {
    toolBarEnabled = true
})
webview.addEventListener('did-navigate', (event) => {
    if (event.url.startsWith('http')) {
        address.value = event.url
    }
})

webview.addEventListener('console-message', (e) => {
    console.log('Guest page logged a message:', e.message, e)
})

webview.addEventListener('ipc-message', (event) => {
    console.log('Guest page ipc message:', event.channel)
})


document.querySelector('.toolbar').addEventListener('click', e => {
    if (!toolBarEnabled) return

    const act = e.target.dataset.act
    switch (act) {
        case 'go':
        case 'refresh':
            toolBarEnabled = false
            webview.loadURL(address.value)
            // webview.webContents.openDevTools({
            //     mode: 'bottom'
            // })
            break
    }
})
