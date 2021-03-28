export class Emitter<T> {
	readonly cancelable: boolean;

	constructor(cancelable = false) {
		this.cancelable = cancelable;
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

		this.events = this.cancelable
			? this.events.filter((ev, i) => {
					if (isCanceled) {
						return true;
					}
					ctx.position = i;
					ev.call(ctx);
					isCanceled = ctx.canceled;
					return !ev.remove;
				})
			: this.events.filter((ev, i) => {
					ctx.canceled = false;
					ctx.position = i;
					ev.call(ctx);
					return !ev.remove;
				});

		return !isCanceled;
	}
}

export interface EventContext<T> {
	readonly value: T;
	position: number;
	canceled: boolean;
}

export type EventCallback<T> = (ctx: EventContext<T>) => void;
