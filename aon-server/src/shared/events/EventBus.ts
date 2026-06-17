import { DomainEventName, DomainEventPayloads } from "./DomainEvents";

type Handler<E extends DomainEventName> = (
    payload: DomainEventPayloads[E]
) => void | Promise<void>;

/**
 * EventBus (Singleton + Observer)
 *
 * The publish/subscribe backbone of the app. Services `publish` domain events;
 * subscribers (e.g. the realtime notifier) register `subscribe` handlers. This
 * is the Observer pattern: publishers and subscribers never reference each
 * other, so we can add new reactions without editing the code that emits.
 *
 * A failing subscriber is logged and isolated — it never breaks the publisher.
 */
class EventBus {
    private static instance: EventBus;
    private readonly handlers = new Map<DomainEventName, Set<Handler<DomainEventName>>>();

    private constructor() {}

    static getInstance(): EventBus {
        if (!EventBus.instance) {
            EventBus.instance = new EventBus();
        }
        return EventBus.instance;
    }

    subscribe<E extends DomainEventName>(event: E, handler: Handler<E>): void {
        if (!this.handlers.has(event)) {
            this.handlers.set(event, new Set());
        }
        this.handlers.get(event)!.add(handler as Handler<DomainEventName>);
    }

    publish<E extends DomainEventName>(event: E, payload: DomainEventPayloads[E]): void {
        const subscribers = this.handlers.get(event);
        if (!subscribers) return;

        for (const handler of subscribers) {
            try {
                void Promise.resolve(handler(payload)).catch((err) =>
                    console.error(`Event handler failed for "${event}":`, err)
                );
            } catch (err) {
                console.error(`Event handler threw for "${event}":`, err);
            }
        }
    }
}

export const eventBus = EventBus.getInstance();
