import { StringReader, NumberArgumentType, CommandSyntaxError } from "../index.ts";

export class LongArgumentType extends NumberArgumentType<BigInt> {

    private static readonly MIN = BigInt("-9223372036854775808")
    private static readonly MAX = BigInt("9223372036854775807")

    constructor(minimum = LongArgumentType.MIN, maximum = LongArgumentType.MAX) {
        super(minimum, maximum);
    }

    readNumber(reader: StringReader): BigInt {
        return reader.readLong();
    }

    getTooSmallError() {
        return CommandSyntaxError.LONG_TOO_SMALL;
    }

    getTooBigError() {
        return CommandSyntaxError.LONG_TOO_BIG;
    }
}
