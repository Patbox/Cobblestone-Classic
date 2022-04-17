// Port of https://github.com/GeyserMC/MCProtocolLib/tree/master/src/main/java/com/github/steveice10/mc/protocol/data/game/chunk

import { Nullable } from "../../../../core.ts";
import { getVarIntSize, PacketReader } from "../packet.ts";
import { PacketWriter } from "../packet.ts";
import { BitStorage } from "./bitStorage.ts";

export class PaletteType {
    static readonly BIOME = new PaletteType(1, 3, 64);
    static readonly CHUNK = new PaletteType(4, 8, 4096);

    public readonly minBitsPerEntry;
    public readonly maxBitsPerEntry;
    public readonly storageSize;

    constructor(minBitsPerEntry: number, maxBitsPerEntry: number, storageSize: number) {
        this.minBitsPerEntry = minBitsPerEntry;
        this.maxBitsPerEntry = maxBitsPerEntry;
        this.storageSize = storageSize;
    }
}

export interface Palette {
    /**
     * Gets the number of block states known by this palette.
     *
     * @return The palette's size.
     */
    size(): number;

    /**
     * Converts a block state to a storage ID. If the state has not been mapped,
     * the palette will attempt to map it, returning -1 if it cannot.
     *
     * @param state Block state to convert.
     * @return The resulting storage ID.
     */
    stateToId(state: number): number;

    /**
     * Converts a storage ID to a block state. If the storage ID has no mapping,
     * it will return a block state of 0.
     *
     * @param id Storage ID to convert.
     * @return The resulting block state.
     */
   idToState(state: number): number;
}

export class MapPalette implements Palette {
    private readonly maxId: number;

    private readonly _idToState: number[];
    private readonly _stateToId = new Map<number, number>();
    private nextId = 0;

    constructor(bitsPerEntry: number, inp?: PacketReader) {
		this.maxId = (1 << bitsPerEntry) - 1;

        this._idToState = new Array(this.maxId + 1);

		if (inp) {
        const paletteLength = inp.readVarInt();
        for (let i = 0; i < paletteLength; i++) {
            const state = inp.readVarInt();
            this._idToState[i] = state;
            if (!this._stateToId.has(state)) this._stateToId.set(state, i);
        }
        this.nextId = paletteLength;
	}
	}

    public size() {
        return this.nextId;
    }

    public stateToId(state: number) {
        let id = this._stateToId.get(state);
        if (id == null && this.size() < this.maxId + 1) {
            id = this.nextId++;
            this._idToState[id] = state;
            this._stateToId.set(state, id);
        }

        if (id != null) {
            return id;
        } else {
            return -1;
        }
    }

    public idToState(id: number) {
        if (id >= 0 && id < this.size()) {
            return this._idToState[id];
        } else {
            return 0;
        }
    }
}

export class GlobalPalette implements Palette {
    public size() {
        return 2**32;
    }

    public stateToId(state: number) {
        return state;
    }

    public idToState(id: number) {
        return id;
    }
}

export class ListPalette implements Palette {
    private readonly maxId: number;

    private readonly data: number[];
    private nextId = 0;


    constructor(bitsPerEntry: number, inp?: PacketReader) {
		this.maxId = (1 << bitsPerEntry) - 1;

        this.data = new Array(this.maxId + 1);

		if (inp) {
			const paletteLength = inp.readVarInt();
			for (let i = 0; i < paletteLength; i++) {
				this.data[i] = inp.readVarInt();
			}
			this.nextId = paletteLength;
		}
    }

    public size() {
        return this.nextId;
    }

    public stateToId(state: number) {
        let id = -1;
        for (let i = 0; i < this.nextId; i++) { // Linear search for state
            if (this.data[i] == state) {
                id = i;
                break;
            }
        }
        if (id == -1 && this.size() < this.maxId + 1) {
            id = this.nextId++;
            this.data[id] = state;
        }

        return id;
    }

    public idToState(id: number) {
        if (id >= 0 && id < this.size()) {
            return this.data[id];
        } else {
            return 0;
        }
    }
}

export class SingletonPalette implements Palette {
    private readonly state: number;

    constructor(val: number | PacketReader ) {
        this.state = (val instanceof PacketReader) ? val.readVarInt() : val;
    }

    public size() {
        return 1;
    }

    public stateToId(state: number) {
        if (this.state == state) {
            return 0;
        }
        return -1;
    }

    public idToState(id: number) {
        if (id == 0) {
            return this.state;
        }
        return 0;
    }
}

export class DataPalette {
    public static readonly GLOBAL_PALETTE_BITS_PER_ENTRY = 14;

    public palette: Palette;
    private storage: Nullable<BitStorage>;
    private readonly paletteType: PaletteType;
    private readonly globalPaletteBits: number;

    public static createForChunk(globalPaletteBits?: number): DataPalette {
        return DataPalette.createEmpty(PaletteType.CHUNK, globalPaletteBits == undefined ? this.GLOBAL_PALETTE_BITS_PER_ENTRY : globalPaletteBits);
    }

    public static createForBiome(globalPaletteBits: number) {
        return DataPalette.createEmpty(PaletteType.BIOME, globalPaletteBits);
    }

    public static createEmpty(paletteType: PaletteType, globalPaletteBits: number): DataPalette  {
        return new DataPalette(/*new ListPalette(paletteType.minBitsPerEntry)*/ new SingletonPalette(0),
                null/*new BitStorage(paletteType.minBitsPerEntry, paletteType.storageSize)*/, paletteType, globalPaletteBits);
    }

