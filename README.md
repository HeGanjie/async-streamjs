# async-streamjs

async version of streamjs(https://github.com/winterbe/streamjs)

### Install
 `npm i async-streamjs`


### Demo
```js
import AsyncStream from 'async-streamjs'

const totalCount = 12
const pageSize = 5
async function fakeQueryDB(pageIdx) {
    console.log(`query page ${pageIdx}`)
    let offset = pageIdx * pageSize
    return Array.from({length: pageSize}, (v, i) => i + offset)
        .filter(v => v < totalCount)
}

AsyncStream.range()
    .map(fakeQueryDB)
    .takeWhile(arr => 0 < arr.length)
    .flatMap(x => x)
    .forEach(v => console.log(`value ${v}`))
```

run result:
```
query page 0
value 0
value 1
value 2
value 3
value 4
query page 1
value 5
value 6
value 7
value 8
value 9
query page 2
value 10
value 11
query page 3
```

### LICENSE
 MIT
