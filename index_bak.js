const { app, protocol, ipcMain, BrowserWindow, net } = require('electron')

const path = require('node:path')
const url = require('node:url')
const fs = require('node:fs')
const EventEmitter = require('node:events')

const { injectJSCode, injectXTraceScript } = require('./metrics')

const cacheFoler = path.resolve(__dirname, 'cacheFiles')
const eventEmitter = new EventEmitter()
ipcMain.on('asynchronous-message', (event, arg) => {
    createWindow()
})

const chainsLinkPoints = {}


function readReq(req) {
    return new Promise((resolve) => {
        if ('POST' === req.method && req.uploadData) {
            let body = []
            req.uploadData.forEach(part => {
                if (part.bytes) {
                    body += part.bytes
                } else if (part.file) {
                    body += fs.readFileSync(part.file)
                }
            })
            resolve(body)
        } else {
            resolve()
        }
    })
}

function saveCache(subFolder, fileName, fileContent) {
    const filePath = path.resolve(cacheFoler, subFolder, fileName)
    const fileDir = path.dirname(filePath)
    if (!fs.existsSync(fileDir)) {
        fs.mkdirSync(fileDir, { recursive: true })
    }

    fs.writeFileSync(filePath, fileContent)
}

function readCache(subFolder, fileName) {
    const filePath = path.resolve(cacheFoler, subFolder, fileName)
    return fs.readFileSync(filePath).toString()
}

function parseAndConnectStacks(callerStasks, callerInfoStasks) {
    for (let i = 0; i < callerStasks.length; i++) {
        const stackItem = callerStasks[i]
        let chainsKey = getChainsPoint(stackItem)
        if (chainsLinkPoints[chainsKey]) {

            let toAppendStacks = chainsLinkPoints[chainsKey].pop()
            if (toAppendStacks) {
                parseAndConnectStacks(callerStasks, callerInfoStasks)
                callerInfoStasks.push(...toAppendStacks)
            }
            break
        }
        callerInfoStasks.push(getNearestXtraceInfoFromSource(stackItem))
    }
}
async function receiveTraceInfo(info) {
    function parseStack(stackItem) {
        // console.log('-----')
        // console.log(stackItem)
        stackItem = stackItem.trim()
        const parsedItem = stackItem.match(/at( +(.*) +)?\(?(.*)\:(\d+)\:(\d+)\)?$/)
        if (parsedItem) {
            const funcName = parsedItem[2]
            const filePath = parsedItem[3].trim()
            const lineNo = parsedItem[4]
            const colNo = parsedItem[5]
            return {
                funcName,
                filePath,
                lineNo,
                colNo
            }
        } else {
            return stackItem
        }
    }

    try {
        info = JSON.parse(info)
        let { type, stacks, details } = info
        if (stacks) {
            stacks = stacks.map(item => {

                if (Array.isArray(item)) {
                    return item.map(subItem => parseStack(subItem))
                }
                return parseStack(item)
            })
        }

        if ('readCode' === type) {
            const fileFullPath = getPathFromUrl(details.file)

            const fileContent = readCache('origin', fileFullPath)
            if (details.full) {
                return fileContent
            }
            let resultCode
            if (details.fnName.startsWith('call:')) {
                resultCode = fileContent.split(/\n/).slice(details.lineNo - 1, details.lineNo + 1).join('\n')
            } else {
                const [start, end] = details.pos.split('-')
                resultCode = fileContent.slice(start, end)
            }

            return resultCode.toString()

        } else if ('stackChain' === type) {
            // console.log('>>> stackChain', stacks[0])
            const callerStasks = stacks[0]
            const callerInfoStasks = []

            parseAndConnectStacks(callerStasks, callerInfoStasks)
            // for (let i = 0; i < callerStasks.length; i++) {
            //     const stackItem = callerStasks[i]
            //     let chainsKey = getChainsPoint(stackItem)
            //     if (chainsLinkPoints[chainsKey]) {

            //         let toAppendStacks = chainsLinkPoints[chainsKey].pop()
            //         if (toAppendStacks) {
            //             callerInfoStasks.push(...toAppendStacks)
            //         }

            //         break
            //     }
            //     callerInfoStasks.push(getNearestXtraceInfoFromSource(stackItem))
            // }
            // const callerInfoStasks = callerStasks.map( callerStack => getNearestXtraceInfoFromSource(callerStack))
            // const callerInfo = getNearestXtraceInfoFromSource(stacks[0])

            let chainsKey = getChainsPoint(stacks[1], true)
            if (!chainsLinkPoints[chainsKey]) {
                chainsLinkPoints[chainsKey] = []
            }
            chainsLinkPoints[chainsKey].push(callerInfoStasks)
            // console.log('>>>> chainsLinkPoints', chainsKey, chainsLinkPoints)
            // console.log(chainsStacks, chainsLinkPoints)
        } else if ('stackDetail' === type) {
            // console.log('>>>>>> start')
            const blockStacks = [{ blockIndex: details.blockIndex }]
            let chainsLinked = false
            stacks.slice(1).forEach(stackItem => {
                if ('string' === typeof stackItem) {
                    return ''
                }

                //check if in chains point
                let chainsKey = getChainsPoint(stackItem)

                if (chainsLinkPoints[chainsKey]) {
                    if (!chainsLinked) {
                        chainsLinked = true
                        if (chainsLinkPoints[chainsKey].length) {
                            blockStacks.push(...chainsLinkPoints[chainsKey].pop())
                        }

                    }
                } else {
                    const callerInfo = getNearestXtraceInfoFromSource(stackItem)
                    blockStacks.push(callerInfo)
                }
            })
            // console.log('>>>> 1', blockStacks, details)
            stacks = blockStacks
            // console.log(stacks, details )
            info.stacks = stacks
            eventEmitter.emit(':trace', info)
        }

    } catch (err) {
        console.error(err)
    }
}
function getChainsPoint(caller, fromCaller) {
    let lineNo = caller.lineNo
    if (fromCaller) {
        lineNo = lineNo * 1 + 1
    }
    return caller.filePath + ':' + lineNo
}
function getNearestXtraceInfoFromSource(caller) {
    const filePath = getPathFromUrl(caller.filePath)
    const sourceCode = fs.readFileSync(path.resolve(cacheFoler, 'processed', filePath)).toString()
    const preCodeLines = sourceCode.split(/\n/).slice(0, caller.lineNo)

    let tempLines = []
    let found = false

    for (let i = preCodeLines.length - 1; i >= 0; i--) {
        let line = preCodeLines[i].trim()
        tempLines.unshift(line)
        if (line.startsWith('xTrace({')) {
            found = true
            break
        }
    }
    if (found) {
        let traceInfoString = ''
        for (let i = 1; i < tempLines.length; i++) {
            if (tempLines[i].startsWith('})')) {
                break
            }
            traceInfoString += tempLines[i]
        }
        let json_parser = new Function(`return {${traceInfoString}}`)

        let traceInfo = json_parser()
        return {
            blockIndex: traceInfo.blockIndex
        }
    }

}

