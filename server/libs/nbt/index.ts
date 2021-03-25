import { Tag, TagType, Byte, Float, Int, Short, getTagType, TagObject } from './tag.ts';

export * from './tag.ts';

const textDecoder = new TextDecoder('utf-8');
const textEncoder = new TextEncoder();

export interface DecodeResult {
	name: string | null;
	value: Tag | null;
	length: number;
}

export interface DecodeOptions {
	/** Use ES6 `Map`s for compound tags instead of plain objects. */
	useMaps?: boolean;
	/** Whether the root tag has a name. */
	unnamed?: boolean;
}

/**
 * Decode a nbt tag from buffer.
 *
 * The result contains the decoded nbt value, the tag's name, if present,
 * and the length of how much was read from the buffer.
 */
export function decode(buffer: Uint8Array, options: DecodeOptions = {}): DecodeResult {
	const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

	const tagType = view.getUint8(0); // buffer.readUInt8(0)

	if (tagType == TagType.End) return { name: null, value: null, length: 1 };

	let name: string | null = null;
	let offset = 1;

	if (!options.unnamed) {
		const len = view.getUint16(offset); // buffer.readUInt16BE(offset)
		offset += 2;
		name = textDecoder.decode(buffer.subarray(offset, (offset += len))); //buffer.toString("utf-8", offset, offset += len)
	}

	const result = decodeTagValue(tagType, buffer, offset, !!options.useMaps);
	return { name, value: result.value, length: result.offset };
}

/**
 * Encode a nbt tag into a buffer.
 *
 * @param name Resulting tag will be unnamed if name is `null`.
 * @param tag If tag is `null`, only a zero byte is returned.
 */
export function encode(name: string | null, tag: Tag | null): Uint8Array {
	//let buffer = Buffer.alloc(1024), offset = 0
	let buffer = new Uint8Array(1024),
		offset = 0;
	const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

	// write tag type
	//offset = buffer.writeUInt8(tag == null ? TagType.End : getTagType(tag), offset)
	view.setUint8(offset, tag == null ? TagType.End : getTagType(tag));
	offset = offset + 1;

	// write tag name
	if (tag != null && name != null) ({ buffer, offset } = writeString(name, buffer, offset));

	// write tag value
	if (tag != null) ({ buffer, offset } = encodeTagValue(tag, buffer, offset));

	return buffer.slice(0, offset);
}

/** Encode a string with it's length prefixed as unsigned 16 bit integer */
function writeString(text: string, buffer: Uint8Array, offset: number) {
	//const data = Buffer.from(text)
	const data = textEncoder.encode(text);

	buffer = accommodate(buffer, offset, data.length + 2);
	//offset = buffer.writeUInt16BE(data.length, offset)
	const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

	view.setUint16(offset, data.length);
	offset = offset + 2;

	//data.copy(buffer, offset), offset += data.length;

	const sourceBuffer = data.subarray(0, data.length).subarray(0, Math.max(0, buffer.length - offset));

	if (!(sourceBuffer.length === 0)) {
		buffer.set(sourceBuffer, offset);
		offset += data.length;
	}

	return { buffer, offset };
}

/** Double the size of the buffer until the required amount is reached. */
function accommodate(buffer: Uint8Array, offset: number, size: number) {
	while (buffer.length < offset + size) {
		//buffer = Buffer.concat([buffer, new Uint8Array(buffer.length)]);

		const list = [buffer, new Uint8Array(buffer.length)];

		let totalLength = 0;
		for (const buf of list) {
			totalLength += buf.length;
		}

		const buffer2 = new Uint8Array(totalLength);
		let pos = 0;

		for (const item of list) {
			let buf: Uint8Array;
			if (!(item instanceof Uint8Array)) {
				buf = Uint8Array.from(item);
			} else {
				buf = item;
			}

			//buf.copy(buffer, pos);

			const sourceBuffer = buf.subarray(0, buf.length).subarray(0, Math.max(0, buffer2.length - pos));

			buffer2.set(sourceBuffer, pos);

			pos += buf.length;
		}

		buffer = buffer2;
	}

	return buffer;
}

