import { PacketWriter } from "../packet.ts";
import { DataPalette } from './palette.ts';

export class ChunkSection {
    private static readonly AIR = 0;

    private blockCount: number;
    public chunkData: DataPalette;
    public biomeData: DataPalette;

    constructor(blockCount?: number, chunkData?: DataPalette, biomeData?: DataPalette) {
		this.blockCount = blockCount ?? 0;
		this.chunkData = chunkData ?? DataPalette.createForChunk();
		this.biomeData = biomeData ?? DataPalette.createForBiome(4);
    }

    /*public static read(inp: PacketReader, globalBiomePaletteBits: number) {
        const blockCount = inp.readShort();

        const chunkPalette = DataPalette.read(inp, PaletteType.CHUNK, DataPalette.GLOBAL_PALETTE_BITS_PER_ENTRY);
        const biomePalette = DataPalette.read(inp, PaletteType.BIOME, globalBiomePaletteBits);
        return new ChunkSection(blockCount, chunkPalette, biomePalette);
    }*/

    public static write(out: PacketWriter, section: ChunkSection) {
        out.writeShort(section.blockCount);
        DataPalette.write(out, section.chunkData);
        DataPalette.write(out, section.biomeData);
    }

	static writeSize(section: ChunkSection) {
		return 2 + DataPalette.writeSize(section.chunkData) + DataPalette.writeSize(section.biomeData);
	}

    public getBlock(x: number, y: number, z: number) {
        return this.chunkData.get(x, y, z);
    }

    public setBlock(x: number, y: number, z: number, state: number) {
        const curr = this.chunkData.set(x, y, z, state);
        if (state != ChunkSection.AIR && curr == ChunkSection.AIR) {
            this.blockCount++;
        } else if (state == ChunkSection.AIR && curr != ChunkSection.AIR) {
            this.blockCount--;
        }
    }

    public isBlockCountEmpty() {
        return this.blockCount == 0;
    }
}