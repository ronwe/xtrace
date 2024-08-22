
import { stack1, stack2 } from './script1.js'
async function main() {
 
    // console.trace()
    // const request1 = new Request("/404.html", {
    //     method: "POST",
    //     body: JSON.stringify({ username: "example" }),
    // })
    
    // const response1 = await fetch(request1)
    // console.log('>>>', response1.status)

    if (Date.now() > 1) {
        // console.trace()
        // setTimeout(stack2)
        Promise.resolve().then(stack1)
    }
}
function wrapMain() {
    console.log('blahblah')
    let a = 123
    setTimeout(main)
    // setTimeout(stack2)
    Promise.resolve().then(stack2)
    // main()
}
wrapMain()