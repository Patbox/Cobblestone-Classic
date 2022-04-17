import type { Holder } from '../types.ts';
import { World } from './world.ts';

export class Block {
	unbreakable: boolean;
	numId: number;
	type: BlockTypes;
	solid: boolean;
	placeable: boolean;
	passLight: boolean;
	tickable = false;

	constructor(id: number, placeable: boolean = true, type: BlockTypes = 'full', unbreakable: boolean = false, passLight = false) {
		this.numId = id;
		this.type = type;
		this.unbreakable = unbreakable;
		this.solid = type == 'full' || type == 'slab';
		this.placeable = placeable;
		this.passLight = passLight;
	}

	update(_world: World, _x: number, _y: number, _z: number, _lazy: boolean, _tick: bigint): boolean {
		return true;
	}
}

export class GrassBlock {
	unbreakable: boolean;
	numId: number;
	type: BlockTypes;
	solid: boolean;
	placeable: boolean;
	passLight: boolean;
	tickable = true;

	constructor(id: number, placeable: boolean = true) {
		this.numId = id;
		this.type = 'full';
		this.unbreakable = false;
		this.solid = true;
		this.placeable = placeable;
		this.passLight = false;
	}

	update(world: World, x: number, y: number, z: number, _lazy: boolean, _tick: bigint) {
		const upBlock = world.getBlock(x, y + 1, z);
		if (!upBlock?.passLight) {
			world.setBlockId(x, y, z, blocks.dirt.numId);
		} else {
			for (let u = 0; u < 4; u++) {
				const x2 = Math.floor((Math.random() - 0.5) * 6);
				const y2 = Math.floor((Math.random() - 0.5) * 4);
				const z2 = Math.floor((Math.random() - 0.5) * 6);

				const tmp = world.getBlock(x + x2, y + y2 + 1, z + z2);
				if (world.getBlockId(x + x2, y + y2, z + z2) == blocks.dirt.numId && (!tmp?.solid || tmp.passLight)) {
					world.setBlockId(x + x2, y + y2, z + z2, this.numId);
					break;
				}
			}
		}

		return true;
	}
}

export type BlockTypes = 'full' | 'fluid' | 'plant' | 'slab' | 'air';

export const blocks = {
	air: new Block(0, true, 'air', false, true),
	stone: new Block(1),
	grass: new GrassBlock(2),
	dirt: new Block(3),
	cobblestone: new Block(4),
	planks: new Block(5),
	sapling: new Block(6, true, 'plant', false, this),
	bedrock: new Block(7, false, 'full', true),
	flowingWater: new Block(8, false, 'fluid', false),
	water: new Block(9, false, 'fluid', false),
	flowingLava: new Block(10, false, 'fluid', false),
	lava: new Block(11, false, 'fluid', false),
	sand: new Block(12),
	gravel: new Block(13),
	goldOre: new Block(14),
	ironOre: new Block(15),
	coalOre: new Block(16),
	wood: new Block(17),
	leaves: new Block(18, true, 'full', false, true),
	sponge: new Block(19),
	glass: new Block(20, true, 'full', false, true),
	red: new Block(21),
	orange: new Block(22),
	yellow: new Block(23),
	lime: new Block(24),
	green: new Block(25),
	teal: new Block(26),
	aqua: new Block(27),
	cyan: new Block(28),
	blue: new Block(29),
	indigo: new Block(30),
	violet: new Block(31),
	magenta: new Block(32),
	pink: new Block(33),
	black: new Block(34),
	gray: new Block(35),
	white: new Block(36),
	dandelion: new Block(37, true, 'plant', false, true),
	rose: new Block(38, true, 'plant', false, true),
	brownMushroom: new Block(39, true, 'plant', false, true),
	redMushroom: new Block(40, true, 'plant', false, true),
	gold: new Block(41),
	iron: new Block(42),
	doubleSlab: new Block(43),
	slab: new Block(44),
	bricks: new Block(45),
	tnt: new Block(46),
	bookshelf: new Block(47),
	moss: new Block(48),
	obsidian: new Block(49),
};


export const blockIds = <{[Property in keyof typeof blocks]: number}>(() => {
	const obj: Holder<number> = {};

	for (const [a, b] of Object.entries(blocks)) {
		obj[a] = b.numId;
	}

	return obj;
})();

export const lastBlockId = blockIds.obsidian;

export const blocksIdsToName: Record<number, string> = {};

for (const x in blockIds) {
	blocksIdsToName[(<Holder<number>>blockIds)[x]] = x;
}