function decodeTagValue(type: number, buffer: Uint8Array, offset: number, useMaps: boolean) {
	const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

	let value: Tag;
	switch (type) {
		case TagType.Byte:
			//value = new Byte(buffer.readInt8((offset += 1) - 1));
			value = new Byte(view.getInt8((offset += 1) - 1));
			break;
		case TagType.Short:
			//value = new Short(buffer.readInt16BE((offset += 2) - 2));
			value = new Short(view.getInt16((offset += 2) - 2));

			break;
		case TagType.Int:
			//value = new Int(buffer.readInt32BE((offset += 4) - 4));
			value = new Short(view.getInt32((offset += 4) - 4));

			break;
		case TagType.Long:
			{
				value = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).getBigInt64(offset);
				offset += 8;
			}
			break;
		case TagType.Float:
			//value = new Float(buffer.readFloatBE((offset += 4) - 4));
			value = new Float(view.getFloat32((offset += 4) - 4));

			break;
		case TagType.Double:
			//value = buffer.readDoubleBE((offset += 8) - 8);
			value = view.getFloat64((offset += 8) - 8);

			break;
		case TagType.ByteArray: {
			//const len = buffer.readUInt32BE(offset);
			const len = view.getUint32(offset);

			offset += 4;
			value = buffer.slice(offset, (offset += len));
			break;
		}
		case TagType.String: {
			//const len = buffer.readUInt16BE(offset);
			const len = view.getUint16(offset);

			//value = ((offset += 2), buffer.toString('utf-8', offset, (offset += len)));

			value = ((offset += 2), textDecoder.decode(buffer.subarray(offset, (offset += len))));

			break;
		}
		case TagType.List: {
			//const type = buffer.readUInt8(offset);
			//const len = buffer.readUInt32BE(offset + 1);
			const type = view.getUint8(offset);
			const len = view.getUint32(offset + 1);

			offset += 5;
			const items: Tag[] = [];
			for (let i = 0; i < len; i++) {
				({ value, offset } = decodeTagValue(type, buffer, offset, useMaps));
				items.push(value);
			}
			value = items;
			break;
		}
		case TagType.Compound: {
			const object = useMaps ? new Map() : {};
			while (true) {
				//const type = buffer.readUInt8(offset);
				const type = view.getUint8(offset);

				offset += 1;
				if (type == TagType.End) break;
				//const len = buffer.readUInt16BE(offset);
				const len = view.getUint16(offset);

				offset += 2;
				const name = textDecoder.decode(buffer.subarray(offset, (offset += len)));
				({ value, offset } = decodeTagValue(type, buffer, offset, useMaps));
				if (useMaps) (<Map<string, Tag>>object).set(name, value);
				else (<TagObject>object)[name] = value;
			}
			value = object;
			break;
		}
		case TagType.IntArray: {
			//const length = buffer.readUInt32BE(offset);
			const length = view.getUint32(offset);

			offset += 4;
			const array = (value = new Int32Array(length));
			for (let i = 0; i < length; i++) {
				//array[i] = buffer.readInt32BE(offset + i * 4);
				array[i] = view.getInt32(offset + i * 4);
			}
			offset += array.buffer.byteLength;
			break;
		}
		case TagType.LongArray: {
			//const length = buffer.readUInt32BE(offset);
			const length = view.getUint32(offset);

			offset += 4;
			const array = (value = new BigInt64Array(length));
			for (let i = 0; i < length; i++) {
				array[i] = view.getBigInt64(offset + i * 8);
			}
			offset += array.buffer.byteLength;
			break;
		}
		default:
			throw new Error(`Tag type ${type} (${offset} | ${offset.toString(16)}) not implemented`);
	}
	return { value: <Tag>value, offset };
}

