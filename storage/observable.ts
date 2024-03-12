import { EventEmitter } from "events"

import type { RecursivePartial } from "~typing"

export enum ObservableStorageEvent {
  StateUpdated = "StateUpdated"
}

export class ObservableStorage<
  T extends Record<string, any>
> extends EventEmitter {
  public constructor(private state: T = {} as T) {
    super()
  }

  public get(): T {
    return { ...this.state }
  }

  public set(updates: RecursivePartial<T>) {
    this.state = this.updatePartial(this.get(), updates)
    this.emit(ObservableStorageEvent.StateUpdated, this.get())
  }

  public subscribe(handler: (state: T) => void) {
    this.addListener(ObservableStorageEvent.StateUpdated, handler)
  }

  public unsubscribe(handler: (state: T) => void) {
    this.removeListener(ObservableStorageEvent.StateUpdated, handler)
  }

  private updatePartial<O extends Record<string, any>>(
    target: O,
    updates: RecursivePartial<O>
  ) {
    for (const [key, value] of Object.entries(updates)) {
      if (!(key in target)) {
        continue
      }
      if (value instanceof Object) {
        this.updatePartial(target[key], value)
      } else {
        target[key as keyof O] = value
      }
    }
    return target
  }
}
