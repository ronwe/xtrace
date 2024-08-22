function getCallerStack(index, one = true) {
    let stackString = new Error().stack.toString()
    let stacks =  stackString.split(/\n/)
    if (one) {
        return stacks[index]
    } else {
        return stacks.slice(index)
    }
}

function sendTrace(type, stacks, details) {
    // console.log('>>> ', type, details, stacks.join(';;'))
    fetch('http://xtrace', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            type, 
            stacks, 
            details
        })
    })
}
const _setTimeout = window.setTimeout
window.setTimeout = function (fn, delay) {
    const caller = [getCallerStack(3, false)]
    _setTimeout(() => {
        caller.push(getCallerStack(2)) && sendTrace('stackChain', caller, 'setTimeout')
        fn()
    }, delay)
}

const _promise = window.Promise
window.Promise = function (init, staticMethod) {
    const caller = [staticMethod ? getCallerStack(4, false) : getCallerStack(4, false)]
    let value = undefined
    let state = 'PENDING'
    let handlers = []
    let catchers = []

    this.then = function (successCallback) {
        if (state === 'FULFILLED') {
            sendTrace('stackChain', caller, 'promise.then')
            value = successCallback(value)
        } else {
            handlers.push(successCallback)
        }
        return this
    }
    this.catch = function (failureCallback) {
        if (state === 'REJECTED') {

            sendTrace('stackChain', caller, 'promise.catch')
            failureCallback(value)
        } else {
            catchers.push(value);
        }
    };

    (staticMethod ? _promise[staticMethod](init) : new _promise(init)).then(result => {
        if (state !== 'PENDING') return

        state = 'FULFILLED'
        value = result

        caller.push(getCallerStack(2)) && sendTrace('stackChain', caller, 'promise.then')
        handlers.forEach((h) => h(value))
    }).catch(() => {
        state = 'REJECTED'
        caller.push(getCallerStack(2)) && sendTrace('stackChain', caller, 'promise.catch')
        catchers.forEach(c => c(value))
    })

    return this
};

['resolve'].forEach(method => {
    window.Promise[method] = function (value) {
        return window.Promise(value, method)
    }
})

const microsecs = performance.now() * 1_000
function xTrace(traceInfo) {
    let stacks = new Error().stack
    traceInfo.timeStamp = performance.now() * 1_000 - microsecs
    sendTrace('stackDetail', stacks.toString().split(/\n/).slice(2), traceInfo)


    // ipcRenderer.sendToHost({
    //     type: 'calling',
    //     args: {fnName, lineNo, colNo}
    // })
}