function encodeTagValue(tag: Tag, buffer: Uint8Array, offset: number) {
	// since most of the data types are smaller than 8 bytes, allocate this amount
	buffer = accommodate(buffer, offset, 8);
	let view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

	if (tag instanceof Byte) {
		//offset = tag.value < 0 ? buffer.writeInt8(tag.value, offset) : buffer.writeUInt8(tag.value, offset);
		tag.value < 0 ? view.setInt8(offset, tag.value) : view.setUint8(offset, tag.value);

		offset = offset + 1;
	} else if (tag instanceof Short) {
		//offset = tag.value < 0 ? buffer.writeInt16BE(tag.value, offset, false) : buffer.writeUInt16BE(tag.value, offset, false);
		tag.value < 0 ? view.setInt16(offset, tag.value) : view.setUint16(offset, tag.value);

		offset = offset + 2;
	} else if (tag instanceof Int) {
		//offset = tag.value < 0 ? buffer.writeInt32BE(tag.value, offset) : buffer.writeUInt32BE(tag.value, offset);
		tag.value < 0 ? view.setInt32(offset, tag.value) : view.setUint32(offset, tag.value);

		offset = offset + 4;
	} else if (typeof tag == 'bigint') {
		view.setBigInt64(offset, tag);
		offset += 8;
	} else if (tag instanceof Float) {
		//offset = buffer.writeFloatBE(tag.value, offset);
		view.setFloat32(offset, tag.value);

		offset = offset + 4;
	} else if (typeof tag == 'number') {
		//offset = buffer.writeDoubleBE(tag, offset);
		view.setFloat64(offset, tag);

		offset = offset + 8;
	} else if (tag instanceof Uint8Array || tag instanceof Int8Array) {
		//offset = buffer.writeUInt32BE(tag.length, offset);
		view.setUint32(offset, tag.length);
		offset = offset + 4;

		buffer = accommodate(buffer, offset, tag.length);
		view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
		//(tag instanceof Buffer ? tag : Buffer.from(tag)).copy(buffer, offset);
		const sourceBuffer = tag.subarray(0, tag.length).subarray(0, Math.max(0, buffer.length - offset));

		if (!(sourceBuffer.length === 0)) {
			buffer.set(sourceBuffer, offset);
			offset += tag.length;
		}
	} else if (tag instanceof Array) {
		const type = tag.length > 0 ? getTagType(tag[0]) : TagType.End;
		//offset = buffer.writeUInt8(type, offset);
		view.setUint8(offset, type);
		offset = offset + 1;
		//offset = buffer.writeUInt32BE(tag.length, offset);
		view.setUint32(offset, tag.length);
		offset = offset + 4;
		for (const item of tag) {
			if (getTagType(item) != type) throw new Error('Odd tag type in list');
			({ buffer, offset } = encodeTagValue(item, buffer, offset));
		}
	} else if (typeof tag == 'string') {
		({ buffer, offset } = writeString(tag, buffer, offset));
	} else if (tag instanceof Int32Array) {
		//offset = buffer.writeUInt32BE(tag.length, offset);
		view.setInt32(offset, tag.length);
		offset = offset + 4;
		buffer = accommodate(buffer, offset, tag.byteLength);
		view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
		for (let i = 0; i < tag.length; i++) {
			//buffer.writeInt32BE(tag[i], offset + i * 4);
			view.setInt32(offset + i * 4, tag[i]);
		}
		offset += tag.byteLength;
	} else if (tag instanceof BigInt64Array) {
		//offset = buffer.writeUInt32BE(tag.length, offset);
		view.setUint32(offset, tag.length);
		offset = offset + 4;
		buffer = accommodate(buffer, offset, tag.byteLength);
		view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
		for (let i = 0; i < tag.length; i++) {
			view.setBigInt64(offset + i * 8, tag[i]);
		}
		offset += tag.byteLength;
	} else {
		for (const [key, value] of tag instanceof Map ? tag : Object.entries(tag).filter(([_, v]) => v != null)) {
			//offset = buffer.writeUInt8(getTagType(value!), offset);
			view.setUint8(offset, getTagType(value!));

			offset = offset + 1;
			({ buffer, offset } = writeString(key, buffer, offset));
			({ buffer, offset } = encodeTagValue(value!, buffer, offset));
			buffer = accommodate(buffer, offset, 1);
			view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
		}
		//offset = buffer.writeUInt8(0, offset);

		view.setUint8(offset, 0);
		offset = offset + 1;
	}

	return { buffer, offset };
}
