import { zlib } from '../../deps.ts';
import * as uuidUtils from '../../../core/uuid.ts';
import * as nbt from '../../../libs/nbt/index.ts';
import { XYZ } from '../../../core/types.ts';

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

export const classicTextRegex = /[^ -~]/gi;

export const writeVarInt = (n: number, byteConsumer: (n: number) => void) => {
	do {
		let temp = n & 0b01111111;
		n >>>= 7;
		if (n != 0) {
			temp |= 0b10000000;
		}
		byteConsumer(temp);
	} while (n != 0);
};

export const getVarIntSize = (n: number) => {
	let size = 0;
	do {
		n >>>= 7;
		size++;
	} while (n != 0);
	return size;
};

export const readVarInt = (byteProvider: () => number) => {
	let numRead = 0;
	let result = 0;
	let read;

	do {
		read = byteProvider();
		const value = read & 0b01111111;
		result |= value << (7 * numRead);

		numRead++;
		if (numRead > 5) {
			throw new Error('VarInt is too big');
		}
	} while ((read & 0b10000000) != 0);

	return result;
};

export class PacketReader {
	buffer: Uint8Array;
	view: DataView;
	pos: number;

	constructor(buffer: Uint8Array) {
		this.buffer = buffer;
		this.view = new DataView(buffer.buffer);
		this.pos = 0;
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

	readUUID(): string {
		return uuidUtils.bytesToString(this.readByteArray(uuidUtils.byteSize));
	}

	readPosition(): XYZ {
		const val = this.readLong();
		return [Number(val >> 38n), Number(val & 0xffn), Number((val >> 12n) & 0x3ffffffn)];
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

	readLongArray(): bigint[] {
		const array = [];
		let length = this.readVarInt();
		while (length-- > 0) {
			array.push(this.readLong());
		}

		return array;
	}

	readIntArray(): number[] {
		const array = [];
		let length = this.readVarInt();
		while (length-- > 0) {
			array.push(this.readInt());
		}

		return array;
	}

	atEnd() {
		return this.pos >= this.buffer.length;
	}
}

export class PacketWriter {
	buffer: Uint8Array;
	view: DataView;
	pos: number;

	constructor(lenght: number = 4096) {
		this.buffer = new Uint8Array(lenght);
		this.view = new DataView(this.buffer.buffer);
		this.pos = 0;
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

	writeUInt(n: number) {
		this.doubleSizeIfNeeded(4);

		this.view.setUint32(this.pos, n);
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

	writeIdentifier(channel: string) {
		// Todo: add validation
		this.writeString(channel);
		return this;
	}

	writeNbt(nbtData: nbt.TagObject) {
		this.writeByteArray(nbt.encode('', nbtData));
		return this;
	}

	writeUUID(uuid: string) {
		this.writeByteArray(uuidUtils.stringToBytes(uuid));
		return this;
	}

	writePosition(pos: XYZ) {
		const x = BigInt(pos[0]);
		const y = BigInt(pos[1]);
		const z = BigInt(pos[2]);

		this.writeLong(((x & 0x3ffffffn) << 38n) | ((z & 0x3ffffffn) << 12n) | (y & 0xfffn));
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

	writeLongArray(n: bigint[] | BigInt64Array) {
		const lenght = n.length;
		this.writeVarInt(lenght);
		for (let i = 0; i < lenght; i++) {
			this.writeLong(n[i]);
		}
	}

	writeIntArray(n: number[] | Uint32Array | Int32Array) {
		const lenght = n.length;
		this.writeVarInt(lenght);
		for (let i = 0; i < lenght; i++) {
			this.writeVarInt(n[i]);
		}
	}

	toPacket(compressed = false): Uint8Array {
		const tempArray = this.buffer.slice(0, this.pos);

		if (compressed) {
			const compressed = zlib.deflate(tempArray);

			const out = new Uint8Array(compressed.length + getVarIntSize(compressed.length + getVarIntSize(tempArray.length)) + getVarIntSize(tempArray.length));

			let pos = 0;

			writeVarInt(compressed.length + getVarIntSize(tempArray.length), (b) => (out[pos++] = b));
			writeVarInt(tempArray.length, (b) => (out[pos++] = b));

			out.set(compressed, pos);

			return out;
		} else {
			const out = new Uint8Array(this.pos + getVarIntSize(this.pos));

			let pos = 0;

			writeVarInt(this.pos, (b) => (out[pos++] = b));
			out.set(tempArray, pos);
			return out;
		}
	}

	toBuffer(): Uint8Array {
		return this.buffer.slice(0, this.pos);
	}
}

export class BitSet {
	words: bigint[];

	constructor(nbits: number) {
		this.words = [];

		let longs = Math.ceil(nbits / 64) 

		while (longs-- > 0) {
			this.words.push(0n);
		}
	}

	public set(index: number, val: boolean) {
		const w = this.wordIndex(index);
		const b = this.bitIndex(index);

		if (w >= this.words.length) {
			let x = w - this.words.length;

			while (x-- >= 0) {
				this.words.push(0n);
			}
		}

		if (val) {
			this.words[w] |= BigInt(0x1 << b);
		} else {
			this.words[w] ^= BigInt(0x1 << b);
		}
	}

	public get(index: number) {
		const w = this.wordIndex(index);
		const b = this.bitIndex(index);

		if (w >= this.words.length) {
			return false;
		}

		return ((this.words[w] >> BigInt(b)) & 0x1n) == 1n;
	}

	private wordIndex(index: number) {
		return Math.floor(index / 64);
	}

	private bitIndex(index: number) {
		return Math.floor(index % 64);
	}
}
