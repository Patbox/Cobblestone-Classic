import itemsData from './data/items.json' assert { type: "json" };
import blocksData from './data/blocks.json' assert { type: "json"};

export type MinimalData = { name: string, id: number }

export type Registry<T extends MinimalData> = { byName: {[i: string]: T}, byId: T[] }


function createData<T extends MinimalData>(array: T[]): Registry<T> {
	const data: Registry<T> = { byName: {}, byId: []};

	for (let i = 0; i < array.length; i++) {
		const obj = array[i];

		data.byName[obj.name] = obj;
		data.byId[obj.id] = obj;
	}

	return data;
}

type ArrayElement<ArrayType extends readonly unknown[]> = 
  ArrayType extends readonly (infer ElementType)[] ? ElementType : never;

export type BlockType = ArrayElement<typeof blocksData>;
export type ItemType = ArrayElement<typeof itemsData>;
export const items = createData<ItemType>(itemsData);
export const blocks = createData<BlockType>(blocksData);