import { StringReader, NumberArgumentType, CommandSyntaxError } from "../index.ts";

export class IntegerArgumentType extends NumberArgumentType {

    constructor(minimum = -2147483648, maximum = 2147483647) {
        super(minimum, maximum);
    }

    readNumber(reader: StringReader): number {
        return reader.readInt();
    }
    
    getTooSmallError() {
        return CommandSyntaxError.INTEGER_TOO_SMALL;
    }

    getTooBigError() {
        return CommandSyntaxError.INTEGER_TOO_BIG;
    }
}
