export class Emitter<T> {
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
		};

		this.events = this.events.filter((x) => {
			if (isCanceled) {
				return true;
			}

			x.call(ctx);
			isCanceled = ctx.canceled;
			return !x.remove;
		});

		return !isCanceled;
	}
}

export interface EventContext<T> {
	readonly value: T;
	canceled: boolean;
}

export type EventCallback<T> = (ctx: EventContext<T>) => void;