	constructor(palette: Palette, storage: Nullable<BitStorage>, paletteType: PaletteType, globalPaletteBits: number) {
		this.palette = palette;
		this.storage = storage;
		this.paletteType = paletteType;
		this.globalPaletteBits = globalPaletteBits;
	}

    /*public static read(inp: PacketReader, paletteType: PaletteType, globalPaletteBits: number) {
        const bitsPerEntry = inp.readByte();
        const palette = DataPalette.readPalette(paletteType, bitsPerEntry, inp);
        let storage: Nullable<BitStorage>;
        if (!(palette instanceof SingletonPalette)) {
            storage = new BitStorage(bitsPerEntry, paletteType.storageSize, BigInt64Array.from(inp.readLongArray()));
        } else {
            inp.readVarInt();
            storage = null;
        }

        return new DataPalette(palette, storage, paletteType, globalPaletteBits);
    }*/

    public static write(out: PacketWriter, palette: DataPalette) {
        if (palette.palette instanceof SingletonPalette) {
            out.writeByte(0); // Bits per entry
            out.writeVarInt(palette.palette.idToState(0));
            out.writeVarInt(0); // Data length
            return;
        }

		if (!palette.storage) {
			throw new Error("Something went wrong here")
		}

        out.writeByte(palette.storage.bitsPerValue);

        if (!(palette.palette instanceof GlobalPalette)) {
            const paletteLength = palette.palette.size();
            out.writeVarInt(paletteLength);
            for (let i = 0; i < paletteLength; i++) {
                out.writeVarInt(palette.palette.idToState(i));
            }
        }

		out.writeVarInt(palette.storage.getPacketSize())
        palette.storage.writeBuffer(out);
    }

	static writeSize(palette: DataPalette) {
		if (palette.palette instanceof SingletonPalette) {
            return 1 + getVarIntSize(0) + getVarIntSize(palette.palette.idToState(0));
        }

		if (!palette.storage) {
			throw new Error("Something went wrong here")
		}

		let size = 1;

        if (!(palette.palette instanceof GlobalPalette)) {
            const paletteLength = palette.palette.size();
            size += getVarIntSize(paletteLength);
            for (let i = 0; i < paletteLength; i++) {
                size += getVarIntSize(palette.palette.idToState(i));
            }
        }

		size += getVarIntSize(palette.storage.getPacketSize());

		return size + palette.storage.getPacketSize() * 8;
	}

    public get(x: number, y: number, z: number) {
        if (this.storage != null) {
            const id = this.storage.get(DataPalette.index(x, y, z));
            return this.palette.idToState(id);
        } else {
            return this.palette.idToState(0);
        }
    }

    /**
     * @return the old value present in the storage.
     */
    public set(x: number, y: number, z: number, state: number) {
        let id = this.palette.stateToId(state);
        if (id == -1) {
			const old = this.palette;
            this.resize();
            id = this.palette.stateToId(state);
			if (id == -1) {
				console.log(old)
				console.log(this.palette)

			}


        }

        if (this.storage != null) {
            const index = DataPalette.index(x, y, z);
            const curr = this.storage.get(index);
            this.storage.set(index, id);
            return curr;
        } else {
            // Singleton palette and the block has not changed because the palette hasn't resized
            return state;
        }
    }

    private static readPalette(paletteType: PaletteType, bitsPerEntry: number, inp: PacketReader) {
        if (bitsPerEntry > paletteType.maxBitsPerEntry) {
            return new GlobalPalette();
        }
        if (bitsPerEntry == 0) {
            return new SingletonPalette(inp);
        }
        if (bitsPerEntry <= paletteType.minBitsPerEntry) {
            return new ListPalette(bitsPerEntry, inp);
        } else {
            return new MapPalette(bitsPerEntry, inp);
        }
    }

    private sanitizeBitsPerEntry(bitsPerEntry: number) {
        if (bitsPerEntry <= this.paletteType.maxBitsPerEntry) {
            return Math.max(this.paletteType.minBitsPerEntry, bitsPerEntry);
        } else {
            return DataPalette.GLOBAL_PALETTE_BITS_PER_ENTRY;
        }
    }

    private resize() {
        const oldPalette = this.palette;
        const oldData = this.storage;

        const bitsPerEntry = this.sanitizeBitsPerEntry(oldPalette instanceof SingletonPalette ? 1 : (oldData?.bitsPerValue ?? 0) + 1);
        this.palette = DataPalette.createPalette(bitsPerEntry, this.paletteType);
        this.storage = new BitStorage(bitsPerEntry, this.paletteType.storageSize);

        if (oldPalette instanceof SingletonPalette) {
            this.palette.stateToId(oldPalette.idToState(0));
        } else {
            for (let i = 0; i < this.paletteType.storageSize; i++) {
                this.storage.set(i, this.palette.stateToId(oldPalette.idToState(oldData?.get(i) ?? 0)));
            }
        }
    }

    private static createPalette(bitsPerEntry: number, paletteType: PaletteType) {
        if (bitsPerEntry <= paletteType.minBitsPerEntry) {
            return new ListPalette(bitsPerEntry);
        } else if (bitsPerEntry <= paletteType.maxBitsPerEntry) {
            return new MapPalette(bitsPerEntry);
        } else {
            return new GlobalPalette();
        }
    }

    public static index(x: number, y: number, z: number) {
        return y << 8 | z << 4 | x;
    }
}