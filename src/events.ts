import { Hash, Balance } from './srml_types'
import { Vec } from '@polkadot/types/codec'
import { ApiPromise } from '@polkadot/api'
import { EventRecord, Event } from '@polkadot/types/interfaces'
import { compareArray } from './utils'

export type EventHandler = (event: Event) => void

type SubscriptionArgs = Map<number, Uint8Array>
type EventSubscription = {
  args: SubscriptionArgs
  handlers: EventHandler[]
}

type ArgumentSelector = Map<Uint8Array, EventSubscription[]>

type EventRegistry = {
  selectors?: Map<number, ArgumentSelector>
  handlers?: EventHandler[]
}

export class EventSignalling {
  registry: {
    [sectionMethod: string]: EventRegistry
  } = {}

  constructor(api: ApiPromise) {
    api.query.system.events((events: Vec<EventRecord>) =>
      events.forEach((record: EventRecord) => this.dispatch(record.event))
    )
  }

  dispatch(event: Event) {
    let eventRegistry: EventRegistry = this.registry[`${event.section}:${event.method}`]

    if (eventRegistry != null) {
      eventRegistry.handlers?.forEach((handler: EventHandler) => handler(event))

      eventRegistry.selectors?.forEach((selector: ArgumentSelector, index: number) => {
        selector.get(event.data[index].toU8a())?.forEach((subscription: EventSubscription) => {
          let ok = true
          subscription.args?.forEach((value: Uint8Array, key: number) => {
            ok = ok && event.data[key].eq(value)
          })
          return ok && subscription.handlers.forEach((handler: EventHandler) => handler(event))
        })
      })
    }
  }

  on(str: HoprEvent, handler: EventHandler, args?: SubscriptionArgs): () => void {
    let index = 0

    let eventRegistry: EventRegistry = this.registry[str] || {}

    if (args != null) {
      let argsIterator = args.entries()
      let [key, value]: [number, Uint8Array] = argsIterator.next().value
      args.delete(key)

      if (eventRegistry.selectors != null) {
        let argumentSelector: ArgumentSelector | undefined = eventRegistry.selectors.get(key)

        if (argumentSelector != null) {
          let subscriptions: EventSubscription[] | undefined = argumentSelector.get(value)

          if (subscriptions != null) {
            let index = subscriptions.findIndex((subscription: EventSubscription) =>
              compareEventSubscriptions(subscription.args, args)
            )
            if (index >= 0) {
              subscriptions[index].handlers.push(handler)
            } else {
              subscriptions.push({
                args,
                handlers: [handler]
              })
            }
          } else {
            subscriptions = [
              {
                args,
                handlers: [handler]
              }
            ]
          }
          argumentSelector.set(value, subscriptions)
        } else {
          argumentSelector = new Map<Uint8Array, EventSubscription[]>([[value, [{
            args,
            handlers: [handler]
          }]]])
        }
        eventRegistry.selectors.set(key, argumentSelector)
      } else {
        eventRegistry = {
          selectors: new Map<number, ArgumentSelector>([[key, new Map<Uint8Array, EventSubscription[]>([[value, [{
            args,
            handlers: [handler]
          }]]])]])
        }
      }
    } else {
      // @TODO
    }
    // @TODO
    // return () => this.registry[str].splice(index, 1)
    return () => {}
  }

  once(str: HoprEvent, handler: EventHandler) {
    this.on(str, handler)()
  }
}

export type HoprEvent = OpenedEvent | InitiatedSettlementEvent

export type OpenedEvent = string

export function Opened(channelId?: Hash, balanceA?: Balance, balance?: Balance): OpenedEvent {
  return `hopr.Opened(${channelId?.toString() || ''},${balanceA?.toString() || ''},${balance?.toString() || ''})`
}

export type InitiatedSettlementEvent = string

export function InitiatedSettlement(channelId: Hash, balanceA: Balance): InitiatedSettlementEvent {
  return `hopr.InitiatedSettlement(${channelId.toString()},${balanceA.toString()})`
}

function compareEventSubscriptions(a: SubscriptionArgs, b: SubscriptionArgs) {
  if (a.size != b.size) {
    return false
  }

  let iterator = a.entries()
  let iteratorArg: { done?: boolean; value: [number, Uint8Array] }
  let argValue: Uint8Array | undefined

  do {
    iteratorArg = iterator.next()
    argValue = b.get(iteratorArg.value[0])

    if (argValue == null || !compareArray(argValue, iteratorArg.value[1])) {
      return false
    }
  } while (!iteratorArg.done)

  return true
}
