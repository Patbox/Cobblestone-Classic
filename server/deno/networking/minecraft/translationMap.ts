import { Block, blocks as cBlocks } from "../../../core/world/blocks.ts";

import { blocks as blockMap, BlockType, items as itemMap, ItemType } from './registry.ts';

const blocks = blockMap.byName;
const items = itemMap.byName;

class Builder {
	cBlockToBlock: BlockType[] = []
	cBlockToBlockState: number[] = []
	blockToCBlock: Block[] = []
	blockToItem: ItemType[] = []
	itemToBlock: BlockType[] = []
	itemToCBlock: Block[] = []

	
	constructor() {}

	set(classicBlock: Block, block: BlockType, state: number, item: ItemType): Builder {
		this.cBlockToBlock[classicBlock.numId] = block;
		this.blockToCBlock[block.id] = classicBlock;
		this.itemToBlock[item.id] = block;
		this.itemToCBlock[item.id] = classicBlock;
		this.blockToItem[block.id] = item;
		this.cBlockToBlockState[classicBlock.numId] = block.minStateId + state;

		return this;
	}
}


const data = new Builder()
	.set(cBlocks.air, blocks.air, 0, items.air)
	.set(cBlocks.stone, blocks.stone, 0, items.stone)
	.set(cBlocks.grass, blocks.grass_block, 1, items.grass_block)
	.set(cBlocks.dirt, blocks.dirt, 0, items.dirt)
	.set(cBlocks.cobblestone, blocks.cobblestone, 0, items.cobblestone)
	.set(cBlocks.planks, blocks.oak_planks, 0, items.oak_planks)
	.set(cBlocks.sapling, blocks.oak_sapling, 0, items.oak_sapling)
	.set(cBlocks.bedrock, blocks.bedrock, 0, items.bedrock)
	.set(cBlocks.flowingWater, blocks.water, 14, items.water_bucket)
	.set(cBlocks.water, blocks.water, 15, items.water_bucket)
	.set(cBlocks.flowingLava, blocks.lava, 14, items.lava_bucket)
	.set(cBlocks.lava, blocks.lava, 15, items.lava_bucket)
	.set(cBlocks.sand, blocks.sand, 0, items.sand)
	.set(cBlocks.gravel, blocks.gravel, 0, items.gravel)
	.set(cBlocks.goldOre, blocks.gold_ore, 0, items.gold_ore)
	.set(cBlocks.ironOre, blocks.iron_ore, 0, items.iron_ore)
	.set(cBlocks.coalOre, blocks.coal_ore, 0, items.coal_ore)
	.set(cBlocks.wood, blocks.oak_log, 1, items.oak_log)
	.set(cBlocks.leaves, blocks.oak_leaves, 25, items.oak_leaves)
	.set(cBlocks.sponge, blocks.sponge, 0, items.sponge)
	.set(cBlocks.glass, blocks.glass, 0, items.glass)
	.set(cBlocks.red, blocks.red_wool, 0, items.red_wool)
	.set(cBlocks.orange, blocks.orange_wool, 0, items.orange_wool)
	.set(cBlocks.yellow, blocks.yellow_wool, 0, items.yellow_wool)
	.set(cBlocks.lime, blocks.lime_wool, 0, items.lime_wool)
	.set(cBlocks.green, blocks.lime_concrete, 0, items.lime_concrete)
	.set(cBlocks.teal, blocks.oxidized_copper, 0, items.oxidized_copper)
	.set(cBlocks.aqua, blocks.light_blue_wool, 0, items.light_blue_wool)
	.set(cBlocks.cyan, blocks.light_blue_concrete, 0, items.light_blue_concrete)
	.set(cBlocks.blue, blocks.cyan_wool, 0, items.cyan_wool)
	.set(cBlocks.indigo, blocks.purple_wool, 0, items.purple_wool)
	.set(cBlocks.violet, blocks.magenta_concrete, 0, items.magenta_concrete)
	.set(cBlocks.magenta, blocks.magenta_wool, 0, items.magenta_wool)
	.set(cBlocks.pink, blocks.pink_wool, 0, items.pink_wool)
	.set(cBlocks.black, blocks.gray_wool, 0, items.gray_wool)
	.set(cBlocks.gray, blocks.light_gray_wool, 0, items.light_gray_wool)
	.set(cBlocks.white, blocks.white_wool, 0, items.white_wool)
	.set(cBlocks.dandelion, blocks.dandelion, 0, items.dandelion)
	.set(cBlocks.rose, blocks.poppy, 0, items.poppy)
	.set(cBlocks.brownMushroom, blocks.brown_mushroom, 0, items.brown_mushroom)
	.set(cBlocks.redMushroom, blocks.red_mushroom, 0, items.red_mushroom)
	.set(cBlocks.gold, blocks.gold_block, 0, items.gold_block)
	.set(cBlocks.iron, blocks.iron_block, 0, items.iron_block)
	.set(cBlocks.doubleSlab, blocks.smooth_stone_slab, 5, items.smooth_stone)
	.set(cBlocks.slab, blocks.smooth_stone_slab, 3, items.smooth_stone_slab)
	.set(cBlocks.bricks, blocks.bricks, 0, items.bricks)
	.set(cBlocks.tnt, blocks.tnt, 0, items.tnt)
	.set(cBlocks.bookshelf, blocks.bookshelf, 0, items.bookshelf)
	.set(cBlocks.moss, blocks.mossy_cobblestone, 0, items.mossy_cobblestone)
	.set(cBlocks.obsidian, blocks.obsidian, 0, items.obsidian);

export const barrierId = blocks.barrier.minStateId;


export const cBlockToBlock = data.cBlockToBlock
export const cBlockToBlockState = data.cBlockToBlockState
export const blockToCBlock = data.blockToCBlock
export const blockToItem = data.blockToItem
export const itemToBlock = data.itemToBlock
export const itemToCBlock = data.itemToCBlock