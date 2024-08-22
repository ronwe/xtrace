const virtualPanel = document.querySelector('#virtual-panel')
const dialog = document.querySelector('dialog')
const codePanel = document.querySelector('dialog #codePreview')
const tracksPanel = document.querySelector('dialog #tracksPreview')
const svgPanel = document.querySelector('svg')


// let colsNumber = 0
const blocksMap = {}
const codeCache = {}

document.querySelector('dialog button').addEventListener('click', () => {
    dialog.close()

})


// function iniSVG() {
//     const rect = virtualPanel.getBoundingClientRect()

// }

function displayCodeDetail(block) {
    if (codeCache[block.blockIndex]) {
        return codeCache[block.blockIndex]
    }
    return fetch('http://xtrace', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            type: 'readCode',
            details: { ...block, full: false }
        })
    }).then(resp => {
        codeCache[block.blockIndex] = resp.text()
        return codeCache[block.blockIndex]
    })
}
const blockColMap = {

}


const colorMap = {}
const offsetMap = {}
let  alreadyHasLines = {}

function getBlockById(blockIndex) {
    return blocksMap[blockIndex]
}

function getColor(blockIndex) {
    if (colorMap[blockIndex]) {
        return colorMap[blockIndex]
    }
    colorMap[blockIndex] = rndColor()
    return colorMap[blockIndex]
}

function getOffset(key) {
    return offsetMap[key] = (offsetMap[key] || -1) + 1
}
const virtualPanelRect = virtualPanel.getBoundingClientRect()
function rndColor() {
    // let red = Math.random() * 255 | 0
    // let green = Math.random() * 30 | 0 + 245
    // if (green > 255) green = Math.random() * 10 | 0 + 50
    // let blue = Math.random() * 255 | 0
    // return `rgb(${red}, ${green}, ${blue})`
    return colorsToUse[Date.now() % colorsToUse.length]
}


function drawLine(blocka, blockb, color = 'cadetblue', tag = '', offset = 0) {
    const lineKey = `${blocka.blockIndex}-${blockb.blockIndex}`
 
    if (alreadyHasLines[lineKey]) return
    alreadyHasLines[lineKey] = true
    offset *= 10
    //https://segmentfault.com/a/1190000024578149
    const rectA = blocka.blockDom.getBoundingClientRect()
    const rectB = blockb.blockDom.getBoundingClientRect()

    let x1 = blocka.blockDom.offsetLeft + rectA.width / 2 //rectA.left - virtualPanelRect.left
    let y1 = blocka.blockDom.offsetTop + 20  //rectA.top + rectA.height / 2 - virtualPanelRect.top  


    let x2 = blockb.blockDom.offsetLeft + rectB.width / 2
    let y2 = blockb.blockDom.offsetTop + rectB.height / 2

    let c1x = x1
    let c1y = y2

    c1x += (x1 > x2 ? 1 : -1) * offset
    c1y += (y1 > y2 ? 1 : -1) * offset
    path = ` <g class="lines line-from-${tag}"  stroke-width="2" fill="none"  >
        <circle cx="${x1}" cy="${y1}" r="4" stroke="${color}"/><circle cx="${x2}" cy="${y2}" r="2" stroke="${color}"   />
        <path d="M ${x1} ${y1} Q ${c1x} ${c1y} ${x2} ${y2}" stroke-width="1"  stroke="${color}"></path>
        </g>
        `
    svgPanel.innerHTML += path

}

function drawLines(stacks, { color } = {}) {
   

    // setTimeout(() => {
        // need to repaint when window resize
        let currentBlock = getBlockById(stacks[0].blockIndex)
        let tag = currentBlock.blockIndex

        if (!color) color = getColor(currentBlock.blockIndex)
        for (let i = 1; i < stacks.length; i++) {
            const nextBlock = getBlockById(stacks[i].blockIndex)
            const offset = getOffset(currentBlock.blockIndex + '-' + nextBlock.blockIndex)
            drawLine(currentBlock, nextBlock, color, tag, offset)
            currentBlock = nextBlock
        }
    // }, 100)
}

const blockDomMap = {}
const fileDomMap = {}
const blockTree = {}
const fileFunctionsMap = {}

const blockStacksMap = {}
const colorsToUse = [
    '#a93226',
    '#eb984e',
    '#abebc6',
    '#f7dc6f'
]

function clearSVG() {
    svgPanel.innerHTML = ''
    alreadyHasLines = {}
}

