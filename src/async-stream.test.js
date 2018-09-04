import AsyncStream from './async-stream'
import _ from 'lodash'


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

test('take', async () => {
  let arrFromStream = await AsyncStream.range().take(5).toArray()
  expect(arrFromStream).toEqual(_.range(0, 5))
});

test('takeWhile', async () => {
  let arrFromStream = await AsyncStream.range().takeWhile(v => v < 5).toArray()
  expect(arrFromStream).toEqual(_.range(0, 5))
});

test('drop', async () => {
  let arrFromStream = await AsyncStream.range().drop(5).take(5).toArray()
  expect(arrFromStream).toEqual(_.range(5, 10))
});

test('concat', async () => {
  let arrFromStream = await AsyncStream.range().drop(5).take(5).concat(AsyncStream.range().take(5)).toArray()
  expect(arrFromStream).toEqual([..._.range(5, 10), ..._.range(0, 5)])
});

test('map', async () => {
  let arrFromStream = await AsyncStream.range().map(v => v + '').take(5).toArray()
  expect(arrFromStream).toEqual(_.range(0, 5).map(v => v + ''))
});

test('filter', async () => {
  let arrFromStream = await AsyncStream.range().filter(v => v % 2 === 0).take(5).toArray()
  expect(arrFromStream).toEqual([0, 2, 4, 6, 8])
});

test('reduce', async () => {
  let val = await AsyncStream.range().take(10).reduce((acc, curr) => acc + curr)
  expect(val).toEqual(_.sum(_.range(0, 10)))
});

test('fromIterable', async () => {
  let arrFromStream = await AsyncStream.fromIterable(_.range(0, 5)).map(v => v + '').toArray()
  expect(arrFromStream).toEqual(_.range(0, 5).map(v => v + ''))
});

test('flatMap', async () => {
  const totalCount = 35
  async function fakeQueryDB(batchIdx) {
    const batchSize = 10
    let offset = batchIdx * batchSize
    return Array.from({length: batchSize}, (v, i) => i + offset).filter(v => v < totalCount)
  }
  let arrFromStream = await AsyncStream.range().flatMap(fakeQueryDB).toArray()
  expect(arrFromStream).toEqual(_.range(0, totalCount))
});

test('lazy', async () => {
  let seq = []

  const totalCount = 12
  const pageSize = 5
  async function fakeQueryDB(pageIdx) {
    seq.push(`query page ${pageIdx}`)
    let offset = pageIdx * pageSize
    return Array.from({length: pageSize}, (v, i) => i + offset).filter(v => v < totalCount)
  }
  await AsyncStream.range().map(fakeQueryDB)
    .flatMap(_.identity)
    .forEach(v => seq.push(`value ${v}`))

  expect(seq).toEqual([
    "query page 0",
    "value 0",
    "value 1",
    "value 2",
    "value 3",
    "value 4",
    "query page 1",
    "value 5",
    "value 6",
    "value 7",
    "value 8",
    "value 9",
    "query page 2",
    "value 10",
    "value 11",
    "query page 3"
  ])
});
