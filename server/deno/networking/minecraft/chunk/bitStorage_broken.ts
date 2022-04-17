

export class BitStorage {

	private static readonly INDEX_PARAMETERS = Uint32Array.from([-1, -1, 0, 0x80000000, 0, 0, 1431655765, 1431655765, 0, 0x80000000, 0, 1, 858993459, 858993459, 0, 715827882, 715827882, 0, 613566756, 613566756, 0, 0x80000000, 0, 2, 477218588, 477218588, 0, 429496729, 429496729, 0, 390451572, 390451572, 0, 357913941, 357913941, 0, 330382099, 330382099, 0, 306783378, 306783378, 0, 286331153, 286331153, 0, 0x80000000, 0, 3, 252645135, 252645135, 0, 238609294, 238609294, 0, 226050910, 226050910, 0, 214748364, 214748364, 0, 204522252, 204522252, 0, 195225786, 195225786, 0, 186737708, 186737708, 0, 178956970, 178956970, 0, 171798691, 171798691, 0, 165191049, 165191049, 0, 159072862, 159072862, 0, 153391689, 153391689, 0, 148102320, 148102320, 0, 143165576, 143165576, 0, 138547332, 138547332, 0, 0x80000000, 0, 4, 130150524, 130150524, 0, 126322567, 126322567, 0, 122713351, 122713351, 0, 119304647, 119304647, 0, 116080197, 116080197, 0, 113025455, 113025455, 0, 110127366, 110127366, 0, 107374182, 107374182, 0, 104755299, 104755299, 0, 102261126, 102261126, 0, 99882960, 99882960, 0, 97612893, 97612893, 0, 95443717, 95443717, 0, 93368854, 93368854, 0, 91382282, 91382282, 0, 89478485, 89478485, 0, 87652393, 87652393, 0, 85899345, 85899345, 0, 84215045, 84215045, 0, 82595524, 82595524, 0, 81037118, 81037118, 0, 79536431, 79536431, 0, 78090314, 78090314, 0, 76695844, 76695844, 0, 75350303, 75350303, 0, 74051160, 74051160, 0, 72796055, 72796055, 0, 71582788, 71582788, 0, 70409299, 70409299, 0, 69273666, 69273666, 0, 68174084, 68174084, 0, 0x80000000, 0, 5]);

    public readonly data: BigInt64Array;
    public readonly bitsPerEntry: number;
    public readonly size: number;

    private readonly maxValue: bigint;
    private readonly valuesPerLong: number;
	private readonly indexScale;
	private readonly indexOffset;
	private readonly indexShift;


    constructor(bitsPerEntry: number, size: number, data?: BigInt64Array) {
        if (bitsPerEntry < 1 || bitsPerEntry > 32) {
            throw "bitsPerEntry must be between 1 and 32, inclusive.";
        }

        this.bitsPerEntry = bitsPerEntry;
        this.size = size;

        this.maxValue = BigInt(0x1 << bitsPerEntry - 1);
        this.valuesPerLong = Math.floor(64 / bitsPerEntry);
        const expectedLength = Math.floor((size + this.valuesPerLong - 1) / this.valuesPerLong);
        if (data != null) {
            if (data.length != expectedLength) {
                throw "Expected " + expectedLength + " longs but got " + data.length + " longs";
            }
            this.data = data;
        } else {
            this.data = new BigInt64Array(expectedLength);
        }

		const i = 3 * (this.valuesPerLong - 1);
		this.indexScale = BitStorage.INDEX_PARAMETERS[i + 0];
		this.indexOffset = BitStorage.INDEX_PARAMETERS[i + 1];
		this.indexShift = BitStorage.INDEX_PARAMETERS[i + 2];
    }

    public get(index: number) {
        if (index < 0 || index > this.size) {
            throw new Error("Index bigger than max size! Index: " + index + " Max: " + this.size);
        }

		const cellIndex = this.cellIndex(index);
		const longVal = this.data[cellIndex];
        const bitIndex = this.bitIndex(index, cellIndex);
		return Number(longVal >> BigInt(bitIndex) & this.maxValue);
    }

    public set(index: number, value: number) {
        if (index < 0 || index > this.size) {
            throw new Error("Index bigger than max size! Index: " + index + " Max: " + this.size);
        }

        if (value < 0 || value > this.maxValue) {
            throw "Value cannot be outside of accepted range.";
        }

        const cellIndex = this.cellIndex(index);
		const longVal = this.data[cellIndex];

        const bitIndex = this.bitIndex(index, cellIndex);
		const bitIndexBig = BigInt(bitIndex);

		this.data[cellIndex] = longVal & ~(this.maxValue << bitIndexBig) | (BigInt(value) & this.maxValue) << bitIndexBig

    }

    public toIntArray(): number[] {
        const result = new Array(this.size);
        let index = 0;
		const bits = BigInt(this.bitsPerEntry)
		const max = BigInt(this.maxValue)
        for (let cell of this.data) {
            for (let bitIndex = 0; bitIndex < this.valuesPerLong; bitIndex++) {
                result[index++] = (cell & max);
                cell >>= bits;

                if (index >= this.size) {
                    return result;
                }
            }
        }

        return result;
    }

    private cellIndex(index: number): number {
        return Number(BigInt(index) * BigInt(this.indexScale) + BigInt(this.indexOffset) >> 32n >> BigInt(this.indexShift));
    }

    private bitIndex(index: number, cellIndex: number) {
        return (index - cellIndex * this.valuesPerLong) * this.bitsPerEntry;
    }
}