import { ArgumentType, StringReader } from "../index.ts";

type StringType = "single_word" | "quotable_phrase" | "greedy_phrase";

export class StringArgumentType extends ArgumentType<string> {
    private type: StringType;

    constructor(type: StringType) {
        super();
        this.type = type;
    }

    getType(): StringType {
        return this.type;
    }

    parse(reader: StringReader): string {
        if (this.type === "greedy_phrase") {
            const text = reader.getRemaining();
            reader.setCursor(reader.getTotalLength());
            return text;
        } else if (this.type === "single_word") {
            return reader.readUnquotedString();
        } else {
            return reader.readString();
        }
    }
}

export function word(): StringArgumentType {
    return new StringArgumentType("single_word");
}

export function string(): StringArgumentType {
    return new StringArgumentType("quotable_phrase");
}

export function greedyString(): StringArgumentType {
    return new StringArgumentType("greedy_phrase");
}
