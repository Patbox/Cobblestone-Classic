
const textDecoder = new TextDecoder('us-ascii')
const textEncoder = new TextEncoder();

export class PacketReader {
	buffer: Uint8Array
	view: DataView
	pos: number;

	constructor(buffer: Uint8Array) {
		this.buffer = buffer;
		this.view = new DataView(buffer.buffer);
		this.pos = 0;
	}


	readByte(): number {
		const x = this.buffer[this.pos];
		this.pos = this.pos + 1;
		return x;
	}

	readShort(): number {
		const x = this.view.getInt16(this.pos);
		this.pos = this.pos + 2;
		return x;
	}

	readSByte(): number {
		const x = this.view.getInt8(this.pos);
		this.pos = this.pos + 1;
		return x;
	}

	readString(): string {
		const x = this.buffer.subarray(this.pos, this.pos + 64);
		this.pos = this.pos + 64;
		return textDecoder.decode(x).trimEnd();
	}

	readByteArray(): Uint8Array {
		const x = this.buffer.subarray(this.pos, this.pos + 1024);
		this.pos = this.pos + 1024;
		return x;
	}
}


export class PacketWriter {
	buffer: Uint8Array
	view: DataView
	pos: number;

	constructor(lenght: number = 4096) {
		this.buffer = new Uint8Array(lenght);
		this.view = new DataView(this.buffer.buffer);
		this.pos = 0;
	}


	writeByte(n: number) {
		this.buffer[this.pos] = n;
		this.pos = this.pos + 1;
	}

	writeShort(n: number) {
		this.view.setInt16(this.pos, n);
		this.pos = this.pos + 2;
	}

	writeSByte(n: number) {
		this.view.setInt8(this.pos, n);
		this.pos = this.pos + 1;
	}

	writeString(n: string) {
		const b = textEncoder.encode(n);

		if (b.length > 64) {
			throw 'Too long string!'
		}

		for (let x = 0; x < 64; x++) {
			this.buffer[this.pos + x] = b[x] ?? 0x20;
		}
		this.pos = this.pos + 64;
	}

	writeByteArray(n: Uint8Array) {
		for (let x = 0; x < 1024; x++) {
			this.buffer[this.pos + x] = n[x];
		}
		this.pos = this.pos + 1024;
	}
}