function getPathFromUrl(parsedUrl) {
    if ('string' === typeof parsedUrl) {
        parsedUrl = new URL(parsedUrl)
    }
    let fileName = parsedUrl.pathname.slice(1)
    if ('' === fileName || fileName.endsWith('/')) {
        fileName += '__index'
    }
    return parsedUrl.hostname + '/' + fileName
}
function interception() {

    protocol.interceptBufferProtocol('http', async (req, callback) => {

        const parsedUrl = new URL(req.url)
        // console.log('>>> req.url', parsedUrl )

        const body = await readReq(req)
        if ('xtrace' === parsedUrl.hostname.toLocaleLowerCase()) {
            const resp = await receiveTraceInfo(body)
            callback(Buffer.from(resp || 'ok', 'utf8'))
            return
        }
        const response = await net.fetch(req.url, {
            body,
            method: req.method,
            bypassCustomProtocolHandlers: true
        })
        if (response.ok) {
            const respType = response.headers.get('content-type').split(';')[0]

            let body = await response.text()

            const fileFullPath = getPathFromUrl(parsedUrl)

            saveCache('origin', fileFullPath, body)

            if ('text/html' === respType) {

                body = injectXTraceScript(body)
            } else if ('application/javascript' === respType) {
                //recompile Javascript body with injected metrics
                body = injectJSCode(body, {
                    file: req.url
                })
            }

            saveCache('processed', fileFullPath, body)


            callback(Buffer.from(body, 'utf8'))
        }
        return
    });
};
const createWindow = () => {
    const win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            webviewTag: true
        },
    })

    ipcMain.addListener(':inspect', function (event, e) {
        event.returnValue = null
        win.webContents.openDevTools()
        win.webContents.inspectElement(e.x, e.y)
    })
    eventEmitter.on(':trace', data => {
        win.webContents.send(':trace', data)
    })
    win.loadFile('index.html')
    // win.loadURL('http://127.0.0.1:8000')
}

app.whenReady().then(() => {
    interception()
    createWindow()

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})
