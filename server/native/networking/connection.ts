import { ConnectionHandler } from '../../core/networking/connection.ts';

export class TpcConnectionHandler extends ConnectionHandler {
	_conn: Deno.Conn | null = null;
	_buffer: Uint8Array;

	constructor(conn: Deno.Conn) {
		super();

		this._conn = conn;
		this._buffer = new Uint8Array(4096);
		this.loop(conn);
		this.isConnected = true
	}

	async _send(packet: Uint8Array) {
		await this._conn?.write(packet);
	}

	protected async loop(conn: Deno.Conn): Promise<void> {
		for (;;) {
			const chunks = await this.read(conn);			
			if (chunks === null) break;

			this._clientPackets._decode(chunks);
		}

		this.close();
	}

	protected async read(conn: Deno.Conn): Promise<Uint8Array | null> {
		let read: number | null;

		try {
			read = await conn.read(this._buffer);
			if (read === null) return null;
		} catch (error) {
			return null;
		}

		const bytes = this._buffer.subarray(0, read);
		return bytes;
	}

	protected close(): void {
		if (this._conn === null) {
			return;
		}

		try {
			this._conn.close();
		} finally {
			this._conn = null;
			this.disconnect('');
		}
	}
}



