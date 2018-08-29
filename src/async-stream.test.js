import AsyncStream from './async-stream'
import _ from 'lodash'

const totalCount = 35
async function query(idx) {
  console.log('query:', idx)
  return Array.from({length: 10}, (v, i) => i).map(v => v + (idx * 10)).filter(v => v < totalCount)
}

/*(async function f() {
  for await (const x of AsyncStream.range().flatMap(query).drop(5).take(7)) {
    console.log(x);
  }
})()*/


// AsyncStream.range().map(query).flatMap(x => x).forEach(v => console.log(v))

test('range', async () => {
  let arrFromStream = await AsyncStream.range(0, 10).toArray()
  expect(arrFromStream).toEqual(_.range(0, 10))
});
