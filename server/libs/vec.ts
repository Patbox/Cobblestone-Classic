import { XYZ } from '../core/types.ts';

export function distCenter([x, y, z]: XYZ) {
	return Math.sqrt(x * x + y * y + z * z);
}

export function dist([x, y, z]: XYZ, [x2, y2, z2]: XYZ) {
	const rx = x - x2;
	const ry = y - y2;
	const rz = z - z2;

	return Math.sqrt(rx * rx + ry * ry + rz * rz);
}

export function subtract([x, y, z]: XYZ, [x2, y2, z2]: XYZ): XYZ {
	return [x - x2, y - y2, z - z2];
}

export function add([x, y, z]: XYZ, [x2, y2, z2]: XYZ): XYZ {
	return [x + x2, y + y2, z + z2];
}

export function equals([x, y, z]: XYZ, [x2, y2, z2]: XYZ): boolean {
	return x == x2 && y == y2 && z == z2;
}