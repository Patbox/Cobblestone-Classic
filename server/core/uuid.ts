// Copyright 2018-2021 the Deno authors. All rights reserved. MIT license.
// Copyright 2022 Patbox. MIT license.

export const byteSize = 16;
export const empty = bytesToString(new Uint8Array(byteSize));

export function bytesToString(bytes: number[] | Uint8Array): string {
	const bits = [...bytes].map((bit) => {
		const s = bit.toString(16);
		return bit < 0x10 ? '0' + s : s;
	});
	return [...bits.slice(0, 4), '-', ...bits.slice(4, 6), '-', ...bits.slice(6, 8), '-', ...bits.slice(8, 10), '-', ...bits.slice(10, 16)].join('');
}

/**
 * Converts a string to a byte array by converting the hex value to a number.
 * @param uuid Value that gets converted.
 */
export function stringToBytes(uuid: string): Uint8Array {
	const bytes = new Uint8Array(byteSize);

	let i = 0;

	uuid.replace(/[a-fA-F0-9]{2}/g, (hex: string): string => {
		bytes[i++] = parseInt(hex, 16);
		return '';
	});

	return bytes;
}

