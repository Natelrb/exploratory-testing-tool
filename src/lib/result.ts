/**
 * Result type for explicit error handling
 * Replaces try-catch with explicit success/error handling
 */
export class Result<T, E = Error> {
  private constructor(
    private readonly _value?: T,
    private readonly _error?: E,
    private readonly _isOk: boolean = true
  ) {}

  static ok<T, E = Error>(value: T): Result<T, E> {
    return new Result<T, E>(value, undefined, true);
  }

  static error<T, E = Error>(error: E): Result<T, E> {
    return new Result<T, E>(undefined, error, false);
  }

  isOk(): boolean {
    return this._isOk;
  }

  isError(): boolean {
    return !this._isOk;
  }

  unwrap(): T {
    if (this.isError()) {
      throw new Error('Called unwrap on error result');
    }
    return this._value!;
  }

  unwrapOr(defaultValue: T): T {
    return this.isOk() ? this._value! : defaultValue;
  }

  getError(): E | undefined {
    return this._error;
  }

  map<U>(fn: (value: T) => U): Result<U, E> {
    return this.isOk()
      ? Result.ok(fn(this._value!))
      : Result.error(this._error!);
  }

  mapError<F>(fn: (error: E) => F): Result<T, F> {
    return this.isError()
      ? Result.error(fn(this._error!))
      : Result.ok(this._value!);
  }

  async match<U>(
    handlers: {
      ok: (value: T) => U | Promise<U>;
      error: (error: E) => U | Promise<U>;
    }
  ): Promise<U> {
    if (this.isOk()) {
      return handlers.ok(this._value!);
    }
    return handlers.error(this._error!);
  }
}
