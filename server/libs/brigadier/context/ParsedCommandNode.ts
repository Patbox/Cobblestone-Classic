import { CommandNode, StringRange } from '../index.ts';

export class ParsedCommandNode<S> {
    private node: CommandNode<S>;
    private range: StringRange;
    
    constructor(node: CommandNode<S>, range: StringRange) {
        this.node = node;
        this.range = range;
    }

    getNode(): CommandNode<S> {
        return this.node;
    }

    getRange(): StringRange {
        return this.range;
    }
}
