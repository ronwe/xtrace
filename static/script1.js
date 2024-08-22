// const fun1 = () => { setTimeout(fun2); };
// const fun2 = () => { 
//     log_stack(); 
//     fun3(); 
// };
// const fun3 = () => { log_stack(); };
// function log_stack() {
//     let err = {};
//     Error.captureStackTrace(err);
//     console.log(err.stack);
// }
// fun1();
// const fun1 = () => { setTimeout(fun2); };
// const fun2 = () => { 
//     log_stack(); 
//     fun3(); 
// };
// const fun3 = () => { log_stack(); };
// function log_stack() {
//     let err = {};
//     Error.captureStackTrace(err);
//     console.log(err.stack);
// }
// fun1();
// const fun1 = () => { setTimeout(fun2); };
// const fun2 = () => { 
//     log_stack(); 
//     fun3(); 
// };
// const fun3 = () => { log_stack(); };
// function log_stack() {
//     let err = {};
//     Error.captureStackTrace(err);
//     console.log(err.stack);
// }
// fun1();
// const fun1 = () => { setTimeout(fun2); };
// const fun2 = () => { 
//     log_stack(); 
//     fun3(); 
// };
// const fun3 = () => { log_stack(); };
// function log_stack() {
//     let err = {};
//     Error.captureStackTrace(err);
//     console.log(err.stack);
// }
// fun1();
export function stack1() {
    // console.log(new Error().stack)
    // console.trace()
    Promise.resolve().then(stack2)
}
export function stack2() {
    
    // console.log('////////////////')
    // console.groupCollapsed('name to show to identify trace');
    // console.log('additional data hidden inside collapsed group');
    // console.trace(); // hidden in collapsed group
    // console.groupEnd();
    document.getElementById('container').innerHTML = 'there'
}