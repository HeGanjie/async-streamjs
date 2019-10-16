import AsyncStream, {EMPTY_STREAM} from './async-stream'
import _ from 'lodash'

// AsyncStream.range().map(query).flatMap(x => x).forEach(v => console.log(v))

test('async iterate', async () => {
  const totalCount = 12, batchSize = 5, seq = []
  let done = false

  async function fakeQueryDB(batchIdx) {
    let offset = batchIdx * batchSize
    seq.push(`query page ${batchIdx}`)
    return Array.from({length: batchSize}, (v, i) => i + offset).filter(v => v < totalCount)
  }

  let s = AsyncStream.range()
    .map(async pageIdx => {
      let arr = done ? [] : await fakeQueryDB(pageIdx)
      done = arr.length < batchSize
      return arr
    })
    .takeWhile(arr => 0 < arr.length)
    .flatMap(x => x)

  for await (const x of s) {
    seq.push(`value ${x}`)
  }

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
  ])
});

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

test('dropWhile', async () => {
  let arrFromStream = await AsyncStream.range().dropWhile(v => v < 5).take(5).toArray()
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

test('chunk', async () => {
  let loopCount = 0
  let toStr = v => {
    loopCount++;
    return v + ''
  }
  let arrFromStream = await AsyncStream.range().map(toStr).chunk(3).take(3).toArray()
  expect(arrFromStream).toEqual(_.chunk(_.range(0, 9).map(v => v + ''), 3))
  expect(loopCount).toEqual(9)
});

test('filter', async () => {
  let arrFromStream = await AsyncStream.range().filter(v => v % 2 === 0).take(5).toArray()
  expect(arrFromStream).toEqual([0, 2, 4, 6, 8])
});

test('find', async () => {
  let arrFromStream = await AsyncStream.range(1).find(v => v % 5 === 0)
  expect(arrFromStream).toEqual(5)
});

test('find not found', async () => {
  let arrFromStream = await AsyncStream.range().take(5).find(v => v === 5)
  expect(arrFromStream).toEqual(undefined)
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
  const totalCount = 35, batchSize = 10
  let queryCount = 0, done = false
  async function fakeQueryDB(batchIdx) {
    let offset = batchIdx * batchSize
    queryCount++
    return Array.from({length: batchSize}, (v, i) => i + offset).filter(v => v < totalCount)
  }
  let arrFromStream = await AsyncStream.range()
    .map(async pageIdx => {
      let arr = done ? [] : await fakeQueryDB(pageIdx)
      done = arr.length < batchSize
      return arr
    })
    .takeWhile(arr => 0 < arr.length)
    .flatMap(x => x)
    .toArray()
  expect(arrFromStream).toEqual(_.range(0, totalCount))
  expect(queryCount).toEqual(4)
});

test('lazy load', async () => {
  let seq = []

  const totalCount = 12
  const pageSize = 5
  async function fakeQueryDB(pageIdx) {
    seq.push(`query page ${pageIdx}`)
    let offset = pageIdx * pageSize
    return Array.from({length: pageSize}, (v, i) => i + offset)
      .filter(v => v < totalCount)
  }
  let done = false
  await AsyncStream.range()
    .map(async pageIdx => {
      let arr = done ? [] : await fakeQueryDB(pageIdx)
      done = arr.length < pageSize
      return arr
    })
    .takeWhile(arr => 0 < arr.length)
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
  ])
});

test('isEmpty', async () => {
  let emptyStream = AsyncStream.range().take(1).restLazy()
  expect(await emptyStream.isEmpty()).toBe(true)

  let emptyStream1 = await AsyncStream.range().take(1).rest()
  expect(await emptyStream1.isEmpty()).toBe(true)
});

test('first of empty stream', async () => {
  let firstOfEmpty = await AsyncStream.range().take(0).first()
  expect(firstOfEmpty).toEqual(undefined)

  expect(await EMPTY_STREAM.first()).toEqual(undefined)
});

test('tail of empty stream', async () => {
  let tailOfEmpty = await AsyncStream.range().take(0).rest()
  expect(tailOfEmpty).toBe(EMPTY_STREAM)

  expect(await EMPTY_STREAM.rest()).toBe(EMPTY_STREAM)
});

test('empty stream equality', async () => {
  let isEqual = _.isEqual(EMPTY_STREAM, await AsyncStream.range().take(1).rest())
  expect(isEqual).toBe(true)
});

test('fifo queue', async () => {
  let targetArr = await AsyncStream.fromAsyncCallback(resolve => {
    let srcArr0 = _.range(0, 5)
    let srcArr1 = _.range(5, 10)
    for (let i of srcArr0) {
      resolve(i)
    }
    setTimeout(() => {
      for (let i of srcArr1) {
        resolve(i)
      }
      resolve(null)
    }, 500)
    setTimeout(() => {
      resolve(null)
    }, 1000)
  }).toArray()
  expect(targetArr).toEqual(_.range(0, 10))
});

test('drop many', async () => {
  let arrFromStream = await AsyncStream.range().drop(800).take(1).toArray()
  expect(arrFromStream).toEqual([800])
});
