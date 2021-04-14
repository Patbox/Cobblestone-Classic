const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

export const classicTextRegex = /[^ -~]/gi;

export class PacketReader {
	buffer: Uint8Array;
	view: DataView;
	pos: number;
	compressed: boolean;
	readonly lenght: number;

	constructor(buffer: Uint8Array, compressed = false) {
		this.buffer = buffer;
		this.view = new DataView(buffer.buffer);
		this.pos = 0;
		this.compressed = compressed;
		this.lenght = this.readVarInt();
	}

	readBool(): boolean {
		const x = this.buffer[this.pos] == 0x01;
		this.pos += 1;
		return x;
	}

	readByte(): number {
		const x = this.view.getInt8(this.pos);
		this.pos += 1;
		return x;
	}

	readUByte(): number {
		const x = this.buffer[this.pos];
		this.pos += 1;
		return x;
	}

	readShort(): number {
		const x = this.view.getInt16(this.pos);
		this.pos += 2;
		return x;
	}

	readUShort(): number {
		const x = this.view.getUint16(this.pos);
		this.pos += 2;
		return x;
	}

	readInt(): number {
		const x = this.view.getInt32(this.pos);
		this.pos += 4;
		return x;
	}

	readLong(): bigint {
		const x = this.view.getBigInt64(this.pos);
		this.pos += 8;
		return x;
	}

	readFloat(): number {
		const x = this.view.getFloat32(this.pos);
		this.pos += 4;
		return x;
	}

	readDouble(): number {
		const x = this.view.getFloat64(this.pos);
		this.pos += 8;
		return x;
	}

	readString(): string {
		const x = this.readVarInt();
		const a = this.readByteArray(x);
		return textDecoder.decode(a);
	}

	readVarInt(): number {
		let numRead = 0;
		let result = 0;
		let read;

		do {
			read = this.readByte();
			const value = read & 0b01111111;
			result |= value << (7 * numRead);

			numRead++;
			if (numRead > 5) {
				throw new Error('VarInt is too big');
			}
		} while ((read & 0b10000000) != 0);

		return result;
	}

	readVarLong(): bigint {
		let numRead = 0n;
		let result = 0n;
		let read;
		do {
			read = BigInt(this.readByte());
			const value = read & 0b01111111n;
			result |= value << (7n * numRead);

			numRead++;
			if (numRead > 10) {
				throw new Error('VarLong is too big');
			}
		} while ((read & 0b10000000n) != 0n);

		return result;
	}

	readByteArray(n: number): Uint8Array {
		const x = this.buffer.slice(this.pos, this.pos + n);
		this.pos += n;
		return x;
	}
}

export class PacketWriter {
	buffer: Uint8Array;
	view: DataView;
	pos: number;
	readonly id: number;

	constructor(id: number, lenght: number = 4096) {
		this.buffer = new Uint8Array(lenght);
		this.view = new DataView(this.buffer.buffer);
		this.pos = 0;
		this.id = id;
		this.writeVarInt(id);
	}

	protected doubleSizeIfNeeded(n: number) {
		if (n + this.pos >= this.buffer.length) {
			const old = this.buffer;
			this.buffer = new Uint8Array(this.buffer.length * 2);
			this.buffer.set(old);
			this.view = new DataView(this.buffer.buffer);
		}
	}

	writeBool(n: boolean) {
		this.doubleSizeIfNeeded(1);
		this.buffer[this.pos] = n ? 0x01 : 0x00;
		this.pos += 1;
		return this;
	}

	writeByte(n: number) {
		this.doubleSizeIfNeeded(1);

		this.view.setInt8(this.pos, n);
		this.pos += 1;
		return this;
	}

	writeUByte(n: number) {
		this.doubleSizeIfNeeded(1);

		this.buffer[this.pos] = n;
		this.pos += 1;
		return this;
	}

	writeShort(n: number) {
		this.doubleSizeIfNeeded(2);

		this.view.setInt16(this.pos, n);
		this.pos += 2;
		return this;
	}

	writeUShort(n: number) {
		this.doubleSizeIfNeeded(2);

		this.view.setUint16(this.pos, n);
		this.pos += 2;
		return this;
	}

	writeInt(n: number) {
		this.doubleSizeIfNeeded(4);

		this.view.setInt32(this.pos, n);
		this.pos += 4;
		return this;
	}

	writeLong(n: bigint) {
		this.doubleSizeIfNeeded(8);

		this.view.setBigInt64(this.pos, n);
		this.pos += 8;
		return this;
	}

	writeFloat(n: number) {
		this.doubleSizeIfNeeded(4);

		this.view.setFloat32(this.pos, n);
		this.pos += 4;
		return this;
	}

	writeDouble(n: number) {
		this.doubleSizeIfNeeded(8);

		this.view.setFloat64(this.pos, n);
		this.pos += 8;
		return this;
	}

	writeString(n: string) {
		const a = textEncoder.encode(n);
		this.doubleSizeIfNeeded(a.length + 1);

		this.writeVarInt(a.length);
		this.writeByteArray(a);
		return this;
	}

	writeVarInt(n: number) {
		this.doubleSizeIfNeeded(5);

		do {
			let temp = n & 0b01111111;
			n >>>= 7;
			if (n != 0) {
				temp |= 0b10000000;
			}
			this.writeByte(temp);
		} while (n != 0);

		return this;
	}

	writeVarLong(n: bigint) {
		this.doubleSizeIfNeeded(10);

		do {
			let temp = n & 0b01111111n;
			n >>= 7n;
			if (n != 0n) {
				temp |= 0b10000000n;
			}
			this.writeByte(Number(temp));
		} while (n != 0n);

		return this;
	}

	writeByteArray(n: Uint8Array) {
		this.doubleSizeIfNeeded(n.length);

		for (let x = 0; x < n.length; x++) {
			this.buffer[this.pos + x] = n[x];
		}
		this.pos += n.length;
		return this;
	}

	toPacket(compressed = false): Uint8Array {
		const tempArray = this.buffer.slice(0, this.pos);

		if (compressed) {
			// Todo
			return tempArray;
		} else {
			const out = new Uint8Array(tempArray.length + 5);

			let n = tempArray.length;
			let pos = 0;

			do {
				let temp = n & 0b01111111;
				n >>>= 7;
				if (n != 0) {
					temp |= 0b10000000;
				}

				out[pos] = temp;
				pos += 1;
			} while (n != 0);

			out.set(tempArray, pos);
			this.pos += tempArray.length;

			return out.slice(0, this.pos);
		}
	}
}
