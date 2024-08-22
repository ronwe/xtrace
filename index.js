const { app, protocol, ipcMain, BrowserWindow, net } = require('electron')
const sourceMap = require('source-map')
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
const blockStackPoints = {}

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

// function parseAndConnectStacks(callerStasks, callerInfoStasks) {
//     for (let i = 0; i < callerStasks.length; i++) {
//         const stackItem = callerStasks[i]
//         let chainsKey = getChainsPoint(stackItem)
//         if (chainsLinkPoints[chainsKey]) {

//             let toAppendStacks = chainsLinkPoints[chainsKey].pop()
//             if (toAppendStacks) {
//                 parseAndConnectStacks(callerStasks, callerInfoStasks)
//                 callerInfoStasks.push(...toAppendStacks)
//             }
//             break
//         }
//         callerInfoStasks.push(getNearestXtraceInfoFromSource(stackItem))
//     }
// }

function parseAndGetStacks(callerStasks) {
    for (let i = 0; i < callerStasks.length; i++) {
        const stackItem = callerStasks[i]
        if ('string' === typeof stackItem) {
            continue
        }
        let nearestBlock = getNearestXtraceInfoFromSource(stackItem)

        if (!nearestBlock) {
            continue
        }
        // console.log('>>> parseAndGetStacks', stackItem, nearestBlock)
        if (blockStackPoints[nearestBlock.blockIndex]) {
            return blockStackPoints[nearestBlock.blockIndex].slice()
        }
    }
}

function loopStacksToConnectParent(stacks) {
    const callerInfoStasks = []
    for (let i = 0; i < stacks.length; i++) {
        stackItem = stacks[i]
        //try to connect if hit asynchrous callee
        let chainsKey = getChainsPoint(stackItem)
        // console.log('>>> chainsKey', chainsKey)
        if (chainsLinkPoints[chainsKey]) {
            callerInfoStasks.push(...chainsLinkPoints[chainsKey].pop())
            break
        } else if ('string' !== typeof stackItem) {
            //otherwise try to read if hit parent block
            //otherwise put to callerInfoStasks then move to next
            let nearestBlock = getNearestXtraceInfoFromSource(stackItem)
            if (!nearestBlock) {
                continue
            }
            // console.log('>>>', stackItem, nearestBlock)
            if (blockStackPoints[nearestBlock.blockIndex]) {
                callerInfoStasks.push(...blockStackPoints[nearestBlock.blockIndex].slice())
            } else {
                callerInfoStasks.push({ blockIndex: nearestBlock.blockIndex })
            }

        }
    }
    // console.log('>>>> link callerInfoStasks', callerInfoStasks)
    return callerInfoStasks
}

function highlightCode(code, lineNo) {
    if (!code) return ''
    return code.split(/\n/).map((line, i) => {
        const style = i + 1 == lineNo? 'highlight-line' : ''
        
        return `<div class="line ${style}"><span class="line-no">${i}:</span> ${line}</div>`
    }).join('\n')
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
        // console.log('<<<< stacks', type, stacks)
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

            let sourceMapFileName = fileContent.match(/\/\/\# sourceMappingURL=(.*\.map)/)

            if (sourceMapFileName) {
                const parsedURL = new URL(details.file)
                // console.log('>>> parsedURL', parsedURL, parsedURL.pathname)
                const sourceMapFile = parsedURL.pathname.split('/').slice(1, -1).join('/') + '/' + sourceMapFileName[1]
                // console.log(sourceMapFile)
                // console.log(details, fileContent)
                const rawSourceMap = JSON.parse(fs.readFileSync(path.resolve('static', sourceMapFile)))
                await sourceMap.SourceMapConsumer.with(rawSourceMap, null, consumer => {
                    let sourceInfo = consumer.originalPositionFor({
                        line: details.lineNo,
                        column: details.colNo,
                    })
                    if (!sourceInfo.source) {
                        resultCode = 'something wrong'
                        return 
                    }
                    let originSource = consumer.sourcesContent[consumer.sources.indexOf(sourceInfo.source)]
                    
                    resultCode = `<p class="filename">${sourceInfo.source}</p>` + highlightCode(originSource, sourceInfo.line)
                })
            // } else if (details.fnName?.startsWith('call:')) {
            //     resultCode = fileContent.split(/\n/).slice(details.lineNo - 1, details.lineNo + 1).join('\n')
            } else {
                resultCode = `<p class="filename">${details.file}</p>` + highlightCode(fileContent, details.lineNo)
                // const [start, end] = details.pos.split('-')
                // resultCode = fileContent.slice(start, end)
            }

            return resultCode.toString()

        } else if ('stackChain' === type) {

            const callerInfoStasks = parseAndGetStacks(stacks[0])
            // console.log('>>> stackChain', callerInfoStasks)
            // parseAndConnectStacks(callerStasks, callerInfoStasks)


            let chainsKey = getChainsPoint(stacks[1], true)
            if (!chainsLinkPoints[chainsKey]) {
                chainsLinkPoints[chainsKey] = []
            }
            chainsLinkPoints[chainsKey].push(callerInfoStasks)
            // console.log('<<<<< chainsLinkPoints', chainsKey, chainsLinkPoints)
            // console.log(chainsStacks, chainsLinkPoints)
        } else if ('stackDetail' === type) {
            // console.log('>>>>>> start', details.blockIndex, details.type, stacks)
            const callerInfoStasks = []
          
            callerInfoStasks.push({ blockIndex: details.blockIndex, timeStamp: details.timeStamp })
            switch (details.type) {
                case 'function':
                    callerInfoStasks.push(...loopStacksToConnectParent(stacks.slice(1)))

                    break
                case 'call':
                case 'statement':
                    if (details.wrapperBlockIndex && blockStackPoints[details.wrapperBlockIndex]) {
                        callerInfoStasks.push(...blockStackPoints[details.wrapperBlockIndex].slice())
                    }
                    break
            }
            blockStackPoints[details.blockIndex] = callerInfoStasks



            console.log('>>>> end ', details.blockIndex, callerInfoStasks)
            info.stacks = callerInfoStasks
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
            let responseHeaders = {}
            responseHeaders['content-type'] = response.headers.get('content-type')

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


            callback({
                headers: responseHeaders,
                data: Buffer.from(body, 'utf8')
            })
        }
        return
    });
};
const createWindow = () => {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
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
