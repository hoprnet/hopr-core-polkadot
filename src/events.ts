import { Hash, Balance } from './srml_types'
import { Vec } from '@polkadot/types/codec'
import { ApiPromise } from '@polkadot/api'
import { EventRecord, Event } from '@polkadot/types/interfaces'

export type EventHandler = (event: Event) => void

export class EventSignalling {
  registry: { [sectionMethod: string]: EventHandler[] } = {}

  constructor(api: ApiPromise) {
    api.query.system.events((events: Vec<EventRecord>) =>
      events.forEach((record: EventRecord) => this.dispatch(record.event))
    )
  }

  dispatch(event: Event) {
    this.registry[`${event.section}:${event.method}`]?.forEach((handler: EventHandler) => handler(event))
    this.registry[`${event.section}:${event.method}(${event.data.join(',')})`]?.forEach((handler: EventHandler) =>
      handler(event)
    )
  }

  on(str: HoprEvent, handler: EventHandler): () => void {
    let index = 0

    if (Array.isArray(this.registry[str])) {
      index = this.registry[str].push(handler)
    } else {
      this.registry[str] = [handler]
    }

    return () => this.registry[str].splice(index, 1)
  }
}

export type HoprEvent = OpenedEvent | InitiatedSettlementEvent

export type OpenedEvent = string

export function Opened(channelId: Hash): OpenedEvent {
  return `hopr.Opened(${channelId.toString()})`
}

export type InitiatedSettlementEvent = string

export function InitiatedSettlement(channelId: Hash, balanceA: Balance): InitiatedSettlementEvent {
  return `hopr.InitiatedSettlement(${channelId.toString()},${balanceA.toString()})`
}
