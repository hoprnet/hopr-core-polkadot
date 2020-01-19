import { Hash, Balance } from './srml_types'
import { Vec } from '@polkadot/types/codec'
import { ApiPromise } from '@polkadot/api'
import { EventRecord, Event } from '@polkadot/types/interfaces'
import UtilsClass from './utils'
const Utils = new UtilsClass()

export type EventHandler = (event: Event) => void

type SubscriptionArgs = Map<number, Uint8Array>
type EventSubscription = {
  args: SubscriptionArgs
  handlers: (EventHandler | undefined)[]
}

type ArgumentSelector = Map<string, EventSubscription[]>

type EventRegistry = {
  selectors?: Map<number, ArgumentSelector>
  handlers?: (EventHandler | undefined)[]
}

export class EventSignalling {
  registry: {
    [sectionMethod: string]: EventRegistry
  } = {}

  constructor(api: ApiPromise) {
    api.query.system.events((events: Vec<EventRecord>) => {
      events.forEach((record: EventRecord) => this.dispatch(record.event))
    })
  }

  dispatch(event: Event) {
    console.log(`Event ${event.data.section}.${event.data.method} - ${event.data.meta.documentation}`)
    let eventRegistry: EventRegistry = this.registry[`${event.data.section}.${event.data.method}`]

    if (eventRegistry != null) {
      eventRegistry.handlers?.forEach((handler: EventHandler | undefined) => handler != null && handler(event))

      eventRegistry.selectors?.forEach((selector: ArgumentSelector, index: number) => {
        // console.log('here', selector, index, event.data[0].toU8a().toString(), selector.get(event.data[index].toU8a().toString()))

        selector.get(event.data[index].toU8a().toString())?.forEach((subscription: EventSubscription) => {
          let ok = true
          subscription.args.forEach((value: Uint8Array, key: number) => {
            ok = ok && event.data[key].eq(value)
          })
          return (
            ok &&
            subscription.handlers.forEach((handler: EventHandler | undefined) => handler != null && handler(event))
          )
        })
      })
    }
  }

  on(eventSubscription: HoprEventSubscription, handler: EventHandler): () => void {
    let eventRegistry: EventRegistry = this.registry[eventSubscription.selector] || {}
    let handlerIndex: number
    let argumentNumber: number, argumentValue: Uint8Array

    if (eventSubscription.args != null) {
      let argsIterator = eventSubscription.args.entries()
      ;[argumentNumber, argumentValue] = argsIterator.next().value
      eventSubscription.args.delete(argumentNumber)

      eventRegistry.selectors = eventRegistry.selectors || new Map<number, ArgumentSelector>()
      let argumentSelector: ArgumentSelector | undefined = eventRegistry.selectors.get(argumentNumber)

      argumentSelector = argumentSelector || new Map<string, EventSubscription[]>()

      let subscriptions: EventSubscription[] | undefined = argumentSelector.get(argumentValue.toString())

      subscriptions = subscriptions || []

      let index = subscriptions.findIndex((subscription: EventSubscription) =>
        compareEventSubscriptions(subscription.args, eventSubscription.args)
      )
      if (index >= 0) {
        handlerIndex = subscriptions[index].handlers.push(handler)
      } else {
        handlerIndex = subscriptions.push({
          args: eventSubscription.args,
          handlers: [handler]
        })
      }

      argumentSelector.set(argumentValue.toString(), subscriptions)

      eventRegistry.selectors.set(argumentNumber, argumentSelector)
    } else {
      eventRegistry.handlers = eventRegistry.handlers || []

      handlerIndex = eventRegistry.handlers.push(handler)
    }

    this.registry[eventSubscription.selector] = eventRegistry

    return () => this.removeHandler(eventSubscription.selector, handlerIndex - 1, argumentNumber, argumentValue)
  }

  once(str: HoprEventSubscription, handler: EventHandler) {
    this.on(str, handler)()
  }

  private removeHandler(
    sectionMethod: string,
    handlerIndex: number,
    argumentNumber?: number,
    argumentValue?: Uint8Array,
    subscriptionArgs?: SubscriptionArgs
  ) {
    const eventRegistry = this.registry[sectionMethod]

    if (eventRegistry != null) {
      if (argumentNumber != null && argumentValue != null && subscriptionArgs != null) {
        eventRegistry.selectors
          ?.get(argumentNumber)
          ?.get(argumentValue.toString())
          ?.find((subscription: EventSubscription) => {
            let ok = true
            subscription.args.forEach((arg, index) => {
              ok = ok && Utils.compareArray(subscriptionArgs.get(index) || new Uint8Array([]), arg)
            })
            return ok
          })
          ?.handlers.splice(handlerIndex, 1, undefined)
      } else if (eventRegistry.handlers != null) {
        eventRegistry.handlers.splice(handlerIndex, 1, undefined)
      }
    }
  }
}

export type HoprEventSubscription = {
  selector: string
  args?: SubscriptionArgs
}

export function Opened(channelId?: Hash, balanceA?: Balance, balance?: Balance): HoprEventSubscription {
  if (channelId != null || balanceA != null || balance != null) {
    let args = new Map<number, Uint8Array>()

    if (channelId != null) {
      args.set(0, channelId.toU8a())
    }

    if (balanceA != null) {
      args.set(1, balanceA.toU8a())
    }

    if (balance != null) {
      args.set(2, balance.toU8a())
    }

    return {
      selector: `hopr.Opened`,
      args
    }
  }

  return {
    selector: `hopr.Opened`
  }
}

export function InitiatedSettlement(channelId: Hash, balanceA?: Balance): HoprEventSubscription {
  if (channelId != null || balanceA != null) {
    let args = new Map<number, Uint8Array>()

    if (channelId != null) {
      args.set(0, channelId.toU8a())
    }

    if (balanceA != null) {
      args.set(1, balanceA.toU8a())
    }

    return {
      selector: `hopr.InitiatedSettlement`,
      args
    }
  }

  return {
    selector: `hopr.InitiatedSettlement`
  }
}

export function PushedBackSettlement(channelId: Hash, balanceA?: Balance) {
  if (channelId != null || balanceA != null) {
    let args = new Map<number, Uint8Array>()

    if (channelId != null) {
      args.set(0, channelId.toU8a())
    }

    if (balanceA != null) {
      args.set(1, balanceA.toU8a())
    }

    return {
      selector: `hopr.PushedBackSettlement`,
      args
    }
  }

  return {
    selector: `hopr.PushedBackSettlement`
  }
}

function compareEventSubscriptions(a: SubscriptionArgs, b?: SubscriptionArgs) {
  if (b == null || a.size != b.size) {
    return false
  }

  let iterator = a.entries()
  let iteratorArg: { done?: boolean; value: [number, Uint8Array] }
  let argValue: Uint8Array | undefined

  do {
    iteratorArg = iterator.next()
    argValue = b.get(iteratorArg.value[0])

    if (argValue == null || !Utils.compareArray(argValue, iteratorArg.value[1])) {
      return false
    }
  } while (!iteratorArg.done)

  return true
}
