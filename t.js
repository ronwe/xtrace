const recast = require('recast')
const { Parser } = require('acorn')
// https://astexplorer.net/
// https://blog.csdn.net/qq_18470967/article/details/119964180
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
            callee:  astParams('window.xTrace'),
            arguments: [
                {
                    type: 'ObjectExpression',
                    properties: Object.keys(options).map( k =>  astObject(k, options[k]))
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
let n = '\\n'
const jsCode = ` 
(() => {
    a()
    b()
})();
//# sourceMappingURL=main.js.map
`
//https://www.cnblogs.com/vvjiang/p/15976301.html
//https://60devs.com/using-recast-to-automate-analysis-and-maintenance-of-js-code.html
console.log(jsCode)
const ast = Parser.parse(jsCode, {sourceType: 'module'})

function getParentBlockId(path) {
    let _parentPath = path
    while (true) {
        if (!_parentPath) break 
        console.log(_parentPath)
        if (_parentPath.node?.blockIndex >= 0) {
            return _parentPath.node.blockIndex
            break
        }
        _parentPath = _parentPath.parentPath
        
    }
}


function injectJSCode() {
    // console.log(jsCode)
    let ttt = {}

    // console.log(ast)
    // return
    let blockIndex = 0
    let xxx = {
        // visitFunctionDeclaration:function(path) {
        //     console.log(path)
        //     this.traverse(path)
        // },
        // visitExpressionStatement: function(path) {
        //      console.log('>>>>> visitExpressionStatement')
         
        //     recast.visit(
        //         path.value,
        //         {
                   
        //             visitBlockStatement: xxx.visitBlockStatement,
        //             visitCallExpression: xxx.visitCallExpression
        //             // visitExpressionStatement:xxx.visitExpressionStatement,
        //         },
        //     )
        //     // console.log('>>>> function node', this)
        //     // the navigation code here...

        //     // return false to stop at this depth
        //     return false;
        //     // return literal(true);

        //      // run the visit on every child node
        //      this.traverse(path)

        // },
        visitExpressionStatement: function (path) {
            // for case (() => { funciton declared here could not be travel over need this tricky to walk around}) ()
            recast.visit(
                path.value,
                {
                    visitBlockStatement: xxx.visitBlockStatement,
                    // visitCallExpression: xxx.visitCallExpression
                },
            )
            // return false
            this.traverse(path)
        },
        visitBlockStatement: function (path) {
            const { node, value } = path
            console.log(value)
            const parentPath = path.parentPath
            let isFunction
            let wrapperBlock = getParentBlockId(parentPath)
            if (parentPath.value.type === 'FunctionDeclaration' || parentPath.value.type === 'ArrowFunctionExpression') {
                isFunction = true            
            }

            const fnName = getFunctionName(path)
            // the navigation code here...
            const preCode = jsCode.slice(0, node.start)
            const lines = preCode.split(/\n/)

            const lineNo = lines.length
            const colNo = lines[lines.length - 1].length
            const code = jsCode.slice(node.start, node.end)


            const blockCode = jsCode.slice(node.start, node.end)
            const blockLines = blockCode.split(/\n/).length

            // console.log('>>> code', lineNo, colNo, fnName, code)
            node.body.unshift(astMetrics({
                fnName,
                lineNo,
                colNo,
                blockIndex,
                linesCount: blockLines,
                isFunction,
                wrapperBlock,
                pos: `${node.start}-${node.end}`
            }))
            node.blockIndex = blockIndex
            node.isFunction = isFunction
            node.xtraced = true

            blockIndex++

            //insert metrics reporter

            this.traverse(path)
        },
        visitCallExpression: function(path) {
            const { node, value } = path
            let fnName = getFunctionName(path)
            if (fnName === 'window.xTrace') {
                return false
            }
            // console.log(node)
            // console.log('>>> visitCallExpression', fnName)
            // the navigation code here...
            const preCode = jsCode.slice(0, node.start)
            const lines = preCode.split(/\n/)

            const lineNo = lines.length
            const colNo = lines[lines.length - 1].length
            const code = jsCode.slice(node.start, node.end)


            const blockCode = jsCode.slice(node.start, node.end)
            const blockLines = blockCode.split(/\n/).length

            // console.log('>>> code', lineNo, colNo, fnName, code)

            let parentNode = path
            
            while (true) {
                if (!parentNode) {
                    break
                }
                console.log('>>> parentNode', parentNode.node)
                if (parentNode.node.body) {
                    console.log('>>> parentNode.node.body', parentNode.node)
                    break
                }
                // if (parentNode.value.body) {
                //     console.log('>>> parentNode.value.body', parentNode.value)
                //     break
                // }
                
                parentNode = parentNode.parentPath
              
            }
            if (parentNode?.node?.xtraced) {
                return false
            }
            console.log('>>> parentNode', parentNode)
            //  console.log(parentNode, node)
            // console.log(jsCode.slice(parentNode.start, parentNode.end))
            // fnName
            let parentBody = parentNode.value //parentNode.node.body //parentNode?.node?parentNode.node.body: ast.body
            console.log('>>> parentBody', parentBody)
            let body2 = parentBody.map( bodyI => {
                if (bodyI.type === 'ExpressionStatement') {
                    return bodyI.expression
                }
                return null
            })
            // let body = parentNode.node.body
            // for (let i = 0; i < body.length; i++) {
            //     if (body[i].type == 'ExpressionStatement' &&  body[i].expression === node) {
            //         console.log('>>>>', i, body[i])
            //         break
            //     }
            // }
            let toInsertPos = body2.indexOf(node) 
            if (toInsertPos < 0) toInsertPos = 0
            console.log(toInsertPos)
            parentBody.splice(toInsertPos, 0, astMetrics({
                fnName: `call:${fnName}`,
                lineNo,
                colNo,
                linesCount: blockLines,
                // pos: `${parentNode.node.start}-${parentNode.node.end}`
            }))
            return false
        },
    }
    recast.visit(
        ast,
       xxx,
    )
}
injectJSCode()
console.log('--------------')
console.log(recast.print(ast).code)