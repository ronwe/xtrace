const recast = require('recast')

const { Parser } = require('acorn')
const fs = require('node:fs')
const xTraceClientScript = fs.readFileSync('./xTraceClient.js').toString()

function astFunction(options) {
    return {
        type: 'ExpressionStatement',
        expression: {
            type: 'CallExpression',
            callee: {
                type: 'Identifier',
                name: options.name || 'astFunction'
            },
            arguments: options.params || []
        }
    }
}

function astValueParams(value) {
    return {
        type: 'Literal',
        value: value
    }
}

function astParams(name) {
    return {
        type: 'Identifier',
        name: name
    }
}

function astObject(name, value) {
    return {
        type: 'Property',
        key: astParams(name),
        value: {
            type: 'Literal',
            value: value
        }
    }
}

function astMetrics(options) {
    return {
        type: 'ExpressionStatement',
        expression: {
            type: 'CallExpression',
            callee: astParams('xTrace'),
            arguments: [
                {
                    type: 'ObjectExpression',
                    properties: Object.keys(options).map(k => astObject(k, options[k]))
                }

            ]
        }
    }
}

function getFunctionName(path) {
    if (!path) {
        return
    }
    const type = path.value.type
    if ('FunctionDeclaration' === type) {
        return path.value.id.name
    }
    if ('ArrowFunctionExpression' === type) {
        return
    }
    if ('CallExpression' === type) {
        return path.value.callee.name
    }
    return getFunctionName(path.parentPath)

}

function getFunctionBlockId(path) {
    let _parentPath = path
    while (true) {
        if (!_parentPath) break
        if (_parentPath.node?.isFunction) {
            return _parentPath.node.blockId
            break
        }
        _parentPath = _parentPath.parentPath

    }
}
function getParentBlockId(path) {
    let _parentPath = path
    while (true) {
        if (!_parentPath) break
        if (_parentPath.node?.blockId) {
            return _parentPath.node.blockId
            break
        }
        _parentPath = _parentPath.parentPath

    }
}

exports.injectJSCode = function (jsCode, options = {}) {
    // console.log(jsCode)
    let parseOptions = {}

    if (/(^|\n)import /.test(jsCode) || /(^|\n)export /.test(jsCode)) {
        parseOptions.sourceType = 'module'
    }
    const ast = Parser.parse(jsCode, parseOptions)
    const blockPrefix = new URL(options.file).pathname.slice(1)
    let blockIndex = 0

    const travelHandler = {
        // visitFunctionDeclaration: function(path) {
        //     // console.log('>>>> function node', this)
        //     // the navigation code here...

        //     // return false to stop at this depth
        //     // return false;
        //     // return literal(true);

        //      // run the visit on every child node
        //      this.traverse(path);

        // },
        visitExpressionStatement: function (path) {
            // for case (() => { funciton declared here could not be travel over need this tricky to walk around}) ()
            recast.visit(
                path.value,
                {
                    visitBlockStatement: travelHandler.visitBlockStatement,
                    // visitCallExpression: travelHandler.visitCallExpression
                },
            )
            // return false
            this.traverse(path)
        },
        visitBlockStatement: function (path) {
            let isFunction
            let wrapperBlockIndex

            const { node } = path
            const parentPath = path.parentPath
            const parentType = parentPath.value.type
            if (parentType === 'FunctionDeclaration' || parentType === 'ArrowFunctionExpression') {
                isFunction = true
            } else {
                wrapperBlockIndex = getParentBlockId(parentPath) //getFunctionBlockId(parentPath)
            }

            const fnName = getFunctionName(path)
            // the navigation code here...
            const preCode = jsCode.slice(0, node.start)
            const lines = preCode.split(/\n/)

            const lineNo = lines.length
            // the column no. is not calculated right
            const colNo = lines[lines.length - 1].length

            const blockCode = jsCode.slice(node.start, node.end)
            const blockLines = blockCode.split(/\n/).length

            // const code = jsCode.slice(node.start, node.end)
            // console.log('>>> code', lineNo, colNo, fnName, code)

            //insert metrics reporter
            const blockId = blockPrefix + blockIndex
            node.body.unshift(astMetrics({
                fnName,
                lineNo,
                colNo,
                linesCount: blockLines,
                pos: `${node.start}-${node.end}`,
                blockIndex: blockId,
                type: isFunction ? 'function' : 'statement',
                wrapperBlockIndex,
                file: options.file
            }))
            node.xtraced = true
            node.blockId = blockId
            node.isFunction = isFunction
            blockIndex++
            this.traverse(path)
        },
        visitCallExpression: function (path) {
            const { node, value } = path
            let fnName = getFunctionName(path)
            if (fnName === 'window.xTrace') {
                return false
            }
            node.xtraced = true
            const wrapperBlockIndex = getParentBlockId(path.parentPath) //getFunctionBlockId(path.parentPath)
            // console.log('>>> visitCallExpression', fnName)
            // the navigation code here...
            const preCode = jsCode.slice(0, node.start)
            const lines = preCode.split(/\n/)

            const lineNo = lines.length
            const colNo = lines[lines.length - 1].length
            const code = jsCode.slice(node.start, node.end)


            const blockCode = jsCode.slice(node.start, node.end)
            const blockLines = blockCode.split(/\n/).length

            let parentNode = path

            // console.log(jsCode)
            while (true) {
                if (!parentNode) {
                    break
                }
                if (parentNode.node.body) {
                    break
                }
                parentNode = parentNode.parentPath
            }

            if (parentNode?.node.xtraced) {
                return false
            }

            const parentBody = parentNode.value 
            let body2 = parentBody.map(bodyI => {
                if (bodyI.type === 'ExpressionStatement') {
                    return bodyI.expression
                }
                return null
            })
            let toInsertPos = body2.indexOf(node)
            if (toInsertPos < 0) toInsertPos = 0
            const blockId = blockPrefix + blockIndex
            parentBody.splice(toInsertPos, 0, astMetrics({
                fnName: `call:${fnName}`,
                lineNo,
                colNo,
                linesCount: blockLines,
                blockIndex: blockId,
                wrapperBlockIndex,
                file: options.file,
                type: 'call',
                pos: `${parentNode.node.start}-${parentNode.node.end}`
            }))
            blockIndex++
            return false
        },
    }

    recast.visit(
        ast,
        travelHandler,
    )

    return recast.print(ast).code
}


exports.injectXTraceScript = function (htmlContent) {
    htmlContent = htmlContent.replace(/<meta.*Content-Security-Policy.*[\r\n]?.*content=('|")?([^>]+)\1>/mg, function (all, b, c) {

        let updateCSPString = c
        if (b.includes('connect-src')) {
            updateCSPString = updateCSPString.replace('connect-src ', 'connect-src http://xtrace/ ')
        } else {
            updateCSPString = 'connect-src http://xtrace/; ' + updateCSPString
        }
        return all.replace(c, updateCSPString)
    })

    htmlContent = htmlContent.replace('<head>', `
        <head>
        <script>
        ${xTraceClientScript}
        </script>
        `)

    return htmlContent
}