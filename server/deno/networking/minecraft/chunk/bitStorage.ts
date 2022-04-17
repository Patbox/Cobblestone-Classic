import { PacketReader, PacketWriter } from '../packet.ts';

// https://github.com/PrismarineJS/prismarine-chunk/blob/master/src/pc/common/BitArrayNoSpan.js

function neededBits(value: number) {
	return 32 - Math.clz32(value);
}

export class BitStorage {
	data: Uint32Array;
	capacity: number;
	bitsPerValue: number;
	valuesPerLong: number;
	valueMask: number;
	constructor(bitsPerEntry: number, size: number, data?: Uint32Array) {
		// assert(options.bitsPerValue > 0, 'bits per value must at least 1')
		// assert(options.bitsPerValue <= 32, 'bits per value exceeds 32')

		const valuesPerLong = Math.floor(64 / bitsPerEntry);
		const bufferSize = Math.ceil(size / valuesPerLong) * 2;
		const valueMask = (1 << bitsPerEntry) - 1;

		this.data = data ? new Uint32Array(data) : new Uint32Array(bufferSize);
		this.capacity = size;
		this.bitsPerValue = bitsPerEntry;
		this.valuesPerLong = valuesPerLong;
		this.valueMask = valueMask;
	}

	toArray() {
		const array = [];
		for (let i = 0; i < this.capacity; i++) {
			array.push(this.get(i));
		}
		return array;
	}

	toLongArray() {
		const array = new BigInt64Array(this.data.length / 2);
		for (let i = 0; i < this.data.length / 2; i += 1) {
			array[i] = BigInt(this.data[i * 2 + 1]) << 32n | BigInt(this.data[i * 2] << 32) >> 32n;
		}
		return array;
	}

	getPacketSize() {
		return this.data.length / 2;
	}

	/*static fromLongArray(array: number[][], bitsPerValue: number) {
		const bitArray = new BitStorage(Math.floor(64 / bitsPerValue) * array.length, bitsPerValue);
		for (let i = 0; i < array.length; i++) {
			const j = i * 2;
			bitArray.data[j + 1] = array[i][0];
			bitArray.data[j] = array[i][1];
		}
		return bitArray;
	}*/

	get(index: number) {
		// assert(index >= 0 && index < this.capacity, 'index is out of bounds')

		const startLongIndex = Math.floor(index / this.valuesPerLong);
		const indexInLong = (index - startLongIndex * this.valuesPerLong) * this.bitsPerValue;
		if (indexInLong >= 32) {
			const indexInStartLong = indexInLong - 32;
			const startLong = this.data[startLongIndex * 2 + 1];
			return (startLong >>> indexInStartLong) & this.valueMask;
		}
		const startLong = this.data[startLongIndex * 2];
		const indexInStartLong = indexInLong;
		let result = startLong >>> indexInStartLong;
		const endBitOffset = indexInStartLong + this.bitsPerValue;
		if (endBitOffset > 32) {
			// Value stretches across multiple longs
			const endLong = this.data[startLongIndex * 2 + 1];
			result |= endLong << (32 - indexInStartLong);
		}
		return result & this.valueMask;
	}

	set(index: number, value: number) {
		// assert(index >= 0 && index < this.capacity, 'index is out of bounds')
		// assert(value <= this.valueMask, 'value does not fit into bits per value')

		const startLongIndex = Math.floor(index / this.valuesPerLong);
		const indexInLong = (index - startLongIndex * this.valuesPerLong) * this.bitsPerValue;
		if (indexInLong >= 32) {
			const indexInStartLong = indexInLong - 32;
			this.data[startLongIndex * 2 + 1] =
				((this.data[startLongIndex * 2 + 1] & ~(this.valueMask << indexInStartLong)) | ((value & this.valueMask) << indexInStartLong)) >>> 0;
			return;
		}
		const indexInStartLong = indexInLong;

		// Clear bits of this value first
		this.data[startLongIndex * 2] =
			((this.data[startLongIndex * 2] & ~(this.valueMask << indexInStartLong)) | ((value & this.valueMask) << indexInStartLong)) >>> 0;
		const endBitOffset = indexInStartLong + this.bitsPerValue;
		if (endBitOffset > 32) {
			// Value stretches across multiple longs
			this.data[startLongIndex * 2 + 1] =
				((this.data[startLongIndex * 2 + 1] & ~((1 << (endBitOffset - 32)) - 1)) | (value >> (32 - indexInStartLong))) >>> 0;
		}
	}

	resize(newCapacity: number) {
		const newArr = new BitStorage(this.bitsPerValue, newCapacity);
		for (let i = 0; i < Math.min(newCapacity, this.capacity); ++i) {
			newArr.set(i, this.get(i));
		}

		return newArr;
	}

	resizeTo(newBitsPerValue: number) {
		// assert(newBitsPerValue > 0, 'bits per value must at least 1')
		// assert(newBitsPerValue <= 32, 'bits per value exceeds 32')

		const newArr = new BitStorage(newBitsPerValue, this.capacity);
		for (let i = 0; i < this.capacity; ++i) {
			const value = this.get(i);
			if (neededBits(value) > newBitsPerValue) {
				throw new Error("existing value in BitArray can't fit in new bits per value");
			}
			newArr.set(i, value);
		}

		return newArr;
	}

	length() {
		return this.data.length / 2;
	}

	readBuffer(reader: PacketReader) {
		for (let i = 0; i < this.data.length; i += 2) {
			this.data[i + 1] = reader.readInt();
			this.data[i] = reader.readInt();
		}
		return this;
	}

	writeBuffer(writer: PacketWriter) {
		for (let i = 0; i < this.data.length; i += 2) {
			writer.writeUInt(this.data[i + 1]);
			writer.writeUInt(this.data[i]);
		}
		return this;
	}

	getBitsPerValue() {
		return this.bitsPerValue;
	}
}
