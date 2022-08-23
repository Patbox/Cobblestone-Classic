import { StringReader, NumberArgumentType, CommandSyntaxError } from "../index.ts";

export class FloatArgumentType extends NumberArgumentType {

    constructor(minimum = -Infinity, maximum = Infinity) {
        super(minimum, maximum);
    }

    readNumber(reader: StringReader): number {
        return reader.readFloat();
    }

    getTooSmallError() {
        return CommandSyntaxError.FLOAT_TOO_SMALL;
    }

    getTooBigError() {
        return CommandSyntaxError.FLOAT_TOO_BIG;
    }
}
