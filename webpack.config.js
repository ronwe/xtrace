const path = require('path')

module.exports = {
    mode: 'production',
    entry: './static/index.js',
    output: {
        filename: 'main.js',
        path: path.resolve(__dirname, 'static/dist'),
    },
    devtool: 'source-map'
}