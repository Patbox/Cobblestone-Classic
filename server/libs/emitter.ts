export class Emitter<T> {
	readonly cancelable: boolean;
	readonly errorHandler: EventErrorHandler<T>;

	constructor(cancelable = false, errorHandler:EventErrorHandler<T> = (_em, _ev, er) => console.error(er)) {
		this.cancelable = cancelable;
		this.errorHandler = errorHandler;
	}

	private events: {
		call: EventCallback<T>;
		remove: boolean;
	}[] = [];

	on(callback: EventCallback<T>) {
		this.events.push({ call: callback, remove: false });
	}

	once(callback: EventCallback<T>) {
		this.events.push({ call: callback, remove: true });
	}

	remove(callback: EventCallback<T>) {
		const x = this.events.findIndex((e) => e.call == callback);
		if (x != -1) {
			this.events.splice(x);
			return true;
		} else {
			return false;
		}
	}

	_emit(data: T): boolean {
		let isCanceled = false;

		const ctx: EventContext<T> = {
			value: data,
			canceled: false,
			position: 0,
		};

		let lastEvent: null | EventCallback<T> = null;

		try {
			this.events = this.cancelable
				? this.events.filter((ev, i) => {
						if (isCanceled) {
							return true;
						}
						ctx.position = i;
						lastEvent = ev.call;
						ev.call(ctx);
						isCanceled = ctx.canceled;
						return !ev.remove;
					})
				: this.events.filter((ev, i) => {
						ctx.canceled = false;
						ctx.position = i;
						lastEvent = ev.call;
						ev.call(ctx);
						return !ev.remove;
					});
		} catch (e) {
			this.errorHandler(this, lastEvent, e);
		}
		return !isCanceled;
	}
}

export type EventErrorHandler<T> = (emitter: Emitter<T>, event: EventCallback<T> | null, error: string) => void;

export interface EventContext<T> {
	readonly value: T;
	position: number;
	canceled: boolean;
}

export type EventCallback<T> = (ctx: EventContext<T>) => void;
