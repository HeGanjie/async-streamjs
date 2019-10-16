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
    this[Symbol.iterator] = this.asyncIterator
  }

  asyncIterator = () => {
    let s = new AsyncStream(null, () => this) // unshift a null
    return {
      next: async () => {
        s = await s.rest()
        const value = await s._first()
        return {
          value: value === EOS ? undefined : value,
          done: value === EOS
        }
      }
    }
  }

  async _first() {
    if ('function' === typeof this.headPromiseOrFn) {
      this.headPromiseOrFn = await this.headPromiseOrFn()
    }
    return await this.headPromiseOrFn
  }

  async first() {
    let v = await this._first()
    return EOS === v ? undefined : v
  }

  async rest() {
    let head = await this._first()
    if (head === EOS) {
      return this
    }
    return await this.restFn()
  }

  restLazy() {
    let cache
    const headFn = async () => {
      cache = await this.rest()
      return await cache._first()
    }
    return new AsyncStream(headFn, async () => {
      return await cache.rest()
    })
  }

  async isEmpty() {
    return EOS === await this._first()
  }

  _take(n, restCallback) {
    if (n <= 0) {
      if (restCallback) {
        restCallback(this)
      }
      return EMPTY_STREAM
    }
    return new AsyncStream(() => this._first(), async () => {
      let r = await this.rest()
      return r._take(n - 1, restCallback)
    })
  }

  take(n) {
    return this._take(n)
  }

  takeWhile(asyncPredicate) {
    let headFn = () => this._first().then(async v => v === EOS || !await asyncPredicate(v) ? EOS : v)
    return new AsyncStream(headFn, async () => {
      let r = await this.rest()
      return r.takeWhile(asyncPredicate)
    })
  }

  drop(n) {
    if (n <= 0) {
      return this
    }
    let cached = this
    return new AsyncStream(async () => {
      let dropped = 0
      while (dropped++ < n) {
        cached = await cached.rest()
      }
      return await cached._first()
    }, () => cached.rest())
  }

  dropWhile(asyncPredicate) {
    let streamCache
    let headFn = async () => {
      let val = await this._first()
      if (val === EOS) {
        return EOS
      }
      if (await asyncPredicate(val)) {
        streamCache = this.drop(1).dropWhile(asyncPredicate)
        return await streamCache._first()
      }

      return val
    }

    return new AsyncStream(headFn, async () => {
      if (streamCache) {
        return streamCache.drop(1)
      }
      return this.restLazy().dropWhile(asyncPredicate)
    })
  }

  filter(asyncPredicate) {
    let headPass, rest
    let headFn = async () => {
      let val = await this._first()
      headPass = await asyncPredicate(val)
      if (headPass) {
        return val
      }
      rest = this.restLazy().filter(asyncPredicate)
      return rest._first()
    }
    return new AsyncStream(headFn, async () => {
      return headPass
        ? this.drop(1).filter(asyncPredicate)
        : rest.drop(1).filter(asyncPredicate)
    })
  }

  map(asyncMapper) {
    let headFn = () => this._first().then(async v => v === EOS ? EOS : await asyncMapper(v))
    return new AsyncStream(headFn, async () => {
      let r = await this.rest()
      return r.map(asyncMapper)
    })
  }

  chunk(size = 1) {
    let rest = null
    return new AsyncStream(() => this._take(size, r => rest = r).toArray(), () => rest.chunk(size))
  }

  concat(s2) {
    return new AsyncStream(() => this._first().then(v => v === EOS ? s2._first() : v), async () => {
      if (EOS === await this._first()) {
        return await s2.rest()
      }
      return this.drop(1).concat(s2)
    })
  }

  flatMap(asyncMapper) {
    let adaptToStream = async val => {
      let v = await asyncMapper(val)
      if (v && (typeof v[Symbol.iterator] === 'function' || typeof v[Symbol.asyncIterator] === 'function')) {
        return AsyncStream.fromIterable(v)
      }
      return AsyncStream.fromIterable([v])
    }
    
    let headStream, headStreamHead, restFlatStream
    let headFn = async () => {
      let val = await this._first()
      if (val === EOS) {
        return EOS
      }
      headStream = await adaptToStream(val)
      headStreamHead = await headStream._first()

      if (headStreamHead === EOS) {
        restFlatStream = this.restLazy().flatMap(asyncMapper)
        return restFlatStream._first()
      } else {
        return headStreamHead
      }
    }

    return new AsyncStream(headFn, async () => {
      if (headStreamHead === EOS) {
        return restFlatStream.drop(1)
      }
      return headStream.restLazy().concat(this.restLazy().flatMap(asyncMapper))
    })
  }

  static fromIterator(iterator) {
    const head = iterator.next()
    let hp = Promise.resolve(head).then(({value, done}) => done ? EOS : value)
    return new AsyncStream(hp, async () => {
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

  static fromAsyncCallback(bufferedExecutor) {
    let buffer = [], notifyHasData = null
    bufferedExecutor(val => {
      buffer.push(val)
      if (notifyHasData) {
        notifyHasData()
        notifyHasData = null
      }
    })
    return AsyncStream.range().map(async i => {
      if (buffer.length === 0) {
        await new Promise(resolve => notifyHasData = resolve)
      }
      let v = buffer.shift()
      return v === null || v === undefined || v === EOS ? EOS : v
    })
  }

  async reduce(asyncReducer, init = undefined) {
    if (init === undefined) {
      let res = await this._first()
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

  async find(asyncPredicate) {
    return await this.dropWhile(async v => !await asyncPredicate(v)).first()
  }

  async forEach(asyncCallback) {
    let s = this
    let head = await s._first()
    while (head !== EOS) {
      await asyncCallback(head)
      s = await s.rest()
      head = await s._first()
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
