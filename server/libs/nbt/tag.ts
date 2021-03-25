export enum TagType {
    End = 0,
    Byte = 1,
    Short = 2,
    Int = 3,
    Long = 4,
    Float = 5,
    Double = 6,
    ByteArray = 7,
    String = 8,
    List = 9,
    Compound = 10,
    IntArray = 11,
    LongArray = 12
}

export class Byte {
    constructor(public value: number) { }
    valueOf() { return this.value }
}

export class Short {
    constructor(public value: number) { }
    valueOf() { return this.value }
}

export class Int {
    constructor(public value: number) { }
    valueOf() { return this.value }
}

export class Float {
    constructor(public value: number) { }
    valueOf() { return this.value }
}

//export interface TagArray extends Array<Tag> { }
export interface TagObject { [key: string]: Tag | undefined | null }
//export interface TagMap extends Map<string, Tag> { }

export type Tag = number | string | bigint | Byte | Short | Int | Float | Uint8Array
    | Int8Array | Int32Array | BigInt64Array | Array<Tag> | TagObject | Map<string, Tag>

export function getTagType(tag: Tag): TagType {
    if (tag instanceof Byte) return TagType.Byte
    if (tag instanceof Short) return TagType.Short
    if (tag instanceof Int) return TagType.Int
    if (typeof tag == "bigint") return TagType.Long
    if (tag instanceof Float) return TagType.Float
    if (typeof tag == "number") return TagType.Double
    if (tag instanceof Uint8Array || tag instanceof Int8Array) return TagType.ByteArray
    if (typeof tag == "string") return TagType.String
    if (tag instanceof Array) return TagType.List
    if (tag.constructor == Object || tag instanceof Map) return TagType.Compound
    if (tag instanceof Int32Array) return TagType.IntArray
    if (tag instanceof BigInt64Array) return TagType.LongArray
    throw new Error("Invalid tag value")
}
