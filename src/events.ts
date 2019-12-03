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

  on(eventSubscription: HoprEventSubscription, handler: EventHandler): () => void {
    let index = 0

    let eventRegistry: EventRegistry = this.registry[eventSubscription.selector] || {}

    if (eventSubscription.args != null) {
      let argsIterator = eventSubscription.args.entries()
      let [argumentName, argumentValue]: [number, Uint8Array] = argsIterator.next().value
      eventSubscription.args.delete(argumentName)

      if (eventRegistry.selectors != null) {
        let argumentSelector: ArgumentSelector | undefined = eventRegistry.selectors.get(argumentName)

        if (argumentSelector != null) {
          let subscriptions: EventSubscription[] | undefined = argumentSelector.get(argumentValue)

          if (subscriptions != null) {
            let index = subscriptions.findIndex((subscription: EventSubscription) =>
              compareEventSubscriptions(subscription.args, eventSubscription.args)
            )
            if (index >= 0) {
              subscriptions[index].handlers.push(handler)
            } else {
              subscriptions.push({
                args: eventSubscription.args,
                handlers: [handler]
              })
            }
          } else {
            subscriptions = [
              {
                args: eventSubscription.args,
                handlers: [handler]
              }
            ]
          }
          argumentSelector.set(argumentValue, subscriptions)
        } else {
          argumentSelector = new Map<Uint8Array, EventSubscription[]>([
            [
              argumentValue,
              [
                {
                  args: eventSubscription.args,
                  handlers: [handler]
                }
              ]
            ]
          ])
        }
        eventRegistry.selectors.set(argumentName, argumentSelector)
      } else {
        eventRegistry = {
          selectors: new Map<number, ArgumentSelector>([
            [
              argumentName,
              new Map<Uint8Array, EventSubscription[]>([
                [
                  argumentValue,
                  [
                    {
                      args: eventSubscription.args,
                      handlers: [handler]
                    }
                  ]
                ]
              ])
            ]
          ])
        }
      }
    } else {
      // @TODO
    }
    // @TODO
    // return () => this.registry[str].splice(index, 1)
    return () => {}
  }

  once(str: HoprEventSubscription, handler: EventHandler) {
    this.on(str, handler)()
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

    if (argValue == null || !compareArray(argValue, iteratorArg.value[1])) {
      return false
    }
  } while (!iteratorArg.done)

  return true
}