async function displayBlockCode(block) {
    if (!block) return
    const codeText = await displayCodeDetail(block)
    codePanel.innerHTML = codeText
    dialog.showModal()
    codePanel.querySelector('.highlight-line')?.scrollIntoView()
}
async function displayBlockDetail(block) {
    await displayBlockCode(block)
    
    const stacksList = blockStacksMap[block.blockIndex]
    tracksPanel.innerHTML = stacksList.map( stacks => {
        let startTime  
       
        return `<ul>${
            
            stacks.slice().reverse().map( (item, i) => {
                const blockDetail = blocksMap[item.blockIndex].blockDetail
          
                if (i === 0) {
                    startTime = item.timeStamp
                }
                return `<li>
                    <div class="stack-brief" data-blockid="${blockDetail.blockIndex}">
                        <span class="stack-location">${blockDetail.filePathName} #${blockDetail.lineNo}:${blockDetail.colNo} </span>
                        <span class="stack-timespan">${(item.timeStamp - startTime) | 0}μs </span>
                    </div>
                </li>`
            }).join('')
        }</ul>`
    }).join('')

     
}
function getBlock(block) {
    const { blockIndex, wrapperBlockIndex, type } = block
    if (blockDomMap[blockIndex]) {
        return blockDomMap[blockIndex]
    }
    // console.log(blockIndex, wrapperBlockIndex)
    const filePathName = new URL(block.file).pathname.slice(1)
    block.filePathName = filePathName
    const blockDom = document.createElement('div')
    blockDom.id = block.blockIndex
    blockDom.className = 'block' + ('function' === type ? ' function' : '')
    // <div>${block.blockIndex}</div>
    let timeSpan = ''
    if (block.timeSpan) {
        timeSpan = ` | ${block.timeSpan | 0}μs `
    }
    blockDom.innerHTML = `
        ${{
            function: `<div class="function-name">${block.fnName || '<b>Caller</b>'}</div>`
        }[type] || ''}
        <div>#${block.lineNo}:${block.colNo}${timeSpan}</div>
        <div class="block-children"></div>
    `


    blockDom.addEventListener('click', async (evt) => {
        evt.stopPropagation()
        document.querySelector('.vi-panel .file .current')?.classList.remove('current')
        blockDom.classList.add('current')
        displayBlockDetail(block)
     
        const stacksList = blockStacksMap[blockIndex]
        
    
        clearSVG()
        stacksList.forEach( (stacks, i) => {
            drawLines(stacks, { color: colorsToUse[i % colorsToUse.length] })
        })
        
    })

    if (blockDomMap[wrapperBlockIndex]) {
        blockTree[wrapperBlockIndex] = blockTree[wrapperBlockIndex] || []
        blockTree[wrapperBlockIndex].push(block.blockIndex)

        blockDomMap[wrapperBlockIndex].querySelector('.block-children').appendChild(blockDom)

    } else {


        let fileWrapper = fileDomMap[filePathName]
        if (!fileWrapper) {
            fileWrapper = document.createElement('div')
            fileWrapper.className = 'file'
            fileWrapper.innerHTML = `<div class="filename">${filePathName}</div>
            <div class="state-blocks"></div>
            <div class="function-blocks"></div>`
            virtualPanel.appendChild(fileWrapper)
            fileDomMap[filePathName] = fileWrapper
        }
        let blockWrapper = fileWrapper.querySelector('function' === type ? '.function-blocks' : '.state-blocks')
        blockWrapper.appendChild(blockDom)

        if ('function' === type) {
            fileFunctionsMap[filePathName] = fileFunctionsMap[filePathName] || []
            fileFunctionsMap[filePathName].push(block.blockIndex)
        }
    }

    blockDomMap[blockIndex] = blockDom

    blocksMap[block.blockIndex] = {
        blockDom,
        blockDetail: block,
        blockIndex: block.blockIndex
    }
    return blockDom
}

const functionStartTimeMap = {}
let StartTime 

tracksPanel.addEventListener('click', (evt) => {
    evt.stopPropagation()
    const blockID = evt.target.parentNode.dataset['blockid']
    const block = blocksMap[blockID].blockDetail
    displayBlockCode(block)
    
})
window.addEventListener('trace-log', (event) => {
    const { details, stacks } = event.detail
    if ('stackDetail' !== event.detail.type) return
    // console.log(details)
    const { blockIndex}  = details
    // console.log('Guest page got trace-log', blockIndex, wrapperBlockIndex, type,  filePathName, details, stacks)
    // if ('function' === details.type && details.fnName) {
    //     functionStartTimeMap[blockIndex] = details.timeStamp
    // } else if (details.wrapperBlockIndex) {
    //     details.timeSpan = details.timeStamp - functionStartTimeMap[details.wrapperBlockIndex]
    // }
    if (!StartTime) {
        StartTime = details.timeStamp
    } else {
        details.timeSpan = details.timeStamp - StartTime
    }
    const blockRef = getBlock(details)

    const stacksList = blockStacksMap[blockIndex] || []
    stacksList.push(stacks)
    blockStacksMap[blockIndex] = stacksList
     
    let color = getColor(blockIndex)
    setTimeout(() => {
        drawLines(stacks, { color })
    }, 1000)
 
})

 