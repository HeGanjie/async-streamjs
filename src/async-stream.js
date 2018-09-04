// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Iteration_protocols
// https://gist.github.com/HeGanjie/9000001
// http://2ality.com/2016/10/asynchronous-iteration.html

/*interface AsyncIterable {
  [Symbol.asyncIterator]() : AsyncIterator;
}
interface AsyncIterator {
  next() : Promise<IteratorResult>;
}
interface IteratorResult {
  value: any;
  done: boolean;
}*/

const EOS = Symbol.for('endOfAsyncStream')

export default class AsyncStream {
  headPromiseOrFn = null
  restFn = null

  constructor(headPromiseOrFn, restFn) {
    this.headPromiseOrFn = headPromiseOrFn
    this.restFn = restFn || (() => EMPTY_STREAM)

    this[Symbol.asyncIterator] = this.asyncIterator
  }

  asyncIterator = () => {
    let s = new AsyncStream(null, () => this) // unshift a null
    return {
      next: async () => {
        s = await s.rest()
        const value = await s.first()
        return {
          value: value === EOS ? undefined : value,
          done: value === EOS
        }
      }
    }
  }

  async first() {
    if ('function' === typeof this.headPromiseOrFn) {
      let v = await this.headPromiseOrFn()
      this.headPromiseOrFn = v
      return v
    }
    return await this.headPromiseOrFn
  }

  async rest() {
    let head = await this.first()
    if (head === EOS) {
      return this
    }
    return await this.restFn()
  }

  restLazy() {
    let cache
    const headFn = async () => {
      cache = await this.rest()
      return await cache.first()
    }
    return new AsyncStream(headFn, async () => {
      if (!cache) {
        await headFn()
      }
      return await cache.rest()
    })
  }

  async isEmpty() {
    return EOS === await this.first()
  }

  take(n) {
    if (n <= 0) {
      return EMPTY_STREAM
    }
    return new AsyncStream(() => this.first(), async () => {
      let r = await this.rest()
      return r.take(n - 1)
    })
  }

  takeWhile(asyncPredicate) {
    let headFn = () => this.first().then(async v => v === EOS || !await asyncPredicate(v) ? EOS : v)
    return new AsyncStream(headFn, async () => {
      let r = await this.rest()
      return r.takeWhile(asyncPredicate)
    })
  }

  drop(n) {
    if (n <= 0) {
      return this
    }
    if (n === 1) {
      return this.restLazy()
    }
    return this.restLazy().drop(n - 1)
  }

  filter(asyncPredicate) {
    return this.flatMap(async val => await asyncPredicate(val) ? val : EMPTY_STREAM)
  }

  map(asyncMapper) {
    let headFn = () => this.first().then(async v => v === EOS ? EOS : await asyncMapper(v))
    return new AsyncStream(headFn, async () => {
      let r = await this.rest()
      return r.map(asyncMapper)
    })
  }

  concat(s2) {
    return new AsyncStream(() => this.first().then(v => v === EOS ? s2.first() : v), async () => {
      if (EOS === await this.first()) {
        return await s2.rest()
      }
      return this.drop(1).concat(s2)
    })
  }

  flatMap(asyncMapper) {
    let headMapped = async () => {
      let v = await asyncMapper(await this.first())
      if (v && (typeof v[Symbol.iterator] === 'function' || typeof v[Symbol.asyncIterator] === 'function')) {
        return AsyncStream.fromIterable(v)
      }
      return AsyncStream.fromIterable([v])
    }
    
    let headCache
    let headFn = async () => {
      headCache = headMapped()
      let head = await headCache
      return await head.first()
    }

    return new AsyncStream(headFn, async () => {
      let head = await headCache
      return head.restLazy().concat(this.restLazy().flatMap(asyncMapper))
    })
  }

  static fromIterator(iterator) {
    const head = iterator.next()
    let hp = Promise.resolve(head).then(({value, done}) => done ? EOS : value)
    return new AsyncStream(hp, async () => {
      let val = await hp
      if (EOS === val) {
        return EMPTY_STREAM
      }
      return AsyncStream.fromIterator(iterator)
    })
  }

  static fromIterable(iterable) {
    if (iterable instanceof AsyncStream) {
      return iterable
    }
    let genIterator = iterable[Symbol.asyncIterator] || iterable[Symbol.iterator]
    if (!genIterator) {
      throw new Error(`${iterable} is not iterable`)
    }
    const iterator = genIterator.bind(iterable)()
    return AsyncStream.fromIterator(iterator)
  }

  async reduce(asyncReducer, init = undefined) {
    if (init === undefined) {
      let res = await this.first()
      await (await this.rest()).forEach(async v => {
        res = await asyncReducer(res, v)
      })
      return res
    } else {
      await this.forEach(async v => {
        init = await asyncReducer(init, v)
      })
      return init
    }
  }

  async forEach(asyncCallback) {
    let s = this
    let head = await s.first()
    while (head !== EOS) {
      await asyncCallback(head)
      s = await s.rest()
      head = await s.first()
    }
  }

  async toArray() {
    let arr = []
    await this.forEach(v => arr.push(v))
    return arr
  }

  static range(start = 0, end = null) {
    if (start === end) {
      return EMPTY_STREAM
    }
    return new AsyncStream(start, () => AsyncStream.range(start + 1, end))
  }
}

export const EMPTY_STREAM = new AsyncStream(EOS, () => EMPTY_STREAM)
