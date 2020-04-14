"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("./utils");
class EventSignalling {
    constructor(api) {
        this.registry = {};
        api.query.system.events((events) => {
            events.forEach((record) => this.dispatch(record.event));
        });
    }
    dispatch(event) {
        var _a, _b;
        console.log(`Event ${event.data.section}.${event.data.method} - ${event.data.meta.documentation}`);
        let eventRegistry = this.registry[`${event.data.section}.${event.data.method}`];
        if (eventRegistry != null) {
            (_a = eventRegistry.handlers) === null || _a === void 0 ? void 0 : _a.forEach((handler) => handler != null && handler(event));
            (_b = eventRegistry.selectors) === null || _b === void 0 ? void 0 : _b.forEach((selector, index) => {
                // console.log('here', selector, index, event.data[0].toU8a().toString(), selector.get(event.data[index].toU8a().toString()))
                var _a;
                (_a = selector.get(event.data[index].toU8a().toString())) === null || _a === void 0 ? void 0 : _a.forEach((subscription) => {
                    let ok = true;
                    subscription.args.forEach((value, key) => {
                        ok = ok && event.data[key].eq(value);
                    });
                    return (ok &&
                        subscription.handlers.forEach((handler) => handler != null && handler(event)));
                });
            });
        }
    }
    on(eventSubscription, handler) {
        let eventRegistry = this.registry[eventSubscription.selector] || {};
        let handlerIndex;
        let argumentNumber, argumentValue;
        if (eventSubscription.args != null) {
            let argsIterator = eventSubscription.args.entries();
            [argumentNumber, argumentValue] = argsIterator.next().value;
            eventSubscription.args.delete(argumentNumber);
            eventRegistry.selectors = eventRegistry.selectors || new Map();
            let argumentSelector = eventRegistry.selectors.get(argumentNumber);
            argumentSelector = argumentSelector || new Map();
            let subscriptions = argumentSelector.get(argumentValue.toString());
            subscriptions = subscriptions || [];
            let index = subscriptions.findIndex((subscription) => compareEventSubscriptions(subscription.args, eventSubscription.args));
            if (index >= 0) {
                handlerIndex = subscriptions[index].handlers.push(handler);
            }
            else {
                handlerIndex = subscriptions.push({
                    args: eventSubscription.args,
                    handlers: [handler],
                });
            }
            argumentSelector.set(argumentValue.toString(), subscriptions);
            eventRegistry.selectors.set(argumentNumber, argumentSelector);
        }
        else {
            eventRegistry.handlers = eventRegistry.handlers || [];
            handlerIndex = eventRegistry.handlers.push(handler);
        }
        this.registry[eventSubscription.selector] = eventRegistry;
        return () => this.removeHandler(eventSubscription.selector, handlerIndex - 1, argumentNumber, argumentValue);
    }
    once(str, handler) {
        this.on(str, handler)();
    }
    removeHandler(sectionMethod, handlerIndex, argumentNumber, argumentValue, subscriptionArgs) {
        var _a, _b, _c, _d;
        const eventRegistry = this.registry[sectionMethod];
        if (eventRegistry != null) {
            if (argumentNumber != null && argumentValue != null && subscriptionArgs != null) {
                (_d = (_c = (_b = (_a = eventRegistry.selectors) === null || _a === void 0 ? void 0 : _a.get(argumentNumber)) === null || _b === void 0 ? void 0 : _b.get(argumentValue.toString())) === null || _c === void 0 ? void 0 : _c.find((subscription) => {
                    let ok = true;
                    subscription.args.forEach((arg, index) => {
                        ok = ok && utils_1.u8aEquals(subscriptionArgs.get(index) || new Uint8Array([]), arg);
                    });
                    return ok;
                })) === null || _d === void 0 ? void 0 : _d.handlers.splice(handlerIndex, 1, undefined);
            }
            else if (eventRegistry.handlers != null) {
                eventRegistry.handlers.splice(handlerIndex, 1, undefined);
            }
        }
    }
}
exports.EventSignalling = EventSignalling;
function Opened(channelId, balanceA, balance) {
    if (channelId != null || balanceA != null || balance != null) {
        let args = new Map();
        if (channelId != null) {
            args.set(0, channelId.toU8a());
        }
        if (balanceA != null) {
            args.set(1, balanceA.toU8a());
        }
        if (balance != null) {
            args.set(2, balance.toU8a());
        }
        return {
            selector: `hopr.Opened`,
            args,
        };
    }
    return {
        selector: `hopr.Opened`,
    };
}
exports.Opened = Opened;
function InitiatedSettlement(channelId, balanceA) {
    if (channelId != null || balanceA != null) {
        let args = new Map();
        if (channelId != null) {
            args.set(0, channelId.toU8a());
        }
        if (balanceA != null) {
            args.set(1, balanceA.toU8a());
        }
        return {
            selector: `hopr.InitiatedSettlement`,
            args,
        };
    }
    return {
        selector: `hopr.InitiatedSettlement`,
    };
}
exports.InitiatedSettlement = InitiatedSettlement;
function PushedBackSettlement(channelId, balanceA) {
    if (channelId != null || balanceA != null) {
        let args = new Map();
        if (channelId != null) {
            args.set(0, channelId.toU8a());
        }
        if (balanceA != null) {
            args.set(1, balanceA.toU8a());
        }
        return {
            selector: `hopr.PushedBackSettlement`,
            args,
        };
    }
    return {
        selector: `hopr.PushedBackSettlement`,
    };
}
exports.PushedBackSettlement = PushedBackSettlement;
function compareEventSubscriptions(a, b) {
    if (b == null || a.size != b.size) {
        return false;
    }
    let iterator = a.entries();
    let iteratorArg;
    let argValue;
    do {
        iteratorArg = iterator.next();
        argValue = b.get(iteratorArg.value[0]);
        if (argValue == null || !utils_1.u8aEquals(argValue, iteratorArg.value[1])) {
            return false;
        }
    } while (!iteratorArg.done);
    return true;
}
